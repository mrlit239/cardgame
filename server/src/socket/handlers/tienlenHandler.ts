import { Server } from 'socket.io';
import { AuthenticatedSocket } from './authHandler';
import { TienLenEngine, TienLenConfig, TienLenVariant } from '../../games/TienLenEngine';
import { getInMemoryRoom } from './lobbyHandler';

// Store active Tiến Lên games
const tienlenGames: Map<string, TienLenEngine> = new Map();

export function setupTienLenHandlers(io: Server, socket: AuthenticatedSocket) {
    // Start game - HOST ONLY
    socket.on('tienlen:start', async (
        config: { variant: TienLenVariant },
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

            if (players.length < 2 || players.length > 4) {
                return callback?.({ success: false, message: `Need 2-4 players. Currently have ${players.length}` });
            }

            const gameConfig: TienLenConfig = {
                variant: config?.variant || 'south',
            };

            // Create new game engine
            const engine = new TienLenEngine(players, gameConfig);
            tienlenGames.set(roomId, engine);

            // Broadcast game config to all players first
            io.to(roomId).emit('tienlen:gameConfig', {
                variant: gameConfig.variant,
                hostId: room.hostId
            });

            // Broadcast game start
            io.to(roomId).emit('game:starting', { roomId, gameType: 'tienlen' });

            // Delay state broadcast to allow clients to mount game component
            setTimeout(() => {
                broadcastTienLenState(io, roomId, engine);
            }, 100);

            console.log(`🎴 Tiến Lên (${gameConfig.variant}) started in room ${roomId} by host ${socket.username}`);
            callback?.({ success: true });
        } catch (error) {
            console.error('Tiến Lên start error:', error);
            callback?.({ success: false, message: 'Failed to start game' });
        }
    });

    // Get current game state (for reconnection or initial load)
    socket.on('tienlen:getState', async (
        callback?: (response: { success: boolean; state?: ReturnType<TienLenEngine['getStateForPlayer']>; message?: string }) => void
    ) => {
        if (!socket.currentRoomId || !socket.userId) {
            return callback?.({ success: false, message: 'Not in a room' });
        }

        const engine = tienlenGames.get(socket.currentRoomId);
        if (!engine) {
            return callback?.({ success: false, message: 'Game not found' });
        }

        const state = engine.getStateForPlayer(socket.userId);
        callback?.({ success: true, state });
    });

    // Play cards
    socket.on('tienlen:play', async (
        data: { cardIds: string[] },
        callback?: (response: { success: boolean; message?: string }) => void
    ) => {
        if (!socket.currentRoomId || !socket.userId) return;

        const roomId = socket.currentRoomId;
        const engine = tienlenGames.get(roomId);

        if (!engine) {
            return callback?.({ success: false, message: 'Game not found' });
        }

        const result = engine.playCards(socket.userId, data.cardIds);

        if (!result.success) {
            return callback?.({ success: false, message: result.message });
        }

        // Broadcast updated state
        broadcastTienLenState(io, roomId, engine);

        const state = engine.getState();

        // Check if game ended
        if (state.phase === 'ended') {
            io.to(roomId).emit('tienlen:gameOver', {
                winners: state.winners,
                rankings: state.winners.map((id, idx) => ({
                    playerId: id,
                    position: idx + 1,
                    username: state.players.find(p => p.id === id)?.username
                }))
            });
            console.log(`🏆 Tiến Lên ended in room ${roomId}`);
        }

        callback?.({ success: true });
    });

    // Pass turn
    socket.on('tienlen:pass', async (
        callback?: (response: { success: boolean; message?: string }) => void
    ) => {
        if (!socket.currentRoomId || !socket.userId) return;

        const roomId = socket.currentRoomId;
        const engine = tienlenGames.get(roomId);

        if (!engine) {
            return callback?.({ success: false, message: 'Game not found' });
        }

        const result = engine.pass(socket.userId);

        if (!result.success) {
            return callback?.({ success: false, message: result.message });
        }

        // Broadcast updated state
        broadcastTienLenState(io, roomId, engine);

        callback?.({ success: true });
    });

    // Leave game
    socket.on('tienlen:leave', async () => {
        if (!socket.currentRoomId) return;

        const roomId = socket.currentRoomId;
        tienlenGames.delete(roomId);

        io.to(roomId).emit('tienlen:playerLeft', { playerId: socket.userId });
        console.log(`👋 Player ${socket.userId} left Tiến Lên in room ${roomId}`);
    });
}

// Broadcast personalized game state to each player
function broadcastTienLenState(io: Server, roomId: string, engine: TienLenEngine) {
    const room = getInMemoryRoom(roomId);
    if (!room) return;

    for (const player of room.players) {
        if (player.socketId) {
            const personalizedState = engine.getStateForPlayer(player.id);
            io.to(player.socketId).emit('tienlen:stateUpdate', personalizedState);
        }
    }
}

// Export for cleanup
export function getTienLenGame(roomId: string) {
    return tienlenGames.get(roomId);
}

export function deleteTienLenGame(roomId: string) {
    tienlenGames.delete(roomId);
}
