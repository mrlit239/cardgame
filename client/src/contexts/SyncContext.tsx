import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';

interface SyncContextType {
    avatar: string;
    credits: number;
    syncAvatar: (newAvatar: string) => void;
    syncCredits: (newCredits: number) => void;
    refreshFromServer: () => void;
}

const SyncContext = createContext<SyncContextType | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
    const { socket, user, updateAvatar, refreshCredits, avatar: authAvatar, credits: authCredits } = useAuth();

    // Local state synced with AuthContext
    const [avatar, setAvatar] = useState(authAvatar);
    const [credits, setCredits] = useState(authCredits);

    // Ref to hold the refresh function for use in effects
    const refreshRef = useRef<() => void>(() => { });

    // Keep synced with AuthContext
    useEffect(() => {
        setAvatar(authAvatar);
    }, [authAvatar]);

    useEffect(() => {
        setCredits(authCredits);
    }, [authCredits]);

    // Listen for server sync events
    useEffect(() => {
        if (!socket) return;

        const handleAvatarChanged = (data: { avatar: string }) => {
            console.log('🔄 Avatar synced from server:', data.avatar);
            setAvatar(data.avatar);
            updateAvatar(data.avatar);
        };

        const handleCreditsChanged = (data: { credits: number }) => {
            console.log('🔄 Credits synced from server:', data.credits);
            setCredits(data.credits);
        };

        // Type-safe socket event listeners
        (socket as unknown as { on: (event: string, handler: (data: unknown) => void) => void })
            .on('user:avatarChanged', handleAvatarChanged as (data: unknown) => void);
        (socket as unknown as { on: (event: string, handler: (data: unknown) => void) => void })
            .on('user:creditsChanged', handleCreditsChanged as (data: unknown) => void);

        return () => {
            (socket as unknown as { off: (event: string) => void }).off('user:avatarChanged');
            (socket as unknown as { off: (event: string) => void }).off('user:creditsChanged');
        };
    }, [socket, updateAvatar]);

    const syncAvatar = useCallback((newAvatar: string) => {
        setAvatar(newAvatar);
        updateAvatar(newAvatar);

        // Emit to server to save and broadcast
        if (socket) {
            (socket as unknown as { emit: (event: string, data: { avatar: string }, callback: (res: { success: boolean }) => void) => void })
                .emit('profile:updateAvatar', { avatar: newAvatar }, (response) => {
                    if (response.success) {
                        console.log('✅ Avatar saved and synced');
                    }
                });
        }
    }, [socket, updateAvatar]);

    const syncCredits = useCallback((newCredits: number) => {
        setCredits(newCredits);
    }, []);

    const refreshFromServer = useCallback(() => {
        if (!socket) return;

        // Get latest profile data
        (socket as unknown as { emit: (event: string, callback: (res: { success: boolean; profile?: { avatar: string; credits: number } }) => void) => void })
            .emit('profile:getProfile', (response) => {
                if (response.success && response.profile) {
                    setAvatar(response.profile.avatar);
                    setCredits(response.profile.credits);
                    updateAvatar(response.profile.avatar);
                    console.log('🔄 Profile refreshed from server');
                }
            });

        // Also refresh credits via AuthContext
        refreshCredits();
    }, [socket, updateAvatar, refreshCredits]);

    // Update ref when refreshFromServer changes
    useEffect(() => {
        refreshRef.current = refreshFromServer;
    }, [refreshFromServer]);

    // Refresh on tab focus
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && socket && user) {
                refreshRef.current();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [socket, user]);

    return (
        <SyncContext.Provider value={{ avatar, credits, syncAvatar, syncCredits, refreshFromServer }}>
            {children}
        </SyncContext.Provider>
    );
}

export function useSync() {
    const context = useContext(SyncContext);
    if (!context) {
        throw new Error('useSync must be used within a SyncProvider');
    }
    return context;
}
