import { Server } from 'socket.io';
import { AuthenticatedSocket } from './authHandler';
import { UnoGame, UnoState, UnoColor } from '../../games/uno';
import { batchUpdateCredits } from '../../utils/credits';

// Store active UNO games
const activeGames = new Map<string, UnoGame>();

export function setupUnoHandler(io: Server, socket: AuthenticatedSocket) {
    // Start UNO game
    socket.on('uno:start', (data: { config?: Partial<{ stacking: boolean; forcePlay: boolean }> }, callback: (response: { success: boolean; message?: string }) => void) => {
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

        if (roomSockets.size > 10) {
            callback({ success: false, message: 'Maximum 10 players allowed' });
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
        const game = new UnoGame(roomId, players, data.config);
        activeGames.set(roomId, game);

        // Start game and deal cards
        game.startGame();

        // Send state to each player (with hidden cards for others)
        for (const socketId of roomSockets) {
            const s = io.sockets.sockets.get(socketId) as AuthenticatedSocket;
            if (s?.userId) {
                const playerState = game.getStateForPlayer(s.userId);
                s.emit('uno:started', playerState);
            }
        }

        callback({ success: true });
        console.log(`🎴 UNO game started in room ${roomId} with ${players.length} players`);
    });

    // Play a card
    socket.on('uno:play', async (data: { cardId: string; chosenColor?: UnoColor }, callback: (response: { success: boolean; message?: string; needsColorSelect?: boolean }) => void) => {
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

        const result = game.playCard(socket.userId!, data.cardId, data.chosenColor);

        if (!result.success) {
            callback(result);
            return;
        }

        if (result.needsColorSelect) {
            // Send color selection prompt
            socket.emit('uno:selectColor');
            callback(result);
            return;
        }

        // Broadcast updated state to all players
        await broadcastState(io, roomId, game);

        // Check if game ended
        if (game.isFinished()) {
            await handleGameEnd(io, roomId, game);
        }

        callback({ success: true });
    });

    // Select color after Wild
    socket.on('uno:selectColor', async (data: { color: UnoColor }, callback: (response: { success: boolean; message?: string }) => void) => {
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

        const result = game.selectColor(socket.userId!, data.color);

        if (!result.success) {
            callback(result);
            return;
        }

        // Broadcast updated state
        await broadcastState(io, roomId, game);

        // Check if game ended
        if (game.isFinished()) {
            await handleGameEnd(io, roomId, game);
        }

        callback({ success: true });
    });

    // Draw a card
    socket.on('uno:draw', async (callback: (response: { success: boolean; message?: string; mustPlay?: boolean }) => void) => {
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

        const result = game.drawCard(socket.userId!);

        if (!result.success) {
            callback({ success: false, message: result.message });
            return;
        }

        // Broadcast updated state
        await broadcastState(io, roomId, game);

        // If drawn card must be played
        if (result.drawnCard && result.message === 'Must play drawn card') {
            callback({ success: true, mustPlay: true });
        } else {
            callback({ success: true });
        }
    });

    // Call UNO
    socket.on('uno:callUno', (callback: (response: { success: boolean; message?: string }) => void) => {
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

        const result = game.callUno(socket.userId!);

        if (result.success) {
            // Broadcast UNO call
            io.to(roomId).emit('uno:unoCalled', { playerId: socket.userId, username: socket.username });
        }

        callback(result);
    });

    // Challenge missed UNO
    socket.on('uno:challengeUno', async (data: { targetId: string }, callback: (response: { success: boolean; message?: string }) => void) => {
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

        const result = game.challengeUno(socket.userId!, data.targetId);

        if (result.success) {
            // Broadcast challenge result
            io.to(roomId).emit('uno:unoChallenge', {
                challengerId: socket.userId,
                targetId: data.targetId,
                penalty: result.penalty,
                message: result.message
            });

            // Broadcast updated state
            await broadcastState(io, roomId, game);
        }

        callback(result);
    });

    // Leave game
    socket.on('uno:leave', () => {
        const roomId = socket.currentRoomId;
        if (roomId) {
            socket.leave(roomId);
            socket.currentRoomId = undefined;
            console.log(`🎴 Player ${socket.username} left UNO room ${roomId}`);
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        // Cleanup handled by room system
    });
}

// Broadcast state to all players
async function broadcastState(io: Server, roomId: string, game: UnoGame): Promise<void> {
    const roomSockets = io.sockets.adapter.rooms.get(roomId);
    if (!roomSockets) return;

    for (const socketId of roomSockets) {
        const s = io.sockets.sockets.get(socketId) as AuthenticatedSocket;
        if (s?.userId) {
            const playerState = game.getStateForPlayer(s.userId);
            s.emit('uno:stateUpdate', playerState);
        }
    }
}

// Handle game end
async function handleGameEnd(io: Server, roomId: string, game: UnoGame): Promise<void> {
    const results = game.getResults();
    io.to(roomId).emit('uno:gameOver', { results, state: game.getState() });

    // Persist credits to database
    const updatedCredits = await batchUpdateCredits(
        results.map(r => ({
            userId: r.playerId,
            creditChange: r.creditsChange,
            gameType: 'uno' as const,
            isWin: r.rank === 1
        }))
    );

    // Emit credits changed to each player's socket
    const roomSockets = io.sockets.adapter.rooms.get(roomId);
    if (roomSockets) {
        for (const socketId of roomSockets) {
            const s = io.sockets.sockets.get(socketId) as AuthenticatedSocket;
            if (s?.userId && updatedCredits.has(s.userId)) {
                s.emit('user:creditsChanged', { credits: updatedCredits.get(s.userId) });
                console.log(`💰 Emitted credits sync to ${s.username}: ${updatedCredits.get(s.userId)}`);
            }
        }
    }

    activeGames.delete(roomId);
    console.log(`🎴 UNO game finished in room ${roomId}`);
}

// Cleanup function for room deletion
export function cleanupUnoGame(roomId: string): void {
    if (activeGames.has(roomId)) {
        activeGames.delete(roomId);
        console.log(`🎴 UNO game cleaned up for room ${roomId}`);
    }
}
