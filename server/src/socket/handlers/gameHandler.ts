import { Server } from 'socket.io';
import { AuthenticatedSocket } from './authHandler';
import { createPhomGame, getPhomGame, startPhomGame, deletePhomGame } from '../../games';
import { Room } from '../../models';

export function setupGameHandlers(io: Server, socket: AuthenticatedSocket) {
    // Start game (called by lobbyHandler when game starts)
    socket.on('game:start', async () => {
        if (!socket.currentRoomId || !socket.userId) return;

        try {
            const room = await Room.findById(socket.currentRoomId);
            if (!room) return;

            // Only host can start
            if (room.hostId !== socket.userId) return;

            // Create and start the game
            const players = room.players.map(p => ({
                id: p.userId,
                username: p.username,
            }));

            const engine = createPhomGame(room._id.toString(), players);
            const gameState = engine.startGame();

            // Send initial state to all players (each gets their own view)
            for (const player of room.players) {
                const playerState = engine.getStateForPlayer(player.userId);
                io.to(player.socketId || '').emit('game:started', playerState as any);
            }

            // Notify whose turn it is
            const currentPlayer = engine.getCurrentPlayer();
            io.to(room.players.find(p => p.userId === currentPlayer.id)?.socketId || '')
                .emit('game:yourTurn');

            console.log(`🎮 Phom game started in room ${room.name}`);
        } catch (error) {
            console.error('Game start error:', error);
        }
    });

    // Draw card from deck
    socket.on('game:drawCard', () => {
        if (!socket.currentRoomId || !socket.userId) return;

        const engine = getPhomGame(socket.currentRoomId);
        if (!engine) return;

        const result = engine.drawCard(socket.userId);
        if (result.success) {
            // Send updated state to all players
            broadcastGameState(io, socket.currentRoomId, engine);

            // Notify the player of their drawn card
            socket.emit('game:cardDrawn', result.card);
        } else {
            socket.emit('game:error', result.error);
        }
    });

    // Take card from discard pile
    socket.on('game:takeCard', () => {
        if (!socket.currentRoomId || !socket.userId) return;

        const engine = getPhomGame(socket.currentRoomId);
        if (!engine) return;

        const result = engine.takeFromDiscard(socket.userId);
        if (result.success) {
            broadcastGameState(io, socket.currentRoomId, engine);
            socket.emit('game:cardDrawn', result.card);
        } else {
            socket.emit('game:error', result.error);
        }
    });

    // Discard a card
    socket.on('game:discardCard', (cardId: string) => {
        if (!socket.currentRoomId || !socket.userId) return;

        const engine = getPhomGame(socket.currentRoomId);
        if (!engine) return;

        const result = engine.discardCard(socket.userId, cardId);
        if (result.success) {
            const state = engine.getState();
            broadcastGameState(io, socket.currentRoomId, engine);

            if (state.status === 'finished') {
                // Game over
                io.to(socket.currentRoomId).emit('game:ended', {
                    winner: state.winner,
                    finalScores: Object.fromEntries(state.players.map(p => [p.id, p.score])),
                });
                deletePhomGame(socket.currentRoomId);
            } else {
                // Notify next player it's their turn
                notifyCurrentPlayer(io, socket.currentRoomId, engine);
            }
        } else {
            socket.emit('game:error', result.error);
        }
    });

    // Meld a phom
    socket.on('game:meldPhom', (cardIds: string[]) => {
        if (!socket.currentRoomId || !socket.userId) return;

        const engine = getPhomGame(socket.currentRoomId);
        if (!engine) return;

        const result = engine.meldPhom(socket.userId, cardIds);
        if (result.success) {
            broadcastGameState(io, socket.currentRoomId, engine);
        } else {
            socket.emit('game:error', result.error);
        }
    });

    // Leave game
    socket.on('game:leave', () => {
        if (!socket.currentRoomId || !socket.userId) return;

        const engine = getPhomGame(socket.currentRoomId);
        if (engine) {
            engine.playerDisconnected(socket.userId);
            broadcastGameState(io, socket.currentRoomId, engine);
        }
    });
}

// Broadcast game state to all players in the room
async function broadcastGameState(io: Server, roomId: string, engine: any) {
    try {
        const room = await Room.findById(roomId);
        if (!room) return;

        for (const player of room.players) {
            if (player.socketId) {
                const playerState = engine.getStateForPlayer(player.userId);
                io.to(player.socketId).emit('game:stateUpdate', playerState);
            }
        }
    } catch (error) {
        console.error('Broadcast error:', error);
    }
}

// Notify the current player it's their turn
async function notifyCurrentPlayer(io: Server, roomId: string, engine: any) {
    try {
        const room = await Room.findById(roomId);
        if (!room) return;

        const currentPlayer = engine.getCurrentPlayer();
        const playerSocket = room.players.find(p => p.userId === currentPlayer.id)?.socketId;
        if (playerSocket) {
            io.to(playerSocket).emit('game:yourTurn');
        }
    } catch (error) {
        console.error('Notify error:', error);
    }
}
