import { Server } from 'socket.io';
import { Room } from '../../models';
import { AuthenticatedSocket } from './authHandler';
import { isDatabaseConnected } from '../../config/database';

// In-memory room storage for demo mode
interface InMemoryRoom {
    id: string;
    name: string;
    gameType: 'phom' | 'poker' | 'durak';
    hostId: string;
    maxPlayers: number;
    players: {
        userId: string;
        username: string;
        isReady: boolean;
        isConnected: boolean;
        socketId?: string;
    }[];
    status: 'waiting' | 'playing' | 'finished';
    createdAt: Date;
}

const inMemoryRooms: Map<string, InMemoryRoom> = new Map();
let roomIdCounter = 1;

// Helper to convert in-memory room to client format
function roomToClientFormat(room: InMemoryRoom) {
    return {
        id: room.id,
        _id: room.id,
        name: room.name,
        gameType: room.gameType,
        hostId: room.hostId,
        maxPlayers: room.maxPlayers,
        players: room.players.map(p => ({
            id: p.userId,
            username: p.username,
            hand: [],
            isReady: p.isReady,
            isConnected: p.isConnected,
            score: 0,
        })),
        status: room.status,
        createdAt: room.createdAt,
    };
}

// Helper to convert MongoDB room to client format
function mongoRoomToClientFormat(room: any) {
    const roomObj = room.toObject ? room.toObject() : room;
    return {
        id: roomObj._id?.toString() || roomObj.id,
        _id: roomObj._id?.toString() || roomObj.id,
        name: roomObj.name,
        gameType: roomObj.gameType,
        hostId: roomObj.hostId,
        maxPlayers: roomObj.maxPlayers,
        players: roomObj.players.map((p: any) => ({
            id: p.userId || p.id,
            username: p.username,
            hand: [],
            isReady: p.isReady || false,
            isConnected: p.isConnected !== false,
            score: 0,
        })),
        status: roomObj.status,
        createdAt: roomObj.createdAt,
    };
}

