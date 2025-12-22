import { Server } from 'socket.io';
import { AuthenticatedSocket } from './authHandler';

// Simple, reliable in-memory room storage
export interface RoomPlayer {
    id: string;
    userId: string;  // Same as id, for backwards compatibility
    username: string;
    isReady: boolean;
    socketId: string;
    credits: number;
    avatar: string;
}

interface GameRoom {
    id: string;
    name: string;
    gameType: string;
    hostId: string;
    maxPlayers: number;
    players: RoomPlayer[];
    status: 'waiting' | 'playing' | 'finished';
    createdAt: Date;
}

// Global room storage
const rooms: Map<string, GameRoom> = new Map();
let roomCounter = 1;

// Get room for export
export function getInMemoryRoom(roomId: string): GameRoom | undefined {
    return rooms.get(roomId);
}

// Cleanup function for auth handler
export function cleanupUserRooms(userId: string): void {
    // Find and leave any rooms this user is in
    for (const [roomId, room] of rooms) {
        const playerIndex = room.players.findIndex(p => p.id === userId);
        if (playerIndex !== -1) {
            room.players.splice(playerIndex, 1);
            if (room.players.length === 0) {
                rooms.delete(roomId);
            } else if (room.hostId === userId) {
                room.hostId = room.players[0].id;
            }
        }
    }
}

// Format room for client
function formatRoomForClient(room: GameRoom) {
    return {
        id: room.id,
        _id: room.id,
        name: room.name,
        gameType: room.gameType,
        hostId: room.hostId,
        maxPlayers: room.maxPlayers,
        betAmount: 100, // Default bet amount
        players: room.players.map(p => ({
            id: p.id,
            username: p.username,
            isReady: p.isReady,
            isConnected: true,
            hand: [],
            score: 0,
            credits: p.credits || 1000,
            avatar: p.avatar || '😀',
        })),
        status: room.status,
        createdAt: room.createdAt,
    };
}

// Broadcast full room state to all players in room
function broadcastRoomState(io: Server, room: GameRoom) {
    const roomData = formatRoomForClient(room);
    io.to(room.id).emit('lobby:roomUpdated', roomData);
    io.emit('lobby:roomListUpdated', roomData);
    console.log(`📢 Broadcast room state: ${room.name} (${room.players.length} players)`);
}

