import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import type { Card } from '../../../../shared/types/card';
import './TienLen.css';

interface TienLenGameProps {
    onLeave: () => void;
    isHost: boolean;
}

interface TienLenPlayer {
    id: string;
    username: string;
    cardCount: number;
    hasPassed: boolean;
    isOut: boolean;
    hand?: Card[];
}

interface PlayedCombination {
    type: string;
    cards: Card[];
    playerId: string;
}

interface TienLenState {
    players: TienLenPlayer[];
    currentPlayerIndex: number;
    lastPlay: PlayedCombination | null;
    lastPlayerId: string | null;
    isFirstTurn: boolean;
    winners: string[];
    phase: 'waiting' | 'playing' | 'ended';
    variant: 'south' | 'north';
    myHand: Card[];
}

// STEALTH MODE: Disguise as IT/Agile tool
const TICKET_IDS: Record<number, string> = {
    3: 'TKT-301', 4: 'TKT-402', 5: 'TKT-503', 6: 'TKT-604',
    7: 'TKT-705', 8: 'TKT-806', 9: 'TKT-907', 10: 'TKT-108',
    11: 'TKT-111', 12: 'TKT-212', 13: 'TKT-313', 14: 'TKT-414', 2: 'TKT-002'
};

const PRIORITY_NAMES: Record<string, { name: string; color: string; icon: string }> = {
    hearts: { name: 'Critical', color: '#ef4444', icon: '🔴' },
    diamonds: { name: 'High', color: '#f97316', icon: '🟠' },
    clubs: { name: 'Medium', color: '#eab308', icon: '🟡' },
    spades: { name: 'Low', color: '#22c55e', icon: '🟢' }
};

const COMBO_WORK_NAMES: Record<string, string> = {
    single: 'Single Task',
    pair: 'Task Pair',
    triple: 'Task Group',
    fourOfAKind: 'Sprint Bundle',
    sequence: 'Release Chain',
    pairSequence: 'Epic Link'
};

function TicketCard({ card, selected, onClick, small }: { card: Card; selected?: boolean; onClick?: () => void; small?: boolean }) {
    const priority = PRIORITY_NAMES[card.suit];
    const ticketId = TICKET_IDS[card.rank];

    return (
        <div
            className={`ticket-card ${selected ? 'selected' : ''} ${small ? 'small' : ''}`}
            onClick={onClick}
            style={{ borderLeftColor: priority.color }}
        >
            <div className="ticket-header">
                <span className="ticket-id">{ticketId}</span>
                <span className="ticket-priority" style={{ background: priority.color }}>
                    {priority.name}
                </span>
            </div>
            <div className="ticket-body">
                <span className="ticket-points">{card.rank === 2 ? '∞' : card.rank} SP</span>
            </div>
            <div className="ticket-footer">
                <span className="ticket-status">{priority.icon} Ready</span>
            </div>
        </div>
    );
}

function TaskStack({ count }: { count: number }) {
    return (
        <div className="task-stack">
            <div className="stack-icon">📋</div>
            <span className="stack-count">{count} tasks</span>
        </div>
    );
}

