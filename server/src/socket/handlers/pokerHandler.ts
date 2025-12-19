import { Server } from 'socket.io';
import { AuthenticatedSocket } from './authHandler';
import { PokerEngine, PokerConfig, PokerAction, PokerState } from '../../games/PokerEngine';
import { getInMemoryRoom } from './lobbyHandler';
import { Room } from '../../models';
import { isDatabaseConnected } from '../../config/database';

// Store active Poker games
const pokerGames: Map<string, PokerEngine> = new Map();

export function setupPokerHandlers(io: Server, socket: AuthenticatedSocket) {
    // Start a new Poker game
    socket.on('poker:start', async (config: { smallBlind: number; bigBlind: number }, callback?: (response: any) => void) => {
        if (!socket.currentRoomId || !socket.userId) return;

        const roomId = socket.currentRoomId;

        try {
            let players: { id: string; username: string; chips: number }[] = [];

            if (isDatabaseConnected()) {
                const room = await Room.findById(roomId);
                if (!room) return callback?.({ success: false, message: 'Room not found' });

                players = room.players.map(p => ({
                    id: p.userId,
                    username: p.username,
                    chips: 1000, // Starting chips
                }));
            } else {
                const room = getInMemoryRoom(roomId);
                if (!room) return callback?.({ success: false, message: 'Room not found' });

                players = room.players.map(p => ({
                    id: p.userId,
                    username: p.username,
                    chips: 1000, // Starting chips
                }));
            }

            if (players.length < 2 || players.length > 6) {
                return callback?.({ success: false, message: 'Need 2-6 players' });
            }

            const pokerConfig: PokerConfig = {
                smallBlind: config?.smallBlind || 10,
                bigBlind: config?.bigBlind || 20,
                startingChips: 1000,
            };

            // Create new game engine
            const engine = new PokerEngine(players, pokerConfig);
            pokerGames.set(roomId, engine);

            // Start the first hand
            engine.startHand();

            // Broadcast game start to all players in room
            io.to(roomId).emit('game:starting', { roomId, gameType: 'poker' });

            // Send personalized state to each player
            broadcastPokerState(io, roomId, engine);

            console.log(`🎰 Poker game started in room ${roomId}`);
            callback?.({ success: true });
        } catch (error) {
            console.error('Poker start error:', error);
            callback?.({ success: false, message: 'Failed to start game' });
        }
    });

    // Player action
    socket.on('poker:action', async (data: { action: PokerAction; amount?: number }, callback?: (response: any) => void) => {
        if (!socket.currentRoomId || !socket.userId) return;

        const roomId = socket.currentRoomId;
        const engine = pokerGames.get(roomId);

        if (!engine) {
            return callback?.({ success: false, message: 'Game not found' });
        }

        const result = engine.doAction(socket.userId, data.action, data.amount);

        if (!result.success) {
            return callback?.({ success: false, message: result.message });
        }

        // Broadcast updated state to all players
        broadcastPokerState(io, roomId, engine);

        const state = engine.getFullState();

        // Check if hand ended
        if (state.phase === 'ended') {
            io.to(roomId).emit('poker:handEnd', {
                winners: state.winners,
                pot: state.pot,
            });
            console.log(`🏆 Poker hand ended in room ${roomId}, winners: ${state.winners.join(', ')}`);
        }

        callback?.({ success: true });
    });

    // Start next hand
    socket.on('poker:nextHand', async (callback?: (response: any) => void) => {
        if (!socket.currentRoomId) return;

        const roomId = socket.currentRoomId;
        const engine = pokerGames.get(roomId);

        if (!engine) {
            return callback?.({ success: false, message: 'Game not found' });
        }

        if (!engine.canContinue()) {
            io.to(roomId).emit('poker:gameOver', { message: 'Not enough players to continue' });
            pokerGames.delete(roomId);
            return callback?.({ success: false, message: 'Game over' });
        }

        engine.startHand();
        broadcastPokerState(io, roomId, engine);

        console.log(`🎰 New poker hand started in room ${roomId}`);
        callback?.({ success: true });
    });

    // Get available actions
    socket.on('poker:getActions', (callback?: (response: any) => void) => {
        if (!socket.currentRoomId) return;

        const engine = pokerGames.get(socket.currentRoomId);
        if (!engine) {
            return callback?.({ success: false, message: 'Game not found' });
        }

        const actions = engine.getAvailableActions();
        callback?.({ success: true, actions });
    });

    // Leave game
    socket.on('poker:leave', async () => {
        if (!socket.currentRoomId) return;

        const roomId = socket.currentRoomId;
        const engine = pokerGames.get(roomId);

        if (engine) {
            // Fold the player if they're in a hand
            engine.doAction(socket.userId!, 'fold');
            broadcastPokerState(io, roomId, engine);
        }

        io.to(roomId).emit('poker:playerLeft', { playerId: socket.userId });
        console.log(`👋 Player ${socket.userId} left poker game in room ${roomId}`);
    });
}

// Broadcast game state to all players (each gets personalized view)
async function broadcastPokerState(io: Server, roomId: string, engine: PokerEngine) {
    try {
        let players: { id: string; socketId?: string }[] = [];

        if (isDatabaseConnected()) {
            const room = await Room.findById(roomId);
            if (!room) return;
            players = room.players.map(p => ({ id: p.userId, socketId: p.socketId }));
        } else {
            const room = getInMemoryRoom(roomId);
            if (!room) return;
            players = room.players.map(p => ({ id: p.userId, socketId: p.socketId }));
        }

        for (const player of players) {
            if (player.socketId) {
                const personalizedState = engine.getStateForPlayer(player.id);
                io.to(player.socketId).emit('poker:stateUpdate', personalizedState);
            }
        }
    } catch (error) {
        console.error('Broadcast poker state error:', error);
    }
}

// Export for cleanup
export function getPokerGame(roomId: string) {
    return pokerGames.get(roomId);
}

export function deletePokerGame(roomId: string) {
    pokerGames.delete(roomId);
}
