import { Server } from 'socket.io';
import { AuthenticatedSocket } from './authHandler';
import { BaCayGame, BaCayState, BaCayResult } from '../../games/bacay';
import { batchUpdateCredits } from '../../utils/credits';

// Store active Ba Cay games
const activeGames = new Map<string, BaCayGame>();

export function setupBaCayHandler(io: Server, socket: AuthenticatedSocket) {
    // Start Ba Cay game
    socket.on('bacay:start', (data: { betAmount?: number }, callback: (response: { success: boolean; message?: string }) => void) => {
        const roomId = socket.currentRoomId;
        if (!roomId) {
            callback({ success: false, message: 'Not in a room' });
            return;
        }

        // Get all sockets in room
        const roomSockets = io.sockets.adapter.rooms.get(roomId);
        if (!roomSockets || roomSockets.size < 2) {
            callback({ success: false, message: 'Need at least 2 players' });
            return;
        }

        // Check max players (52 cards / 3 = 17, cap at 12)
        if (roomSockets.size > 12) {
            callback({ success: false, message: 'Maximum 12 players allowed' });
            return;
        }

        // Collect players
        const players: { id: string; username: string }[] = [];
        for (const socketId of roomSockets) {
            const s = io.sockets.sockets.get(socketId) as AuthenticatedSocket;
            if (s?.userId && s?.username) {
                players.push({ id: s.userId, username: s.username });
            }
        }

        if (players.length < 2) {
            callback({ success: false, message: 'Need at least 2 players' });
            return;
        }

        // Create game
        const betAmount = data.betAmount || 100;
        const game = new BaCayGame(roomId, players, betAmount);
        activeGames.set(roomId, game);

        // Start game and deal cards
        const state = game.startGame();

        // Send state to each player (with hidden cards for others)
        for (const socketId of roomSockets) {
            const s = io.sockets.sockets.get(socketId) as AuthenticatedSocket;
            if (s?.userId) {
                const playerState = game.getStateForPlayer(s.userId);
                s.emit('bacay:started', playerState);
            }
        }

        console.log(`🎴 Ba Cây game started in room ${roomId} with ${players.length} players`);
        callback({ success: true });
    });

    // Player reveals their hand
    socket.on('bacay:reveal', async (callback: (response: { success: boolean; message?: string }) => void) => {
        const roomId = socket.currentRoomId;
        if (!roomId) {
            callback({ success: false, message: 'Not in a room' });
            return;
        }

        const game = activeGames.get(roomId);
        if (!game) {
            callback({ success: false, message: 'No active game' });
            return;
        }

        if (!socket.userId) {
            callback({ success: false, message: 'Not authenticated' });
            return;
        }

        // Reveal player's hand
        const revealed = game.revealHand(socket.userId);
        if (!revealed) {
            callback({ success: false, message: 'Could not reveal hand' });
            return;
        }

        // Broadcast updated state
        const roomSockets = io.sockets.adapter.rooms.get(roomId);
        if (roomSockets) {
            for (const socketId of roomSockets) {
                const s = io.sockets.sockets.get(socketId) as AuthenticatedSocket;
                if (s?.userId) {
                    const playerState = game.getStateForPlayer(s.userId);
                    s.emit('bacay:stateUpdate', playerState);
                }
            }
        }

        // Check if game is finished
        if (game.isFinished()) {
            const results = game.getResults();
            io.to(roomId).emit('bacay:gameOver', { results, state: game.getState() });

            // Persist credits to database
            await batchUpdateCredits(
                results.map(r => ({
                    userId: r.playerId,
                    creditChange: r.creditsChange,
                    gameType: 'bacay' as const,
                    isWin: r.rank === 1
                }))
            );

            activeGames.delete(roomId);
            console.log(`🎴 Ba Cây game finished in room ${roomId}`);
        }

        callback({ success: true });
    });

    // Force reveal all (for host or timeout)
    socket.on('bacay:revealAll', async (callback: (response: { success: boolean; message?: string }) => void) => {
        const roomId = socket.currentRoomId;
        if (!roomId) {
            callback({ success: false, message: 'Not in a room' });
            return;
        }

        const game = activeGames.get(roomId);
        if (!game) {
            callback({ success: false, message: 'No active game' });
            return;
        }

        // Reveal all hands
        game.revealAllHands();

        // Broadcast final state
        const state = game.getState();
        const results = game.getResults();
        io.to(roomId).emit('bacay:stateUpdate', state);
        io.to(roomId).emit('bacay:gameOver', { results, state });

        // Persist credits to database
        await batchUpdateCredits(
            results.map(r => ({
                userId: r.playerId,
                creditChange: r.creditsChange,
                gameType: 'bacay' as const,
                isWin: r.rank === 1
            }))
        );

        activeGames.delete(roomId);
        console.log(`🎴 Ba Cây game force-revealed in room ${roomId}`);
        callback({ success: true });
    });

    // Leave game
    socket.on('bacay:leave', () => {
        const roomId = socket.currentRoomId;
        if (roomId) {
            // Just leave the room, game continues for others
            socket.leave(roomId);
            socket.currentRoomId = undefined;
            console.log(`🎴 Player ${socket.username} left Ba Cây room ${roomId}`);
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        // Cleanup handled by room system
    });
}

// Cleanup function for room deletion
export function cleanupBaCayGame(roomId: string): void {
    if (activeGames.has(roomId)) {
        activeGames.delete(roomId);
        console.log(`🎴 Ba Cây game cleaned up for room ${roomId}`);
    }
}
