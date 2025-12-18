import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { socketService } from '../services/socket';
import type { TypedSocket } from '../services/socket';

interface User {
    id: string;
    username: string;
    token: string;
}

interface AuthContextType {
    user: User | null;
    socket: TypedSocket | null;
    isLoading: boolean;
    isConnected: boolean;
    login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
    register: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [socket, setSocket] = useState<TypedSocket | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        const newSocket = socketService.connect();
        setSocket(newSocket);

        // Timeout - if no connection after 3 seconds, stop loading
        const connectionTimeout = setTimeout(() => {
            if (!newSocket.connected) {
                console.log('⚠️ Connection timeout - server may not be running');
                setIsLoading(false);
            }
        }, 3000);

        newSocket.on('connect', () => {
            clearTimeout(connectionTimeout);
            setIsConnected(true);

            // Try to restore session from localStorage
            const savedToken = localStorage.getItem('token');
            if (savedToken) {
                // Use type assertion to handle the custom event
                (newSocket as any).emit('auth:token', savedToken, (response: { success: boolean }) => {
                    if (response.success) {
                        const savedUser = localStorage.getItem('user');
                        if (savedUser) {
                            setUser(JSON.parse(savedUser));
                        }
                    } else {
                        localStorage.removeItem('token');
                        localStorage.removeItem('user');
                    }
                    setIsLoading(false);
                });
            } else {
                setIsLoading(false);
            }
        });

        newSocket.on('connect_error', (error) => {
            clearTimeout(connectionTimeout);
            console.error('❌ Connection error:', error.message);
            setIsLoading(false);
        });

        newSocket.on('disconnect', () => {
            setIsConnected(false);
        });

        return () => {
            clearTimeout(connectionTimeout);
            socketService.disconnect();
        };
    }, []);

    const login = useCallback(async (username: string, password: string): Promise<{ success: boolean; message?: string }> => {
        return new Promise((resolve) => {
            if (!socket) {
                resolve({ success: false, message: 'Not connected to server' });
                return;
            }

            socket.emit('auth:login', { username, password }, (response) => {
                if (response.success && response.userId && response.username && response.token) {
                    const newUser = {
                        id: response.userId,
                        username: response.username,
                        token: response.token,
                    };
                    setUser(newUser);
                    localStorage.setItem('token', response.token);
                    localStorage.setItem('user', JSON.stringify(newUser));
                    resolve({ success: true });
                } else {
                    resolve({ success: false, message: response.message });
                }
            });
        });
    }, [socket]);

    const register = useCallback(async (username: string, password: string): Promise<{ success: boolean; message?: string }> => {
        return new Promise((resolve) => {
            if (!socket) {
                resolve({ success: false, message: 'Not connected to server' });
                return;
            }

            socket.emit('auth:register', { username, password }, (response) => {
                if (response.success && response.userId && response.username && response.token) {
                    const newUser = {
                        id: response.userId,
                        username: response.username,
                        token: response.token,
                    };
                    setUser(newUser);
                    localStorage.setItem('token', response.token);
                    localStorage.setItem('user', JSON.stringify(newUser));
                    resolve({ success: true });
                } else {
                    resolve({ success: false, message: response.message });
                }
            });
        });
    }, [socket]);

    const logout = useCallback(() => {
        if (socket) {
            socket.emit('auth:logout');
        }
        setUser(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    }, [socket]);

    return (
        <AuthContext.Provider value={{ user, socket, isLoading, isConnected, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
