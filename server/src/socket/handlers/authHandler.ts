import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User } from '../../models';
import { config } from '../../config';
import { isDatabaseConnected } from '../../config/database';
import { cleanupUserRooms } from './lobbyHandler';

interface AuthenticatedSocket extends Socket {
    userId?: string;
    username?: string;
    currentRoomId?: string;
    credits?: number;
}

interface JwtPayload {
    userId: string;
    username: string;
}

// In-memory user storage for demo mode (when MongoDB not available)
interface InMemoryUser {
    id: string;
    username: string;
    passwordHash: string;
    credits: number;
}
const inMemoryUsers: Map<string, InMemoryUser> = new Map();
let userIdCounter = 1;

const STARTING_CREDITS = 1000;

// Export function to get user credits
export function getUserCredits(userId: string): number {
    const user = inMemoryUsers.get(userId);
    return user?.credits ?? STARTING_CREDITS;
}

// Export function to update user credits
export function updateUserCredits(userId: string, amount: number): { success: boolean; newBalance: number } {
    const user = inMemoryUsers.get(userId);
    if (!user) {
        return { success: false, newBalance: 0 };
    }

    const newBalance = user.credits + amount;
    if (newBalance < 0) {
        return { success: false, newBalance: user.credits };
    }

    user.credits = newBalance;
    return { success: true, newBalance };
}

