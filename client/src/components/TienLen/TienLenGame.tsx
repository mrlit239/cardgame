import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import type { Card } from '../../../../shared/types/card';
import './TienLen.css';

interface TienLenGameProps {
    onLeave: () => void;
}

interface TienLenPlayer {
    id: string;
    username: string;
    cardCount: number;
    passed: boolean;
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
    phase: 'playing' | 'ended';
    variant: 'south' | 'north';
    myHand: Card[];
}

const RANK_NAMES: Record<number, string> = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
    11: 'J', 12: 'Q', 13: 'K', 14: 'A'
};

const SUIT_SYMBOLS: Record<string, string> = {
    hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠'
};

const COMBINATION_NAMES: Record<string, string> = {
    single: 'Lẻ',
    pair: 'Đôi',
    triple: 'Bộ Ba',
    fourOfAKind: 'Tứ Quý',
    sequence: 'Sảnh',
    doubleSequence: 'Sảnh Đôi',
    tripleSequence: 'Sảnh Ba'
};

function PlayCard({ card, selected, onClick, small }: { card: Card; selected?: boolean; onClick?: () => void; small?: boolean }) {
    const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
    return (
        <div
            className={`tl-card ${isRed ? 'red' : 'black'} ${selected ? 'selected' : ''} ${small ? 'small' : ''}`}
            onClick={onClick}
        >
            <div className="card-corner top-left">
                <span className="rank">{RANK_NAMES[card.rank]}</span>
                <span className="suit">{SUIT_SYMBOLS[card.suit]}</span>
            </div>
            <div className="card-center">
                <span className="big-suit">{SUIT_SYMBOLS[card.suit]}</span>
            </div>
            <div className="card-corner bottom-right">
                <span className="rank">{RANK_NAMES[card.rank]}</span>
                <span className="suit">{SUIT_SYMBOLS[card.suit]}</span>
            </div>
        </div>
    );
}

function CardBack({ count }: { count: number }) {
    return (
        <div className="card-back-stack">
            {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                <div
                    key={i}
                    className="tl-card-back"
                    style={{ transform: `translateX(${i * 3}px) translateY(${i * -2}px)` }}
                >
                    <div className="card-back-pattern">🂠</div>
                </div>
            ))}
            <span className="card-count">{count}</span>
        </div>
    );
}

