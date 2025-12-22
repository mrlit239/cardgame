import { useState } from 'react';
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
    };
}

// Generate avatar color based on username
function getAvatarColor(username: string): string {
    const colors = [
        'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
        'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
        'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
        'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
        'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
    ];
    const index = username.charCodeAt(0) % colors.length;
    return colors[index];
}

export function UserProfile({ isOpen, onClose, targetUser }: UserProfileProps) {
    const { user, credits } = useAuth();
    const { theme } = useTheme();
    const [activeTab, setActiveTab] = useState<'stats' | 'achievements'>('stats');

    if (!isOpen) return null;

    // Use target user if provided, otherwise show current user
    const displayUser = targetUser || user;
    const displayCredits = targetUser?.credits ?? credits;
    const isOwnProfile = !targetUser || targetUser.id === user?.id;

    if (!displayUser) return null;

    return (
        <div className="profile-overlay" onClick={onClose}>
            <div
                className={`profile-modal ${theme === 'stealth' ? 'theme-stealth' : ''}`}
                onClick={(e) => e.stopPropagation()}
            >
                <button className="profile-close" onClick={onClose}>×</button>

                {/* Header */}
                <div className="profile-header">
                    <div
                        className="profile-avatar"
                        style={{ background: getAvatarColor(displayUser.username) }}
                    >
                        {displayUser.username.charAt(0).toUpperCase()}
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
                    <button
                        className={`tab ${activeTab === 'achievements' ? 'active' : ''}`}
                        onClick={() => setActiveTab('achievements')}
                    >
                        🏆 {theme === 'stealth' ? 'Milestones' : 'Achievements'}
                    </button>
                </div>

                {/* Tab Content */}
                <div className="profile-content">
                    {activeTab === 'stats' && (
                        <div className="stats-grid">
                            <div className="stat-card">
                                <span className="stat-value">0</span>
                                <span className="stat-label">{theme === 'stealth' ? 'Sessions' : 'Games Played'}</span>
                            </div>
                            <div className="stat-card">
                                <span className="stat-value">0</span>
                                <span className="stat-label">{theme === 'stealth' ? 'Completed' : 'Wins'}</span>
                            </div>
                            <div className="stat-card">
                                <span className="stat-value">0%</span>
                                <span className="stat-label">{theme === 'stealth' ? 'Success Rate' : 'Win Rate'}</span>
                            </div>
                            <div className="stat-card">
                                <span className="stat-value">0</span>
                                <span className="stat-label">{theme === 'stealth' ? 'Tasks' : 'Durak Count'}</span>
                            </div>
                        </div>
                    )}
                    {activeTab === 'achievements' && (
                        <div className="achievements-list">
                            <div className="achievement locked">
                                <span className="achievement-icon">🎮</span>
                                <div className="achievement-info">
                                    <span className="achievement-name">First Game</span>
                                    <span className="achievement-desc">Play your first game</span>
                                </div>
                            </div>
                            <div className="achievement locked">
                                <span className="achievement-icon">🏆</span>
                                <div className="achievement-info">
                                    <span className="achievement-name">Victory!</span>
                                    <span className="achievement-desc">Win your first game</span>
                                </div>
                            </div>
                            <div className="achievement locked">
                                <span className="achievement-icon">💰</span>
                                <div className="achievement-info">
                                    <span className="achievement-name">High Roller</span>
                                    <span className="achievement-desc">Win 10,000 credits</span>
                                </div>
                            </div>
                            <div className="achievement locked">
                                <span className="achievement-icon">🃏</span>
                                <div className="achievement-info">
                                    <span className="achievement-name">Card Shark</span>
                                    <span className="achievement-desc">Win 10 games in a row</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {isOwnProfile && (
                    <div className="profile-footer">
                        <span className="member-since">Member since Dec 2024</span>
                    </div>
                )}
            </div>
        </div>
    );
}