export function setupAuthHandlers(io: Server, socket: AuthenticatedSocket) {
    // Register new user
    socket.on('auth:register', async (data, callback) => {
        try {
            const { username, password } = data;

            if (isDatabaseConnected()) {
                // MongoDB mode
                const existingUser = await User.findOne({ username });
                if (existingUser) {
                    return callback({ success: false, message: 'Username already taken' });
                }

                const user = new User({ username, password });
                await user.save();

                const token = jwt.sign(
                    { userId: user._id.toString(), username: user.username },
                    config.jwtSecret,
                    { expiresIn: '7d' }
                );

                socket.userId = user._id.toString();
                socket.username = user.username;

                callback({
                    success: true,
                    userId: user._id.toString(),
                    username: user.username,
                    token,
                });

                console.log(`✅ User registered (DB): ${username}`);
            } else {
                // In-memory demo mode
                const existingUser = Array.from(inMemoryUsers.values()).find(u => u.username === username);
                if (existingUser) {
                    return callback({ success: false, message: 'Username already taken' });
                }

                const id = `demo_${userIdCounter++}`;
                const passwordHash = await bcrypt.hash(password, 10);
                inMemoryUsers.set(id, { id, username, passwordHash, credits: STARTING_CREDITS });

                const token = jwt.sign(
                    { userId: id, username },
                    config.jwtSecret,
                    { expiresIn: '7d' }
                );

                socket.userId = id;
                socket.username = username;
                socket.credits = STARTING_CREDITS;

                callback({
                    success: true,
                    userId: id,
                    username,
                    token,
                    credits: STARTING_CREDITS,
                });

                console.log(`✅ User registered (Demo): ${username}`);
            }
        } catch (error) {
            console.error('Registration error:', error);
            callback({ success: false, message: 'Registration failed' });
        }
    });

    // Login existing user
    socket.on('auth:login', async (data, callback) => {
        try {
            const { username, password } = data;

            if (isDatabaseConnected()) {
                // MongoDB mode
                const user = await User.findOne({ username });
                if (!user) {
                    return callback({ success: false, message: 'Invalid credentials' });
                }

                const isMatch = await user.comparePassword(password);
                if (!isMatch) {
                    return callback({ success: false, message: 'Invalid credentials' });
                }

                const token = jwt.sign(
                    { userId: user._id.toString(), username: user.username },
                    config.jwtSecret,
                    { expiresIn: '7d' }
                );

                socket.userId = user._id.toString();
                socket.username = user.username;
                socket.credits = (user as unknown as { credits?: number }).credits || STARTING_CREDITS;

                callback({
                    success: true,
                    userId: user._id.toString(),
                    username: user.username,
                    token,
                });

                console.log(`✅ User logged in (DB): ${username}`);
            } else {
                // In-memory demo mode
                const user = Array.from(inMemoryUsers.values()).find(u => u.username === username);
                if (!user) {
                    return callback({ success: false, message: 'Invalid credentials' });
                }

                const isMatch = await bcrypt.compare(password, user.passwordHash);
                if (!isMatch) {
                    return callback({ success: false, message: 'Invalid credentials' });
                }

                const token = jwt.sign(
                    { userId: user.id, username: user.username },
                    config.jwtSecret,
                    { expiresIn: '7d' }
                );

                socket.userId = user.id;
                socket.username = user.username;
                socket.credits = user.credits;

                callback({
                    success: true,
                    userId: user.id,
                    username: user.username,
                    token,
                    credits: user.credits,
                });

                console.log(`✅ User logged in (Demo): ${username}`);
            }
        } catch (error) {
            console.error('Login error:', error);
            callback({ success: false, message: 'Login failed' });
        }
    });

    // Authenticate with token (for reconnection)
    socket.on('auth:token', async (token: string, callback: (response: { success: boolean; message?: string }) => void) => {
        try {
            const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;

            if (isDatabaseConnected()) {
                const user = await User.findById(decoded.userId);
                if (!user) {
                    return callback({ success: false, message: 'User not found' });
                }
                socket.userId = user._id.toString();
                socket.username = user.username;
            } else {
                // Demo mode - trust the token
                socket.userId = decoded.userId;
                socket.username = decoded.username;
            }

            // Clean up any stale room data for this user
            cleanupUserRooms(socket.userId!);

            callback({ success: true });
            console.log(`✅ User authenticated via token: ${decoded.username}`);
        } catch (error) {
            callback({ success: false, message: 'Invalid token' });
        }
    });

    // Logout
    socket.on('auth:logout', () => {
        if (socket.currentRoomId) {
            socket.leave(socket.currentRoomId);
        }
        socket.userId = undefined;
        socket.username = undefined;
        socket.currentRoomId = undefined;
        console.log('User logged out');
    });

    // Get user credits
    socket.on('credits:get', (callback: (response: { success: boolean; credits?: number }) => void) => {
        if (!socket.userId) {
            return callback({ success: false });
        }
        const credits = getUserCredits(socket.userId);
        callback({ success: true, credits });
    });

    // Get user profile
    socket.on('profile:getProfile', async (callback: (response: {
        success: boolean;
        profile?: {
            username: string;
            avatar: string;
            credits: number;
            stats: { gamesPlayed: number; gamesWon: number; durakCount: number };
            createdAt: string;
        };
        presetAvatars?: string[];
    }) => void) => {
        try {
            if (!socket.userId) {
                return callback({ success: false });
            }

            const presetAvatars = [
                '😀', '😎', '🤠', '🥳', '😈', '👻', '🤖', '👽',
                '🦊', '🐱', '🐶', '🐼', '🦁', '🐯', '🐸', '🦄',
                '🔥', '⚡', '🌟', '💎', '🎯', '🎲', '🃏', '♠️'
            ];

            if (isDatabaseConnected()) {
                const user = await User.findById(socket.userId);
                if (user) {
                    callback({
                        success: true,
                        profile: {
                            username: user.username,
                            avatar: user.avatar || '😀',
                            credits: user.credits || 1000,
                            stats: {
                                gamesPlayed: user.stats?.gamesPlayed || 0,
                                gamesWon: user.stats?.gamesWon || 0,
                                durakCount: user.stats?.durakCount || 0,
                            },
                            createdAt: user.createdAt?.toISOString() || new Date().toISOString(),
                        },
                        presetAvatars,
                    });
                } else {
                    callback({ success: false });
                }
            } else {
                // In-memory mode
                const user = inMemoryUsers.get(socket.userId);
                if (user) {
                    callback({
                        success: true,
                        profile: {
                            username: user.username,
                            avatar: (user as unknown as { avatar?: string }).avatar || '😀',
                            credits: user.credits,
                            stats: {
                                gamesPlayed: 0,
                                gamesWon: 0,
                                durakCount: 0,
                            },
                            createdAt: new Date().toISOString(),
                        },
                        presetAvatars,
                    });
                } else {
                    callback({ success: false });
                }
            }
        } catch (error) {
            console.error('Get profile error:', error);
            callback({ success: false });
        }
    });

    // Update avatar
    socket.on('profile:updateAvatar', async (data: { avatar: string }, callback: (response: { success: boolean; message?: string }) => void) => {
        try {
            if (!socket.userId) {
                return callback({ success: false, message: 'Not authenticated' });
            }

            const validAvatars = [
                '😀', '😎', '🤠', '🥳', '😈', '👻', '🤖', '👽',
                '🦊', '🐱', '🐶', '🐼', '🦁', '🐯', '🐸', '🦄',
                '🔥', '⚡', '🌟', '💎', '🎯', '🎲', '🃏', '♠️'
            ];

            if (!validAvatars.includes(data.avatar)) {
                return callback({ success: false, message: 'Invalid avatar' });
            }

            if (isDatabaseConnected()) {
                await User.findByIdAndUpdate(socket.userId, { avatar: data.avatar });
                callback({ success: true });
                console.log(`✅ Avatar updated for ${socket.username}: ${data.avatar}`);
            } else {
                // Update in-memory
                const user = inMemoryUsers.get(socket.userId);
                if (user) {
                    (user as unknown as { avatar?: string }).avatar = data.avatar;
                    callback({ success: true });
                    console.log(`✅ Avatar updated (demo) for ${socket.username}: ${data.avatar}`);
                } else {
                    callback({ success: false, message: 'User not found' });
                }
            }
        } catch (error) {
            console.error('Update avatar error:', error);
            callback({ success: false, message: 'Failed to update avatar' });
        }
    });
}

export { AuthenticatedSocket };