export function setupLobbyHandlers(io: Server, socket: AuthenticatedSocket) {

    // Get all rooms
    socket.on('lobby:getRooms', (callback) => {
        try {
            const roomList = Array.from(rooms.values())
                .filter(r => r.status === 'waiting')
                .map(formatRoomForClient);
            callback(roomList);
        } catch (error) {
            console.error('getRooms error:', error);
            callback([]);
        }
    });

    // Create room
    socket.on('lobby:createRoom', async (data, callback) => {
        try {
            if (!socket.userId || !socket.username) {
                return callback({ success: false, message: 'Not authenticated' });
            }

            // Leave any existing room first
            if (socket.currentRoomId) {
                leaveRoom(io, socket);
            }

            const { name, gameType, maxPlayers } = data;

            // Validate max players
            let validMax = maxPlayers || 4;
            if (gameType === 'tictactoe') validMax = 2;
            else if (gameType === 'phom') validMax = Math.min(Math.max(validMax, 2), 4);
            else if (gameType === 'poker') validMax = Math.min(Math.max(validMax, 2), 6);
            else if (gameType === 'durak') validMax = Math.min(Math.max(validMax, 2), 6);

            const roomId = `room_${Date.now()}_${roomCounter++}`;

            const room: GameRoom = {
                id: roomId,
                name: name || `${socket.username}'s Room`,
                gameType,
                hostId: socket.userId,
                maxPlayers: validMax,
                players: [{
                    id: socket.userId,
                    userId: socket.userId,
                    username: socket.username,
                    isReady: false,
                    socketId: socket.id,
                    credits: (socket as unknown as { credits?: number }).credits || 1000,
                    avatar: (socket as unknown as { avatar?: string }).avatar || '😀',
                }],
                status: 'waiting',
                createdAt: new Date(),
            };

            rooms.set(roomId, room);

            // Join socket.io room
            socket.join(roomId);
            socket.currentRoomId = roomId;

            const clientRoom = formatRoomForClient(room);

            console.log(`✅ Room created: ${room.name} by ${socket.username} (${roomId})`);

            callback({ success: true, room: clientRoom });
            io.emit('lobby:roomCreated', clientRoom);

        } catch (error) {
            console.error('createRoom error:', error);
            callback({ success: false, message: 'Failed to create room' });
        }
    });

    // Join room
    socket.on('lobby:joinRoom', async (roomId: string, callback) => {
        try {
            if (!socket.userId || !socket.username) {
                return callback({ success: false, message: 'Not authenticated' });
            }

            const room = rooms.get(roomId);
            if (!room) {
                return callback({ success: false, message: 'Room not found' });
            }

            if (room.status !== 'waiting') {
                return callback({ success: false, message: 'Game already started' });
            }

            if (room.players.length >= room.maxPlayers) {
                return callback({ success: false, message: 'Room is full' });
            }

            // Leave current room first
            if (socket.currentRoomId && socket.currentRoomId !== roomId) {
                leaveRoom(io, socket);
            }

            // Check if already in room
            const existingPlayer = room.players.find(p => p.id === socket.userId);
            if (existingPlayer) {
                // Update socket ID
                existingPlayer.socketId = socket.id;
            } else {
                // Add new player
                room.players.push({
                    id: socket.userId,
                    userId: socket.userId,
                    username: socket.username,
                    isReady: false,
                    socketId: socket.id,
                    credits: (socket as unknown as { credits?: number }).credits || 1000,
                    avatar: (socket as unknown as { avatar?: string }).avatar || '😀',
                });
            }

            // Join socket.io room
            socket.join(roomId);
            socket.currentRoomId = roomId;

            const clientRoom = formatRoomForClient(room);

            console.log(`✅ Player joined: ${socket.username} -> ${room.name} (${room.players.length}/${room.maxPlayers})`);

            // Send success to joining player FIRST
            callback({ success: true, room: clientRoom });

            // Then broadcast to everyone in room (including host)
            broadcastRoomState(io, room);

            // Also emit player joined event
            io.to(roomId).emit('lobby:playerJoined', {
                roomId,
                player: { id: socket.userId, username: socket.username }
            });

        } catch (error) {
            console.error('joinRoom error:', error);
            callback({ success: false, message: 'Failed to join room' });
        }
    });

    // Leave room
    socket.on('lobby:leaveRoom', () => {
        leaveRoom(io, socket);
    });

    // Toggle ready
    socket.on('lobby:ready', () => {
        if (!socket.currentRoomId || !socket.userId) return;

        const room = rooms.get(socket.currentRoomId);
        if (!room) return;

        const player = room.players.find(p => p.id === socket.userId);
        if (player) {
            player.isReady = !player.isReady;

            console.log(`🎯 Player ${socket.username} ready: ${player.isReady}`);

            // Broadcast updated room state
            broadcastRoomState(io, room);

            io.to(room.id).emit('lobby:playerReady', {
                roomId: room.id,
                playerId: socket.userId,
                isReady: player.isReady,
            });
        }
    });

    // Start game
    socket.on('lobby:startGame', () => {
        if (!socket.currentRoomId || !socket.userId) return;

        const room = rooms.get(socket.currentRoomId);
        if (!room) return;

        // Only host can start
        if (room.hostId !== socket.userId) {
            console.log(`⚠️ Non-host tried to start game: ${socket.username}`);
            return;
        }

        // Check all non-host players are ready
        const allReady = room.players.every(p => p.id === room.hostId || p.isReady);
        if (room.players.length < 2) {
            console.log(`⚠️ Not enough players to start: ${room.players.length}`);
            return;
        }
        if (!allReady) {
            console.log(`⚠️ Not all players ready`);
            return;
        }

        room.status = 'playing';

        console.log(`🎮 Game starting: ${room.name} (${room.gameType})`);

        io.to(room.id).emit('game:starting', {
            roomId: room.id,
            gameType: room.gameType,
            players: room.players.map(p => ({ userId: p.id, username: p.username })),
        });

        broadcastRoomState(io, room);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        if (socket.currentRoomId) {
            leaveRoom(io, socket);
        }
    });
}

// Helper function to leave room
function leaveRoom(io: Server, socket: AuthenticatedSocket) {
    if (!socket.currentRoomId || !socket.userId) return;

    const roomId = socket.currentRoomId;
    const room = rooms.get(roomId);

    if (!room) {
        socket.currentRoomId = undefined;
        socket.leave(roomId);
        return;
    }

    // Remove player
    room.players = room.players.filter(p => p.id !== socket.userId);

    console.log(`👋 Player left: ${socket.username} <- ${room.name} (${room.players.length} remaining)`);

    // Leave socket.io room
    socket.leave(roomId);
    socket.currentRoomId = undefined;

    // Emit player left
    io.to(roomId).emit('lobby:playerLeft', { roomId, playerId: socket.userId });

    if (room.players.length === 0) {
        // Delete empty room
        rooms.delete(roomId);
        io.emit('lobby:roomDeleted', roomId);
        console.log(`🗑️ Room deleted: ${room.name}`);
    } else {
        // Reassign host if needed
        if (room.hostId === socket.userId) {
            room.hostId = room.players[0].id;
            console.log(`👑 New host: ${room.players[0].username}`);
        }
        broadcastRoomState(io, room);
    }
}