export function setupLobbyHandlers(io: Server, socket: AuthenticatedSocket) {
    // Get all available rooms
    socket.on('lobby:getRooms', async (callback) => {
        try {
            if (isDatabaseConnected()) {
                const rooms = await Room.find({ status: 'waiting' })
                    .select('-gameState')
                    .sort({ createdAt: -1 })
                    .limit(50);
                callback(rooms.map(mongoRoomToClientFormat));
            } else {
                // In-memory demo mode
                const rooms = Array.from(inMemoryRooms.values())
                    .filter(r => r.status === 'waiting')
                    .map(roomToClientFormat);
                callback(rooms);
            }
        } catch (error) {
            console.error('Get rooms error:', error);
            callback([]);
        }
    });

    // Create a new room
    socket.on('lobby:createRoom', async (data, callback) => {
        try {
            if (!socket.userId || !socket.username) {
                return callback({ success: false, message: 'Not authenticated' });
            }

            const { name, gameType, maxPlayers } = data;

            // Validate max players based on game type
            let validMaxPlayers = maxPlayers;
            if (gameType === 'phom') {
                validMaxPlayers = Math.min(Math.max(maxPlayers, 2), 4);
            } else if (gameType === 'poker') {
                validMaxPlayers = Math.min(Math.max(maxPlayers, 2), 9);
            } else if (gameType === 'durak') {
                validMaxPlayers = Math.min(Math.max(maxPlayers, 2), 6);
            }

            if (isDatabaseConnected()) {
                const room = new Room({
                    name: name || `${socket.username}'s Room`,
                    gameType,
                    hostId: socket.userId,
                    maxPlayers: validMaxPlayers,
                    players: [{
                        userId: socket.userId,
                        username: socket.username,
                        isReady: false,
                        isConnected: true,
                        socketId: socket.id,
                    }],
                    status: 'waiting',
                });

                await room.save();

                socket.join(room._id.toString());
                socket.currentRoomId = room._id.toString();

                callback({ success: true, room: mongoRoomToClientFormat(room) });
                io.emit('lobby:roomCreated', mongoRoomToClientFormat(room));

                console.log(`✅ Room created (DB): ${room.name} by ${socket.username}`);
            } else {
                // In-memory demo mode
                const roomId = `room_${roomIdCounter++}`;
                const room: InMemoryRoom = {
                    id: roomId,
                    name: name || `${socket.username}'s Room`,
                    gameType,
                    hostId: socket.userId,
                    maxPlayers: validMaxPlayers,
                    players: [{
                        userId: socket.userId,
                        username: socket.username,
                        isReady: false,
                        isConnected: true,
                        socketId: socket.id,
                    }],
                    status: 'waiting',
                    createdAt: new Date(),
                };

                inMemoryRooms.set(roomId, room);

                socket.join(roomId);
                socket.currentRoomId = roomId;

                const clientRoom = roomToClientFormat(room);
                callback({ success: true, room: clientRoom });
                io.emit('lobby:roomCreated', clientRoom);

                console.log(`✅ Room created (Demo): ${room.name} by ${socket.username}`);
            }
        } catch (error) {
            console.error('Create room error:', error);
            callback({ success: false, message: 'Failed to create room' });
        }
    });

    // Join an existing room
    socket.on('lobby:joinRoom', async (roomId, callback) => {
        try {
            if (!socket.userId || !socket.username) {
                return callback({ success: false, message: 'Not authenticated' });
            }

            if (isDatabaseConnected()) {
                const room = await Room.findById(roomId);
                if (!room) {
                    return callback({ success: false, message: 'Room not found' });
                }

                if (room.status !== 'waiting') {
                    return callback({ success: false, message: 'Game already started' });
                }

                if (room.players.length >= room.maxPlayers) {
                    return callback({ success: false, message: 'Room is full' });
                }

                const alreadyInRoom = room.players.some(p => p.userId === socket.userId);
                if (!alreadyInRoom) {
                    room.players.push({
                        userId: socket.userId,
                        username: socket.username,
                        isReady: false,
                        isConnected: true,
                        socketId: socket.id,
                    } as any);
                    await room.save();
                }

                socket.join(roomId);
                socket.currentRoomId = roomId;

                callback({ success: true, room: mongoRoomToClientFormat(room) });

                io.to(roomId).emit('lobby:playerJoined', {
                    roomId,
                    player: { id: socket.userId, username: socket.username }
                });
                io.emit('lobby:roomUpdated', mongoRoomToClientFormat(room));
            } else {
                // In-memory demo mode
                const room = inMemoryRooms.get(roomId);
                if (!room) {
                    return callback({ success: false, message: 'Room not found' });
                }

                if (room.status !== 'waiting') {
                    return callback({ success: false, message: 'Game already started' });
                }

                if (room.players.length >= room.maxPlayers) {
                    return callback({ success: false, message: 'Room is full' });
                }

                const alreadyInRoom = room.players.some(p => p.userId === socket.userId);
                if (!alreadyInRoom) {
                    room.players.push({
                        userId: socket.userId,
                        username: socket.username,
                        isReady: false,
                        isConnected: true,
                        socketId: socket.id,
                    });
                }

                socket.join(roomId);
                socket.currentRoomId = roomId;

                const clientRoom = roomToClientFormat(room);
                callback({ success: true, room: clientRoom });

                io.to(roomId).emit('lobby:playerJoined', {
                    roomId,
                    player: { id: socket.userId, username: socket.username }
                });
                io.emit('lobby:roomUpdated', clientRoom);

                console.log(`✅ Player joined (Demo): ${socket.username} -> ${room.name}`);
            }
        } catch (error) {
            console.error('Join room error:', error);
            callback({ success: false, message: 'Failed to join room' });
        }
    });

    // Leave current room
    socket.on('lobby:leaveRoom', async () => {
        if (!socket.currentRoomId || !socket.userId) return;

        const roomId = socket.currentRoomId;

        try {
            if (isDatabaseConnected()) {
                const room = await Room.findById(roomId);
                if (!room) return;

                room.players = room.players.filter(p => p.userId !== socket.userId);

                if (room.players.length === 0) {
                    await room.deleteOne();
                    io.emit('lobby:roomDeleted', roomId);
                } else {
                    if (room.hostId === socket.userId) {
                        room.hostId = room.players[0].userId;
                    }
                    await room.save();
                    io.emit('lobby:roomUpdated', mongoRoomToClientFormat(room));
                }

                io.to(roomId).emit('lobby:playerLeft', { roomId, playerId: socket.userId });
            } else {
                // In-memory demo mode
                const room = inMemoryRooms.get(roomId);
                if (!room) return;

                room.players = room.players.filter(p => p.userId !== socket.userId);

                if (room.players.length === 0) {
                    inMemoryRooms.delete(roomId);
                    io.emit('lobby:roomDeleted', roomId);
                } else {
                    if (room.hostId === socket.userId) {
                        room.hostId = room.players[0].userId;
                    }
                    io.emit('lobby:roomUpdated', roomToClientFormat(room));
                }

                io.to(roomId).emit('lobby:playerLeft', { roomId, playerId: socket.userId });
            }

            socket.leave(roomId);
            socket.currentRoomId = undefined;
        } catch (error) {
            console.error('Leave room error:', error);
        }
    });

    // Toggle ready status
    socket.on('lobby:ready', async () => {
        if (!socket.currentRoomId || !socket.userId) return;

        const roomId = socket.currentRoomId;

        try {
            if (isDatabaseConnected()) {
                const room = await Room.findById(roomId);
                if (!room) return;

                const player = room.players.find(p => p.userId === socket.userId);
                if (player) {
                    player.isReady = !player.isReady;
                    await room.save();

                    io.to(roomId).emit('lobby:playerReady', {
                        roomId,
                        playerId: socket.userId,
                        isReady: player.isReady,
                    });
                }
            } else {
                // In-memory demo mode
                const room = inMemoryRooms.get(roomId);
                if (!room) return;

                const player = room.players.find(p => p.userId === socket.userId);
                if (player) {
                    player.isReady = !player.isReady;

                    io.to(roomId).emit('lobby:playerReady', {
                        roomId,
                        playerId: socket.userId,
                        isReady: player.isReady,
                    });
                }
            }
        } catch (error) {
            console.error('Ready toggle error:', error);
        }
    });

    // Start game (host only)
    socket.on('lobby:startGame', async () => {
        if (!socket.currentRoomId || !socket.userId) return;

        const roomId = socket.currentRoomId;

        try {
            if (isDatabaseConnected()) {
                const room = await Room.findById(roomId);
                if (!room || room.hostId !== socket.userId) return;

                const allReady = room.players.every(p => p.userId === room.hostId || p.isReady);
                if (room.players.length < 2 || !allReady) return;

                room.status = 'playing';
                await room.save();

                io.to(roomId).emit('game:starting', {
                    roomId,
                    gameType: room.gameType,
                    players: room.players.map(p => ({ userId: p.userId, username: p.username })),
                });

                console.log(`🎮 Game starting in room: ${room.name}`);
            } else {
                // In-memory demo mode
                const room = inMemoryRooms.get(roomId);
                if (!room || room.hostId !== socket.userId) return;

                const allReady = room.players.every(p => p.userId === room.hostId || p.isReady);
                if (room.players.length < 2 || !allReady) return;

                room.status = 'playing';

                io.to(roomId).emit('game:starting', {
                    roomId,
                    gameType: room.gameType,
                    players: room.players.map(p => ({ userId: p.userId, username: p.username })),
                });

                console.log(`🎮 Game starting (Demo) in room: ${room.name}`);
            }
        } catch (error) {
            console.error('Start game error:', error);
        }
    });

    // Handle disconnect - properly remove player from room
    socket.on('disconnect', async () => {
        console.log(`🔌 Disconnected: ${socket.id} - user ${socket.userId}`);

        if (!socket.currentRoomId || !socket.userId) return;

        const roomId = socket.currentRoomId;
        const userId = socket.userId;

        try {
            if (isDatabaseConnected()) {
                const room = await Room.findById(roomId);
                if (!room) return;

                // Remove the player from the room
                room.players = room.players.filter(p => p.userId !== userId);

                if (room.players.length === 0) {
                    // Delete empty room
                    await room.deleteOne();
                    io.emit('lobby:roomDeleted', roomId);
                    console.log(`🗑️ Room deleted (empty): ${room.name}`);
                } else {
                    // Update host if needed
                    if (room.hostId === userId && room.players.length > 0) {
                        room.hostId = room.players[0].userId;
                    }
                    await room.save();

                    // Notify remaining players
                    io.to(roomId).emit('lobby:playerLeft', { roomId, playerId: userId });
                    io.emit('lobby:roomUpdated', mongoRoomToClientFormat(room));
                    console.log(`👋 Player ${userId} left room: ${room.name}`);
                }
            } else {
                // In-memory demo mode
                const room = inMemoryRooms.get(roomId);
                if (!room) return;

                // Remove the player from the room
                room.players = room.players.filter(p => p.userId !== userId);

                if (room.players.length === 0) {
                    // Delete empty room
                    inMemoryRooms.delete(roomId);
                    io.emit('lobby:roomDeleted', roomId);
                    console.log(`🗑️ Room deleted (empty - demo): ${room.name}`);
                } else {
                    // Update host if needed
                    if (room.hostId === userId && room.players.length > 0) {
                        room.hostId = room.players[0].userId;
                    }

                    // Notify remaining players
                    io.to(roomId).emit('lobby:playerLeft', { roomId, playerId: userId });
                    io.emit('lobby:roomUpdated', roomToClientFormat(room));
                    console.log(`👋 Player ${userId} left room (demo): ${room.name}`);
                }
            }
        } catch (error) {
            console.error('Disconnect handler error:', error);
        }
    });
}

