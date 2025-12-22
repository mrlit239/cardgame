import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import './UserProfile.css';

interface UserProfileProps {
    isOpen: boolean;
    onClose: () => void;
    targetUser?: {
        id: string;
        username: string;
        credits?: number;
        avatar?: string;
    };
}

interface ProfileData {
    username: string;
    avatar: string;
    credits: number;
    stats: {
        gamesPlayed: number;
        gamesWon: number;
        durakCount: number;
    };
    createdAt: string;
}

export function UserProfile({ isOpen, onClose, targetUser }: UserProfileProps) {
    const { user, credits, socket } = useAuth();
    const { theme } = useTheme();
    const [activeTab, setActiveTab] = useState<'stats' | 'achievements' | 'avatar'>('stats');
    const [profileData, setProfileData] = useState<ProfileData | null>(null);
    const [presetAvatars, setPresetAvatars] = useState<string[]>([]);
    const [selectedAvatar, setSelectedAvatar] = useState<string>('😀');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Fetch profile data from server with timeout
    useEffect(() => {
        if (!isOpen || !socket) return;

        // Set default preset avatars immediately
        const defaultAvatars = [
            '😀', '😎', '🤠', '🥳', '😈', '👻', '🤖', '👽',
            '🦊', '🐱', '🐶', '🐼', '🦁', '🐯', '🐸', '🦄',
            '🔥', '⚡', '🌟', '💎', '🎯', '🎲', '🃏', '♠️'
        ];
        setPresetAvatars(defaultAvatars);

        // Set loading state
        setIsLoading(true);

        // Timeout to prevent infinite loading
        const timeout = setTimeout(() => {
            setIsLoading(false);
            // Set default profile data if server doesn't respond
            if (!profileData) {
                setProfileData({
                    username: user?.username || 'Player',
                    avatar: '😀',
                    credits: credits,
                    stats: { gamesPlayed: 0, gamesWon: 0, durakCount: 0 },
                    createdAt: new Date().toISOString()
                });
            }
        }, 3000);

        (socket as unknown as {
            emit: (event: string, callback: (response: {
                success: boolean;
                profile?: ProfileData;
                presetAvatars?: string[];
            }) => void) => void
        }).emit('profile:getProfile', (response) => {
            clearTimeout(timeout);
            setIsLoading(false);
            if (response.success && response.profile) {
                setProfileData(response.profile);
                setSelectedAvatar(response.profile.avatar);
            }
            if (response.presetAvatars) {
                setPresetAvatars(response.presetAvatars);
            }
        });

        return () => clearTimeout(timeout);
    }, [isOpen, socket, user, credits, profileData]);

    const updateAvatar = useCallback((avatar: string) => {
        if (!socket) return;

        setIsSaving(true);
        setSelectedAvatar(avatar);

        (socket as unknown as { emit: (event: string, data: { avatar: string }, callback: (response: { success: boolean }) => void) => void })
            .emit('profile:updateAvatar', { avatar }, (response) => {
                setIsSaving(false);
                if (response.success && profileData) {
                    setProfileData({ ...profileData, avatar });
                }
            });
    }, [socket, profileData]);

    if (!isOpen) return null;

    // Use target user if provided, otherwise show current user
    const displayUser = targetUser || user;
    const displayCredits = profileData?.credits ?? targetUser?.credits ?? credits;
    const displayAvatar = profileData?.avatar ?? targetUser?.avatar ?? selectedAvatar;
    const isOwnProfile = !targetUser || targetUser.id === user?.id;

    if (!displayUser) return null;

    const winRate = profileData && profileData.stats.gamesPlayed > 0
        ? Math.round((profileData.stats.gamesWon / profileData.stats.gamesPlayed) * 100)
        : 0;

    const memberDate = profileData?.createdAt
        ? new Date(profileData.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        : 'Dec 2024';

    return (
        <div className="profile-overlay" onClick={onClose}>
            <div
                className={`profile-modal ${theme === 'stealth' ? 'theme-stealth' : ''}`}
                onClick={(e) => e.stopPropagation()}
            >
                <button className="profile-close" onClick={onClose}>×</button>

                {/* Header */}
                <div className="profile-header">
                    <div className="profile-avatar emoji-avatar">
                        {displayAvatar}
                    </div>
                    <div className="profile-name-section">
                        <h2 className="profile-username">{displayUser.username}</h2>
                        <span className="profile-id">ID: {displayUser.id.slice(0, 8)}...</span>
                    </div>
                </div>

                {/* Credits Display */}
                <div className="profile-credits-card">
                    <span className="credits-label">{theme === 'stealth' ? 'Budget' : 'Credits'}</span>
                    <span className="credits-value">💰 {displayCredits.toLocaleString()}</span>
                </div>

                {/* Tabs */}
                <div className="profile-tabs">
                    <button
                        className={`tab ${activeTab === 'stats' ? 'active' : ''}`}
                        onClick={() => setActiveTab('stats')}
                    >
                        📊 {theme === 'stealth' ? 'Metrics' : 'Stats'}
                    </button>
                    {isOwnProfile && (
                        <button
                            className={`tab ${activeTab === 'avatar' ? 'active' : ''}`}
                            onClick={() => setActiveTab('avatar')}
                        >
                            🎭 Avatar
                        </button>
                    )}
                    <button
                        className={`tab ${activeTab === 'achievements' ? 'active' : ''}`}
                        onClick={() => setActiveTab('achievements')}
                    >
                        🏆 {theme === 'stealth' ? 'Milestones' : 'Badges'}
                    </button>
                </div>

                {/* Tab Content */}
                <div className="profile-content">
                    {isLoading ? (
                        <div className="loading-spinner">Loading...</div>
                    ) : (
                        <>
                            {activeTab === 'stats' && (
                                <div className="stats-grid">
                                    <div className="stat-card">
                                        <span className="stat-value">{profileData?.stats.gamesPlayed ?? 0}</span>
                                        <span className="stat-label">{theme === 'stealth' ? 'Sessions' : 'Games Played'}</span>
                                    </div>
                                    <div className="stat-card">
                                        <span className="stat-value">{profileData?.stats.gamesWon ?? 0}</span>
                                        <span className="stat-label">{theme === 'stealth' ? 'Completed' : 'Wins'}</span>
                                    </div>
                                    <div className="stat-card">
                                        <span className="stat-value">{winRate}%</span>
                                        <span className="stat-label">{theme === 'stealth' ? 'Success Rate' : 'Win Rate'}</span>
                                    </div>
                                    <div className="stat-card">
                                        <span className="stat-value">{profileData?.stats.durakCount ?? 0}</span>
                                        <span className="stat-label">{theme === 'stealth' ? 'Tasks' : 'Durak Count'}</span>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'avatar' && isOwnProfile && (
                                <div className="avatar-picker">
                                    <p className="picker-label">Choose your avatar:</p>
                                    <div className="avatar-grid">
                                        {presetAvatars.map((emoji) => (
                                            <button
                                                key={emoji}
                                                className={`avatar-option ${selectedAvatar === emoji ? 'selected' : ''}`}
                                                onClick={() => updateAvatar(emoji)}
                                                disabled={isSaving}
                                            >
                                                {emoji}
                                            </button>
                                        ))}
                                    </div>
                                    {isSaving && <p className="saving-text">Saving...</p>}
                                </div>
                            )}

                            {activeTab === 'achievements' && (
                                <div className="achievements-list">
                                    <div className={`achievement ${(profileData?.stats.gamesPlayed ?? 0) > 0 ? '' : 'locked'}`}>
                                        <span className="achievement-icon">🎮</span>
                                        <div className="achievement-info">
                                            <span className="achievement-name">First Game</span>
                                            <span className="achievement-desc">Play your first game</span>
                                        </div>
                                    </div>
                                    <div className={`achievement ${(profileData?.stats.gamesWon ?? 0) > 0 ? '' : 'locked'}`}>
                                        <span className="achievement-icon">🏆</span>
                                        <div className="achievement-info">
                                            <span className="achievement-name">Victory!</span>
                                            <span className="achievement-desc">Win your first game</span>
                                        </div>
                                    </div>
                                    <div className={`achievement ${displayCredits >= 5000 ? '' : 'locked'}`}>
                                        <span className="achievement-icon">💰</span>
                                        <div className="achievement-info">
                                            <span className="achievement-name">Rich Player</span>
                                            <span className="achievement-desc">Have 5,000+ credits</span>
                                        </div>
                                    </div>
                                    <div className={`achievement ${(profileData?.stats.gamesPlayed ?? 0) >= 10 ? '' : 'locked'}`}>
                                        <span className="achievement-icon">🃏</span>
                                        <div className="achievement-info">
                                            <span className="achievement-name">Regular Player</span>
                                            <span className="achievement-desc">Play 10 games</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                {isOwnProfile && (
                    <div className="profile-footer">
                        <span className="member-since">Member since {memberDate}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
