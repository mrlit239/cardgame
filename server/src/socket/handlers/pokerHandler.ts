import { Server } from 'socket.io';
import { AuthenticatedSocket } from './authHandler';
import { PokerEngine, PokerConfig, PokerAction } from '../../games/PokerEngine';
import { getInMemoryRoom } from './lobbyHandler';
import { getUserCredits, batchUpdateCredits } from '../../utils/credits';

// Store active Poker games
const pokerGames: Map<string, PokerEngine> = new Map();

// Track starting chips for credit calculation at end
const gameStartingChips: Map<string, Map<string, number>> = new Map();

export function setupPokerHandlers(io: Server, socket: AuthenticatedSocket) {
    // Start a new Poker game
    socket.on('poker:start', async (config: { smallBlind: number; bigBlind: number }, callback?: (response: { success: boolean; message?: string }) => void) => {
        if (!socket.currentRoomId || !socket.userId) {
            return callback?.({ success: false, message: 'Not in a room' });
        }

        const roomId = socket.currentRoomId;

        try {
            const room = getInMemoryRoom(roomId);
            if (!room) {
                return callback?.({ success: false, message: 'Room not found' });
            }

            // Fetch actual credits from database for each player
            const players = await Promise.all(
                room.players.map(async (p) => {
                    const credits = await getUserCredits(p.id);
                    return {
                        id: p.id,
                        username: p.username,
                        chips: credits, // Use real credits as chips
                    };
                })
            );

            if (players.length < 2 || players.length > 9) {
                return callback?.({ success: false, message: `Need 2-9 players. Currently have ${players.length}` });
            }

            // Check minimum credits for blinds
            const bigBlind = config?.bigBlind || 20;
            const playersWithInsufficientChips = players.filter(p => p.chips < bigBlind * 2);
            if (playersWithInsufficientChips.length > 0) {
                return callback?.({
                    success: false,
                    message: `Players ${playersWithInsufficientChips.map(p => p.username).join(', ')} have insufficient credits`
                });
            }

            const pokerConfig: PokerConfig = {
                smallBlind: config?.smallBlind || 10,
                bigBlind: bigBlind,
                startingChips: 0, // Not used since we set individual chips
            };

            // Store starting chips for end-of-game calculation
            const startingChipsMap = new Map<string, number>();
            players.forEach(p => startingChipsMap.set(p.id, p.chips));
            gameStartingChips.set(roomId, startingChipsMap);

            // Create new game engine
            const engine = new PokerEngine(players, pokerConfig);
            pokerGames.set(roomId, engine);

            // Start the first hand
            engine.startHand();

            // Broadcast game start to all players in room
            io.to(roomId).emit('game:starting', { roomId, gameType: 'poker' });

            // Send personalized state to each player
            broadcastPokerState(io, roomId, engine);

            console.log(`🎰 Poker game started in room ${roomId} with players: ${players.map(p => `${p.username}(${p.chips})`).join(', ')}`);
            callback?.({ success: true });
        } catch (error) {
            console.error('Poker start error:', error);
            callback?.({ success: false, message: 'Failed to start game' });
        }
    });

    // Player action
    socket.on('poker:action', async (data: { action: PokerAction; amount?: number }, callback?: (response: { success: boolean; message?: string }) => void) => {
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
    socket.on('poker:nextHand', async (callback?: (response: { success: boolean; message?: string }) => void) => {
        if (!socket.currentRoomId) return;

        const roomId = socket.currentRoomId;
        const engine = pokerGames.get(roomId);

        if (!engine) {
            return callback?.({ success: false, message: 'Game not found' });
        }

        if (!engine.canContinue()) {
            // Persist credits to database before ending
            const startingChipsMap = gameStartingChips.get(roomId);
            if (startingChipsMap) {
                const state = engine.getFullState();
                const updates = state.players.map(player => {
                    const startingChips = startingChipsMap.get(player.id) || 0;
                    const creditChange = player.chips - startingChips;
                    return {
                        userId: player.id,
                        creditChange,
                        gameType: 'poker' as const,
                        isWin: creditChange > 0
                    };
                });
                await batchUpdateCredits(updates);
                console.log(`💰 Poker credits persisted for room ${roomId}`);
            }
            gameStartingChips.delete(roomId);

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
    socket.on('poker:getActions', (callback?: (response: { success: boolean; actions?: unknown[]; message?: string }) => void) => {
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
function broadcastPokerState(io: Server, roomId: string, engine: PokerEngine) {
    const room = getInMemoryRoom(roomId);
    if (!room) return;

    for (const player of room.players) {
        if (player.socketId) {
            const personalizedState = engine.getStateForPlayer(player.id);
            io.to(player.socketId).emit('poker:stateUpdate', personalizedState);
        }
    }
}

// Export for cleanup
export function getPokerGame(roomId: string) {
    return pokerGames.get(roomId);
}

export function deletePokerGame(roomId: string) {
    pokerGames.delete(roomId);
}
