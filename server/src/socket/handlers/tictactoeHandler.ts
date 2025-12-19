import { Server } from 'socket.io';
import { AuthenticatedSocket } from './authHandler';
import { TicTacToeEngine } from '../../games/TicTacToeEngine';
import { getInMemoryRoom } from './lobbyHandler';
import { Room } from '../../models';
import { isDatabaseConnected } from '../../config/database';

// Store active TicTacToe games
const tictactoeGames: Map<string, TicTacToeEngine> = new Map();

export function setupTicTacToeHandlers(io: Server, socket: AuthenticatedSocket) {
    // Start a new TicTacToe game
    socket.on('tictactoe:start', async (callback?: (response: any) => void) => {
        if (!socket.currentRoomId || !socket.userId) return;

        const roomId = socket.currentRoomId;

        try {
            let players: { id: string; username: string }[] = [];

            if (isDatabaseConnected()) {
                const room = await Room.findById(roomId);
                if (!room) return callback?.({ success: false, message: 'Room not found' });

                players = room.players.map(p => ({ id: p.userId, username: p.username }));
            } else {
                const room = getInMemoryRoom(roomId);
                if (!room) return callback?.({ success: false, message: 'Room not found' });

                players = room.players.map(p => ({ id: p.userId, username: p.username }));
            }

            if (players.length !== 2) {
                return callback?.({ success: false, message: 'Need exactly 2 players' });
            }

            // Create new game engine
            const engine = new TicTacToeEngine(players);
            tictactoeGames.set(roomId, engine);

            // Broadcast game start to all players in room
            const state = engine.getState();
            io.to(roomId).emit('tictactoe:started', state);
            io.to(roomId).emit('game:starting', { roomId, gameType: 'tictactoe' });

            console.log(`🎮 TicTacToe game started in room ${roomId}`);
            callback?.({ success: true });
        } catch (error) {
            console.error('TicTacToe start error:', error);
            callback?.({ success: false, message: 'Failed to start game' });
        }
    });

    // Make a move
    socket.on('tictactoe:move', async (position: number, callback?: (response: any) => void) => {
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
    socket.on('tictactoe:reset', async (callback?: (response: any) => void) => {
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