// Export for game handler
export function getInMemoryRoom(roomId: string) {
    return inMemoryRooms.get(roomId);
}

// Cleanup user from any rooms they might be in (called on reconnection)
export async function cleanupUserRooms(userId: string, io: Server) {
    try {
        if (isDatabaseConnected()) {
            // Find and remove user from any rooms they're in
            const rooms = await Room.find({ 'players.userId': userId });
            for (const room of rooms) {
                room.players = room.players.filter(p => p.userId !== userId);

                if (room.players.length === 0) {
                    await room.deleteOne();
                    io.emit('lobby:roomDeleted', room._id.toString());
                    console.log(`🧹 Cleaned up empty room: ${room.name}`);
                } else {
                    if (room.hostId === userId) {
                        room.hostId = room.players[0].userId;
                    }
                    await room.save();
                    io.emit('lobby:roomUpdated', mongoRoomToClientFormat(room));
                    console.log(`🧹 Cleaned up stale player from room: ${room.name}`);
                }
            }
        } else {
            // In-memory mode cleanup
            for (const [roomId, room] of inMemoryRooms.entries()) {
                const playerIndex = room.players.findIndex(p => p.userId === userId);
                if (playerIndex !== -1) {
                    room.players.splice(playerIndex, 1);

                    if (room.players.length === 0) {
                        inMemoryRooms.delete(roomId);
                        io.emit('lobby:roomDeleted', roomId);
                        console.log(`🧹 Cleaned up empty room (demo): ${room.name}`);
                    } else {
                        if (room.hostId === userId) {
                            room.hostId = room.players[0].userId;
                        }
                        io.emit('lobby:roomUpdated', roomToClientFormat(room));
                        console.log(`🧹 Cleaned up stale player from room (demo): ${room.name}`);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Cleanup user rooms error:', error);
    }
}
