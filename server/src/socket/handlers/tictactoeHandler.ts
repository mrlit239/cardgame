import { Server } from 'socket.io';
import { AuthenticatedSocket } from './authHandler';
import { TicTacToeEngine } from '../../games/TicTacToeEngine';
import { getInMemoryRoom } from './lobbyHandler';

// Store active TicTacToe games
const tictactoeGames: Map<string, TicTacToeEngine> = new Map();

export function setupTicTacToeHandlers(io: Server, socket: AuthenticatedSocket) {
    // Start a new TicTacToe game
    socket.on('tictactoe:start', async (callback?: (response: { success: boolean; message?: string }) => void) => {
        if (!socket.currentRoomId || !socket.userId) {
            return callback?.({ success: false, message: 'Not in a room' });
        }

        const roomId = socket.currentRoomId;

        try {
            const room = getInMemoryRoom(roomId);
            if (!room) {
                return callback?.({ success: false, message: 'Room not found' });
            }

            const players = room.players.map(p => ({ id: p.id, username: p.username }));

            if (players.length !== 2) {
                return callback?.({ success: false, message: `Need exactly 2 players. Currently have ${players.length}` });
            }

            // Create new game engine
            const engine = new TicTacToeEngine(players);
            tictactoeGames.set(roomId, engine);

            // Broadcast game start to all players in room
            const state = engine.getState();
            io.to(roomId).emit('tictactoe:started', state);

            console.log(`🎮 TicTacToe game started in room ${roomId} with players: ${players.map(p => p.username).join(', ')}`);
            callback?.({ success: true });
        } catch (error) {
            console.error('TicTacToe start error:', error);
            callback?.({ success: false, message: 'Failed to start game' });
        }
    });

    // Make a move
    socket.on('tictactoe:move', async (position: number, callback?: (response: { success: boolean; message?: string }) => void) => {
        if (!socket.currentRoomId || !socket.userId) return;

        const roomId = socket.currentRoomId;
        const engine = tictactoeGames.get(roomId);

        if (!engine) {
            return callback?.({ success: false, message: 'Game not found' });
        }

        const result = engine.makeMove(socket.userId, position);

        if (!result.success) {
            return callback?.({ success: false, message: result.message });
        }

        // Broadcast updated state to all players
        const state = engine.getState();
        io.to(roomId).emit('tictactoe:stateUpdate', state);

        if (state.isGameOver) {
            io.to(roomId).emit('tictactoe:gameOver', {
                winner: state.winner,
                isDraw: state.isDraw,
                winningLine: state.winningLine,
            });
            console.log(`🏆 TicTacToe game ended in room ${roomId}`);
        }

        callback?.({ success: true });
    });

    // Reset game
    socket.on('tictactoe:reset', async (callback?: (response: { success: boolean; message?: string }) => void) => {
        if (!socket.currentRoomId) return;

        const roomId = socket.currentRoomId;
        const engine = tictactoeGames.get(roomId);

        if (!engine) {
            return callback?.({ success: false, message: 'Game not found' });
        }

        engine.reset();
        const state = engine.getState();
        io.to(roomId).emit('tictactoe:stateUpdate', state);

        console.log(`🔄 TicTacToe game reset in room ${roomId}`);
        callback?.({ success: true });
    });

    // Leave game
    socket.on('tictactoe:leave', async () => {
        if (!socket.currentRoomId) return;

        const roomId = socket.currentRoomId;
        tictactoeGames.delete(roomId);

        io.to(roomId).emit('tictactoe:playerLeft', { playerId: socket.userId });
        console.log(`👋 Player ${socket.userId} left TicTacToe game in room ${roomId}`);
    });
}

// Export for cleanup
export function getTicTacToeGame(roomId: string) {
    return tictactoeGames.get(roomId);
}

export function deleteTicTacToeGame(roomId: string) {
    tictactoeGames.delete(roomId);
}