export function TienLenGame({ onLeave, isHost }: TienLenGameProps) {
    const { user, socket } = useAuth();
    const [gameState, setGameState] = useState<TienLenState | null>(null);
    const [selectedCards, setSelectedCards] = useState<string[]>([]);
    const [error, setError] = useState('');
    const [isStarting, setIsStarting] = useState(false);
    const [variant, setVariant] = useState<'south' | 'north'>('south');
    const [gameStarted, setGameStarted] = useState(false);

    useEffect(() => {
        if (!socket) return;

        const handleStateUpdate = (state: TienLenState) => {
            setGameState(state);
            setSelectedCards([]);
            setGameStarted(true);
        };

        const handleGameConfig = (config: { variant: 'south' | 'north' }) => {
            setVariant(config.variant);
        };

        const handleGameOver = (data: { winners: string[] }) => {
            console.log('Sprint complete! Top performers:', data.winners);
        };

        const handlePlayerLeft = () => {
            setError('A team member disconnected');
        };

        (socket as unknown as { on: (event: string, handler: (...args: unknown[]) => void) => void }).on('tienlen:stateUpdate', handleStateUpdate as (...args: unknown[]) => void);
        (socket as unknown as { on: (event: string, handler: (...args: unknown[]) => void) => void }).on('tienlen:gameConfig', handleGameConfig as (...args: unknown[]) => void);
        (socket as unknown as { on: (event: string, handler: (...args: unknown[]) => void) => void }).on('tienlen:gameOver', handleGameOver as (...args: unknown[]) => void);
        (socket as unknown as { on: (event: string, handler: (...args: unknown[]) => void) => void }).on('tienlen:playerLeft', handlePlayerLeft as (...args: unknown[]) => void);

        // Request current state
        (socket as unknown as { emit: (event: string, callback: (response: { success: boolean; state?: TienLenState }) => void) => void }).emit('tienlen:getState', (response) => {
            if (response.success && response.state) {
                handleStateUpdate(response.state);
            }
        });

        return () => {
            (socket as unknown as { off: (event: string) => void }).off('tienlen:stateUpdate');
            (socket as unknown as { off: (event: string) => void }).off('tienlen:gameConfig');
            (socket as unknown as { off: (event: string) => void }).off('tienlen:gameOver');
            (socket as unknown as { off: (event: string) => void }).off('tienlen:playerLeft');
        };
    }, [socket]);

    const startGame = useCallback(() => {
        if (!socket || !isHost) return;
        setIsStarting(true);
        (socket as unknown as { emit: (event: string, data: unknown, callback: (response: { success: boolean; message?: string }) => void) => void }).emit('tienlen:start', { variant }, (response) => {
            setIsStarting(false);
            if (!response.success) {
                setError(response.message || 'Failed to start session');
                setTimeout(() => setError(''), 3000);
            }
        });
    }, [socket, variant, isHost]);

    const playCards = useCallback(() => {
        if (!socket || selectedCards.length === 0) return;
        (socket as unknown as { emit: (event: string, data: unknown, callback: (response: { success: boolean; message?: string }) => void) => void }).emit('tienlen:play', { cardIds: selectedCards }, (response) => {
            if (!response.success) {
                setError(response.message || 'Invalid assignment');
                setTimeout(() => setError(''), 3000);
            }
        });
    }, [socket, selectedCards]);

    const pass = useCallback(() => {
        if (!socket) return;
        (socket as unknown as { emit: (event: string, callback: (response: { success: boolean; message?: string }) => void) => void }).emit('tienlen:pass', (response) => {
            if (!response.success) {
                setError(response.message || 'Cannot skip');
                setTimeout(() => setError(''), 3000);
            }
        });
    }, [socket]);

    const toggleCard = (cardId: string) => {
        setSelectedCards(prev =>
            prev.includes(cardId)
                ? prev.filter(id => id !== cardId)
                : [...prev, cardId]
        );
    };

    const handleLeave = useCallback(() => {
        if (socket) {
            (socket as unknown as { emit: (event: string) => void }).emit('tienlen:leave');
        }
        onLeave();
    }, [socket, onLeave]);

    const getOtherPlayers = () => {
        if (!gameState) return [];
        return gameState.players.filter(p => p.id !== user?.id);
    };

    const isMyTurn = gameState && gameState.players[gameState.currentPlayerIndex]?.id === user?.id;
    const canPass = isMyTurn && gameState?.lastPlay && gameState.lastPlayerId !== user?.id;
    const currentPlayer = gameState?.players[gameState.currentPlayerIndex];

    // Settings screen - disguised as Sprint Setup
    if (!gameStarted) {
        return (
            <div className="sprint-container">
                <div className="sprint-header">
                    <button className="btn-link" onClick={handleLeave}>← Back to Dashboard</button>
                    <h2>📊 Sprint Planning Session</h2>
                    <span className="session-id">Session #{Math.random().toString(36).substr(2, 6).toUpperCase()}</span>
                </div>
                <div className="sprint-setup">
                    <h3>Configure Estimation Method</h3>

                    {isHost ? (
                        <>
                            <div className="method-selector">
                                <button
                                    className={`method-card ${variant === 'south' ? 'active' : ''}`}
                                    onClick={() => setVariant('south')}
                                >
                                    <span className="method-icon">🎯</span>
                                    <span className="method-name">Flex Scoring</span>
                                    <span className="method-desc">
                                        Allows sprint bundles and epic links to override blockers
                                    </span>
                                </button>
                                <button
                                    className={`method-card ${variant === 'north' ? 'active' : ''}`}
                                    onClick={() => setVariant('north')}
                                >
                                    <span className="method-icon">📏</span>
                                    <span className="method-name">Strict Mode</span>
                                    <span className="method-desc">
                                        Priority matching required. Same category only.
                                    </span>
                                </button>
                            </div>

                            <button
                                className="btn-primary btn-large"
                                onClick={startGame}
                                disabled={isStarting}
                            >
                                {isStarting ? 'Initializing...' : '▶ Start Planning Session'}
                            </button>
                        </>
                    ) : (
                        <div className="waiting-host">
                            <div className="spinner"></div>
                            <p>Waiting for Scrum Master to configure session...</p>
                            <p className="hint">The host will select the estimation method</p>
                        </div>
                    )}

                    {error && <div className="error-toast">{error}</div>}
                </div>
            </div>
        );
    }

    // Loading
    if (!gameState) {
        return (
            <div className="sprint-container">
                <div className="sprint-header">
                    <button className="btn-link" onClick={handleLeave}>← Back to Dashboard</button>
                    <h2>📊 Sprint Planning Session</h2>
                    <div></div>
                </div>
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Loading backlog items...</p>
                </div>
            </div>
        );
    }

    const otherPlayers = getOtherPlayers();

    return (
        <div className="sprint-container">
            {/* Header - looks like project tool header */}
            <div className="sprint-header">
                <button className="btn-link" onClick={handleLeave}>← Dashboard</button>
                <div className="sprint-info">
                    <span className="sprint-badge">{variant === 'south' ? '🎯 Flex' : '📏 Strict'}</span>
                    <span className="sprint-name">Sprint Planning</span>
                </div>
                <div className="turn-indicator">
                    {isMyTurn ? (
                        <span className="your-turn">📍 Your estimate needed</span>
                    ) : (
                        <span>⏳ Waiting for {currentPlayer?.username}...</span>
                    )}
                </div>
            </div>

            {error && <div className="error-toast">{error}</div>}

            {/* Sprint Complete Modal */}
            {gameState.phase === 'ended' && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2>🎉 Sprint Planning Complete!</h2>
                        <div className="results-list">
                            {gameState.winners.map((id, idx) => {
                                const player = gameState.players.find(p => p.id === id);
                                return (
                                    <div key={id} className={`result-row ${idx === 0 ? 'top-performer' : ''}`}>
                                        <span className="rank">#{idx + 1}</span>
                                        <span className="name">{player?.username}</span>
                                        <span className="badge">{idx === 0 ? '⭐ Top Performer' : 'Done'}</span>
                                    </div>
                                );
                            })}
                        </div>
                        <button className="btn-primary" onClick={handleLeave}>Back to Dashboard</button>
                    </div>
                </div>
            )}

            {/* Main Board - looks like Kanban/Sprint board */}
            <div className="planning-board">
                {/* Team Members Panel */}
                <div className="team-panel">
                    <h4>👥 Team Members</h4>
                    {otherPlayers.map((player) => {
                        const isTheirTurn = gameState.players[gameState.currentPlayerIndex]?.id === player.id;
                        return (
                            <div key={player.id} className={`team-member ${isTheirTurn ? 'active' : ''} ${player.hasPassed ? 'away' : ''} ${player.isOut ? 'done' : ''}`}>
                                <div className="member-avatar">{player.username.charAt(0).toUpperCase()}</div>
                                <div className="member-info">
                                    <span className="member-name">{player.username}</span>
                                    {player.isOut ? (
                                        <span className="member-status done">✓ Completed</span>
                                    ) : player.hasPassed ? (
                                        <span className="member-status away">Skipped</span>
                                    ) : (
                                        <TaskStack count={player.cardCount} />
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Central Board Area */}
                <div className="board-center">
                    <div className="current-review">
                        <h4>📋 Current Review</h4>
                        {gameState.lastPlay ? (
                            <div className="reviewed-items">
                                <div className="reviewer">
                                    Submitted by: {gameState.players.find(p => p.id === gameState.lastPlayerId)?.username}
                                    <span className="combo-tag">{COMBO_WORK_NAMES[gameState.lastPlay.type] || gameState.lastPlay.type}</span>
                                </div>
                                <div className="reviewed-cards">
                                    {gameState.lastPlay.cards.map((card, i) => (
                                        <TicketCard key={i} card={card} small />
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="empty-review">
                                {gameState.isFirstTurn ? (
                                    <span>Start with TKT-301 (Low Priority)</span>
                                ) : (
                                    <span>Submit any task group</span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* My Backlog - bottom section */}
            <div className="my-backlog">
                <div className="backlog-header">
                    <h4>📥 My Backlog ({gameState.myHand.length} items)</h4>
                    {selectedCards.length > 0 && (
                        <button className="btn-text" onClick={() => setSelectedCards([])}>
                            Clear selection ({selectedCards.length})
                        </button>
                    )}
                </div>
                <div className="backlog-items">
                    {gameState.myHand.map(card => (
                        <TicketCard
                            key={card.id}
                            card={card}
                            selected={selectedCards.includes(card.id)}
                            onClick={() => toggleCard(card.id)}
                        />
                    ))}
                </div>

                {/* Action Bar */}
                {isMyTurn && gameState.phase === 'playing' && (
                    <div className="action-bar">
                        <button
                            className="btn-secondary"
                            onClick={pass}
                            disabled={!canPass}
                        >
                            Skip Round
                        </button>
                        <button
                            className="btn-primary"
                            onClick={playCards}
                            disabled={selectedCards.length === 0}
                        >
                            Submit ({selectedCards.length} items)
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
