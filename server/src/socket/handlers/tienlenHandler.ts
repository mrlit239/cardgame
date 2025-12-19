import { Server } from 'socket.io';
import { AuthenticatedSocket } from './authHandler';
import { TienLenEngine, TienLenConfig, TienLenVariant } from '../../games/TienLenEngine';
import { getInMemoryRoom } from './lobbyHandler';

// Store active Tiến Lên games
const tienlenGames: Map<string, TienLenEngine> = new Map();

export function setupTienLenHandlers(io: Server, socket: AuthenticatedSocket) {
    // Start a new Tiến Lên game
    socket.on('tienlen:start', async (config: { variant: TienLenVariant }, callback?: (response: { success: boolean; message?: string }) => void) => {
        if (!socket.currentRoomId || !socket.userId) {
            return callback?.({ success: false, message: 'Not in a room' });
        }

        const roomId = socket.currentRoomId;

        try {
            const room = getInMemoryRoom(roomId);
            if (!room) {
                return callback?.({ success: false, message: 'Room not found' });
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

            // Broadcast game start to all players in room
            io.to(roomId).emit('game:starting', { roomId, gameType: 'tienlen' });

            // Send personalized state to each player
            broadcastTienLenState(io, roomId, engine);

            console.log(`🎴 Tiến Lên (${config?.variant || 'south'}) started in room ${roomId} with players: ${players.map(p => p.username).join(', ')}`);
            callback?.({ success: true });
        } catch (error) {
            console.error('Tiến Lên start error:', error);
            callback?.({ success: false, message: 'Failed to start game' });
        }
    });

    // Play cards
    socket.on('tienlen:play', async (data: { cardIds: string[] }, callback?: (response: { success: boolean; message?: string }) => void) => {
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

        // Broadcast updated state to all players
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
            console.log(`🏆 Tiến Lên game ended in room ${roomId}`);
        }

        callback?.({ success: true });
    });

    // Pass turn
    socket.on('tienlen:pass', async (callback?: (response: { success: boolean; message?: string }) => void) => {
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

        // Broadcast updated state to all players
        broadcastTienLenState(io, roomId, engine);

        callback?.({ success: true });
    });

    // Get valid plays for current hand
    socket.on('tienlen:getValidPlays', (callback?: (response: { success: boolean; validPlays?: string[][] }) => void) => {
        if (!socket.currentRoomId || !socket.userId) return;

        const engine = tienlenGames.get(socket.currentRoomId);
        if (!engine) {
            return callback?.({ success: false });
        }

        const validPlays = engine.getValidPlays(socket.userId);
        callback?.({ success: true, validPlays });
    });

    // Leave game
    socket.on('tienlen:leave', async () => {
        if (!socket.currentRoomId) return;

        const roomId = socket.currentRoomId;
        tienlenGames.delete(roomId);

        io.to(roomId).emit('tienlen:playerLeft', { playerId: socket.userId });
        console.log(`👋 Player ${socket.userId} left Tiến Lên game in room ${roomId}`);
    });
}

// Broadcast game state to all players (each gets personalized view)
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
