import { Server } from 'socket.io';
import { AuthenticatedSocket } from './authHandler';
import { DurakEngine, DurakConfig } from '../../games/DurakEngine';
import { getInMemoryRoom } from './lobbyHandler';

// Store active Durak games
const durakGames: Map<string, DurakEngine> = new Map();

export function setupDurakHandlers(io: Server, socket: AuthenticatedSocket) {
    // Start game - HOST ONLY
    socket.on('durak:start', async (
        config: Partial<DurakConfig>,
        callback?: (response: { success: boolean; message?: string }) => void
    ) => {
        if (!socket.currentRoomId || !socket.userId) {
            return callback?.({ success: false, message: 'Not in a room' });
        }

        const roomId = socket.currentRoomId;

        try {
            const room = getInMemoryRoom(roomId);
            if (!room) {
                return callback?.({ success: false, message: 'Room not found' });
            }

            // HOST ONLY CHECK
            if (room.hostId !== socket.userId) {
                return callback?.({ success: false, message: 'Only the host can start the game' });
            }

            const players = room.players.map(p => ({
                id: p.id,
                username: p.username,
            }));

            if (players.length < 2 || players.length > 6) {
                return callback?.({ success: false, message: `Need 2-6 players. Currently have ${players.length}` });
            }

            const gameConfig: DurakConfig = {
                deckSize: config?.deckSize || 52,
                handSize: config?.handSize || 6
            };

            // Create new game engine
            const engine = new DurakEngine(players, gameConfig);
            durakGames.set(roomId, engine);

            // Broadcast game start
            io.to(roomId).emit('game:starting', { roomId, gameType: 'durak' });

            // Send personalized state to each player (with delay for mounting)
            setTimeout(() => {
                broadcastDurakState(io, roomId, engine);
            }, 100);

            console.log(`🃏 Durak started in room ${roomId} by host ${socket.username}`);
            callback?.({ success: true });
        } catch (error) {
            console.error('Durak start error:', error);
            callback?.({ success: false, message: 'Failed to start game' });
        }
    });

    // Get current state (for reconnection)
    socket.on('durak:getState', async (
        callback?: (response: { success: boolean; state?: ReturnType<DurakEngine['getStateForPlayer']>; message?: string }) => void
    ) => {
        if (!socket.currentRoomId || !socket.userId) {
            return callback?.({ success: false, message: 'Not in a room' });
        }

        const engine = durakGames.get(socket.currentRoomId);
        if (!engine) {
            return callback?.({ success: false, message: 'Game not found' });
        }

        const state = engine.getStateForPlayer(socket.userId);
        callback?.({ success: true, state });
    });

    // Attack - play cards to attack
    socket.on('durak:attack', async (
        data: { cardIds: string[] },
        callback?: (response: { success: boolean; message?: string }) => void
    ) => {
        if (!socket.currentRoomId || !socket.userId) return;

        const roomId = socket.currentRoomId;
        const engine = durakGames.get(roomId);

        if (!engine) {
            return callback?.({ success: false, message: 'Game not found' });
        }

        const result = engine.attack(socket.userId, data.cardIds);

        if (!result.success) {
            return callback?.({ success: false, message: result.message });
        }

        // Broadcast updated state
        broadcastDurakState(io, roomId, engine);
        checkGameEnd(io, roomId, engine);

        callback?.({ success: true });
    });

    // Defend - beat an attack card
    socket.on('durak:defend', async (
        data: { attackCardId: string; defenseCardId: string },
        callback?: (response: { success: boolean; message?: string }) => void
    ) => {
        if (!socket.currentRoomId || !socket.userId) return;

        const roomId = socket.currentRoomId;
        const engine = durakGames.get(roomId);

        if (!engine) {
            return callback?.({ success: false, message: 'Game not found' });
        }

        const result = engine.defend(socket.userId, data.attackCardId, data.defenseCardId);

        if (!result.success) {
            return callback?.({ success: false, message: result.message });
        }

        // Broadcast updated state
        broadcastDurakState(io, roomId, engine);
        checkGameEnd(io, roomId, engine);

        callback?.({ success: true });
    });

    // Pick up - defender takes all cards
    socket.on('durak:pickup', async (
        callback?: (response: { success: boolean; message?: string }) => void
    ) => {
        if (!socket.currentRoomId || !socket.userId) return;

        const roomId = socket.currentRoomId;
        const engine = durakGames.get(roomId);

        if (!engine) {
            return callback?.({ success: false, message: 'Game not found' });
        }

        const result = engine.pickUp(socket.userId);

        if (!result.success) {
            return callback?.({ success: false, message: result.message });
        }

        // Broadcast updated state
        broadcastDurakState(io, roomId, engine);
        checkGameEnd(io, roomId, engine);

        callback?.({ success: true });
    });

    // Skip - attacker passes on adding more cards
    socket.on('durak:skip', async (
        callback?: (response: { success: boolean; message?: string }) => void
    ) => {
        if (!socket.currentRoomId || !socket.userId) return;

        const roomId = socket.currentRoomId;
        const engine = durakGames.get(roomId);

        if (!engine) {
            return callback?.({ success: false, message: 'Game not found' });
        }

        const result = engine.skipAttack(socket.userId);

        if (!result.success) {
            return callback?.({ success: false, message: result.message });
        }

        // Broadcast updated state
        broadcastDurakState(io, roomId, engine);
        checkGameEnd(io, roomId, engine);

        callback?.({ success: true });
    });

    // Leave game
    socket.on('durak:leave', async () => {
        if (!socket.currentRoomId) return;

        const roomId = socket.currentRoomId;
        durakGames.delete(roomId);

        io.to(roomId).emit('durak:playerLeft', { playerId: socket.userId });
        console.log(`👋 Player ${socket.userId} left Durak in room ${roomId}`);
    });
}

// Broadcast personalized game state to each player
function broadcastDurakState(io: Server, roomId: string, engine: DurakEngine) {
    const room = getInMemoryRoom(roomId);
    if (!room) return;

    for (const player of room.players) {
        if (player.socketId) {
            const personalizedState = engine.getStateForPlayer(player.id);
            io.to(player.socketId).emit('durak:stateUpdate', personalizedState);
        }
    }
}

// Check if game has ended
function checkGameEnd(io: Server, roomId: string, engine: DurakEngine) {
    const state = engine.getState();
    if (state.phase === 'ended') {
        // Find the durak (player still with cards)
        const durak = state.players.find(p => !p.isOut && p.hand.length > 0);

        io.to(roomId).emit('durak:gameOver', {
            winners: state.winners,
            durak: durak ? { id: durak.id, username: durak.username } : null
        });
        console.log(`🏆 Durak ended in room ${roomId}. Durak: ${durak?.username || 'None'}`);
    }
}

// Export for cleanup
export function getDurakGame(roomId: string) {
    return durakGames.get(roomId);
}

export function deleteDurakGame(roomId: string) {
    durakGames.delete(roomId);
}