export function TienLenGame({ onLeave }: TienLenGameProps) {
    const { user, socket } = useAuth();
    const [gameState, setGameState] = useState<TienLenState | null>(null);
    const [selectedCards, setSelectedCards] = useState<string[]>([]);
    const [error, setError] = useState('');
    const [isStarting, setIsStarting] = useState(false);
    const [variant, setVariant] = useState<'south' | 'north'>('south');
    const [showSettings, setShowSettings] = useState(true);

    useEffect(() => {
        if (!socket) return;

        const handleStateUpdate = (state: TienLenState) => {
            setGameState(state);
            setSelectedCards([]);
            setShowSettings(false);
        };

        const handleGameOver = (data: { winners: string[] }) => {
            console.log('Game over! Winners:', data.winners);
        };

        const handlePlayerLeft = () => {
            setError('A player left the game');
        };

        (socket as unknown as { on: (event: string, handler: (...args: unknown[]) => void) => void }).on('tienlen:stateUpdate', handleStateUpdate as (...args: unknown[]) => void);
        (socket as unknown as { on: (event: string, handler: (...args: unknown[]) => void) => void }).on('tienlen:gameOver', handleGameOver as (...args: unknown[]) => void);
        (socket as unknown as { on: (event: string, handler: (...args: unknown[]) => void) => void }).on('tienlen:playerLeft', handlePlayerLeft as (...args: unknown[]) => void);

        return () => {
            (socket as unknown as { off: (event: string) => void }).off('tienlen:stateUpdate');
            (socket as unknown as { off: (event: string) => void }).off('tienlen:gameOver');
            (socket as unknown as { off: (event: string) => void }).off('tienlen:playerLeft');
        };
    }, [socket]);

    const startGame = useCallback(() => {
        if (!socket) return;
        setIsStarting(true);
        (socket as unknown as { emit: (event: string, data: unknown, callback: (response: { success: boolean; message?: string }) => void) => void }).emit('tienlen:start', { variant }, (response) => {
            setIsStarting(false);
            if (!response.success) {
                setError(response.message || 'Failed to start game');
            }
        });
    }, [socket, variant]);

    const playCards = useCallback(() => {
        if (!socket || selectedCards.length === 0) return;
        (socket as unknown as { emit: (event: string, data: unknown, callback: (response: { success: boolean; message?: string }) => void) => void }).emit('tienlen:play', { cardIds: selectedCards }, (response) => {
            if (!response.success) {
                setError(response.message || 'Invalid play');
                setTimeout(() => setError(''), 3000);
            }
        });
    }, [socket, selectedCards]);

    const pass = useCallback(() => {
        if (!socket) return;
        (socket as unknown as { emit: (event: string, callback: (response: { success: boolean; message?: string }) => void) => void }).emit('tienlen:pass', (response) => {
            if (!response.success) {
                setError(response.message || 'Cannot pass');
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

    // Get other players in clockwise order from my position
    const getOtherPlayers = () => {
        if (!gameState) return [];
        const others = gameState.players.filter(p => p.id !== user?.id);
        // Order: left, top, right (for 4 players) or top-left, top-right (for 3 players)
        return others;
    };

    const isMyTurn = gameState && gameState.players[gameState.currentPlayerIndex]?.id === user?.id;
    const canPass = isMyTurn && gameState?.lastPlay && gameState.lastPlayerId !== user?.id;
    const currentPlayer = gameState?.players[gameState.currentPlayerIndex];

    // Settings screen
    if (showSettings) {
        return (
            <div className="tl-container">
                <div className="tl-header">
                    <button className="btn btn-secondary" onClick={handleLeave}>← Thoát</button>
                    <h2>🃏 Tiến Lên</h2>
                    <div></div>
                </div>
                <div className="tl-settings">
                    <h3>Chọn Kiểu Chơi</h3>
                    <div className="variant-selector">
                        <button
                            className={`variant-card ${variant === 'south' ? 'active' : ''}`}
                            onClick={() => setVariant('south')}
                        >
                            <span className="variant-icon">🌴</span>
                            <span className="variant-name">Miền Nam</span>
                            <span className="variant-desc">Có chặt: Tứ Quý chặt Heo, Sảnh Đôi chặt đôi Heo</span>
                        </button>
                        <button
                            className={`variant-card ${variant === 'north' ? 'active' : ''}`}
                            onClick={() => setVariant('north')}
                        >
                            <span className="variant-icon">🏔️</span>
                            <span className="variant-name">Miền Bắc</span>
                            <span className="variant-desc">Luật truyền thống, không có chặt đặc biệt</span>
                        </button>
                    </div>
                    <button
                        className="btn btn-primary btn-large"
                        onClick={startGame}
                        disabled={isStarting}
                    >
                        {isStarting ? 'Đang bắt đầu...' : '🎮 Bắt Đầu'}
                    </button>
                </div>
            </div>
        );
    }

    // Loading
    if (!gameState) {
        return (
            <div className="tl-container">
                <div className="tl-header">
                    <button className="btn btn-secondary" onClick={handleLeave}>← Thoát</button>
                    <h2>🃏 Tiến Lên</h2>
                    <div></div>
                </div>
                <div className="tl-loading">
                    <div className="spinner"></div>
                    <p>Đang chờ game bắt đầu...</p>
                </div>
            </div>
        );
    }

    const otherPlayers = getOtherPlayers();

    return (
        <div className="tl-container">
            {/* Header */}
            <div className="tl-header">
                <button className="btn btn-secondary" onClick={handleLeave}>← Thoát</button>
                <div className="game-info">
                    <span className="variant-badge">{variant === 'south' ? '🌴 Miền Nam' : '🏔️ Miền Bắc'}</span>
                </div>
                <div className="turn-info">
                    {isMyTurn ? (
                        <span className="your-turn">🎯 Lượt của bạn</span>
                    ) : (
                        <span>Đang chờ {currentPlayer?.username}...</span>
                    )}
                </div>
            </div>

            {error && <div className="tl-error">{error}</div>}

            {/* Game Over Overlay */}
            {gameState.phase === 'ended' && (
                <div className="game-over-overlay">
                    <div className="game-over-modal">
                        <h2>🎉 Kết Thúc!</h2>
                        <div className="final-rankings">
                            {gameState.winners.map((id, idx) => {
                                const player = gameState.players.find(p => p.id === id);
                                return (
                                    <div key={id} className={`final-rank rank-${idx + 1}`}>
                                        <span className="position">
                                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}
                                        </span>
                                        <span className="name">{player?.username}</span>
                                    </div>
                                );
                            })}
                        </div>
                        <button className="btn btn-primary" onClick={handleLeave}>Về Sảnh</button>
                    </div>
                </div>
            )}

            {/* Play Table */}
            <div className="tl-table">
                {/* Other Players around the table */}
                <div className="table-players">
                    {otherPlayers.map((player, index) => {
                        const isTheirTurn = gameState.players[gameState.currentPlayerIndex]?.id === player.id;
                        const position = otherPlayers.length === 1 ? 'top'
                            : otherPlayers.length === 2 ? (index === 0 ? 'left' : 'right')
                                : (index === 0 ? 'left' : index === 1 ? 'top' : 'right');

                        return (
                            <div key={player.id} className={`table-player ${position} ${isTheirTurn ? 'active' : ''} ${player.passed ? 'passed' : ''} ${player.isOut ? 'out' : ''}`}>
                                <div className="player-seat">
                                    <div className="player-avatar">
                                        {player.username.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="player-details">
                                        <span className="player-name">{player.username}</span>
                                        {player.isOut ? (
                                            <span className="player-status finished">✓ Thắng</span>
                                        ) : player.passed ? (
                                            <span className="player-status passed">Bỏ lượt</span>
                                        ) : (
                                            <CardBack count={player.cardCount} />
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Center Play Area */}
                <div className="table-center">
                    <div className="play-surface">
                        {gameState.lastPlay ? (
                            <div className="last-played">
                                <div className="played-by">
                                    {gameState.players.find(p => p.id === gameState.lastPlayerId)?.username}
                                    <span className="combo-type">{COMBINATION_NAMES[gameState.lastPlay.type] || gameState.lastPlay.type}</span>
                                </div>
                                <div className="played-cards">
                                    {gameState.lastPlay.cards.map((card, i) => (
                                        <PlayCard key={i} card={card} small />
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="empty-table">
                                {gameState.isFirstTurn ? (
                                    <span>Lượt đầu - Phải có 3♠</span>
                                ) : (
                                    <span>Vòng mới - Đánh bài bất kỳ</span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* My Hand */}
            <div className="my-section">
                <div className="my-hand-header">
                    <span className="hand-label">Bài của bạn ({gameState.myHand.length})</span>
                    {selectedCards.length > 0 && (
                        <button className="btn-clear" onClick={() => setSelectedCards([])}>
                            Bỏ chọn ({selectedCards.length})
                        </button>
                    )}
                </div>
                <div className="my-hand">
                    {gameState.myHand.map(card => (
                        <PlayCard
                            key={card.id}
                            card={card}
                            selected={selectedCards.includes(card.id)}
                            onClick={() => toggleCard(card.id)}
                        />
                    ))}
                </div>

                {/* Controls */}
                {isMyTurn && gameState.phase === 'playing' && (
                    <div className="action-bar">
                        <button
                            className="btn btn-danger"
                            onClick={pass}
                            disabled={!canPass}
                        >
                            Bỏ Lượt
                        </button>
                        <button
                            className="btn btn-success btn-large"
                            onClick={playCards}
                            disabled={selectedCards.length === 0}
                        >
                            Đánh ({selectedCards.length} lá)
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
