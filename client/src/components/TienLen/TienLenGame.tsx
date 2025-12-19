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

function CardDisplay({ card, selected, onClick }: { card: Card; selected?: boolean; onClick?: () => void }) {
    const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
    return (
        <div
            className={`tienlen-card ${isRed ? 'red' : 'black'} ${selected ? 'selected' : ''}`}
            onClick={onClick}
        >
            <span className="card-rank">{RANK_NAMES[card.rank]}</span>
            <span className="card-suit">{SUIT_SYMBOLS[card.suit]}</span>
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

        socket.on('tienlen:stateUpdate' as any, (state: TienLenState) => {
            setGameState(state);
            setSelectedCards([]);
            setShowSettings(false);
        });

        socket.on('tienlen:gameOver' as any, (data: { winners: string[] }) => {
            console.log('Game over! Winners:', data.winners);
        });

        socket.on('tienlen:playerLeft' as any, () => {
            setError('A player left the game');
        });

        return () => {
            socket.off('tienlen:stateUpdate' as any);
            socket.off('tienlen:gameOver' as any);
            socket.off('tienlen:playerLeft' as any);
        };
    }, [socket]);

    const startGame = useCallback(() => {
        if (!socket) return;
        setIsStarting(true);
        (socket as any).emit('tienlen:start', { variant }, (response: { success: boolean; message?: string }) => {
            setIsStarting(false);
            if (!response.success) {
                setError(response.message || 'Failed to start game');
            }
        });
    }, [socket, variant]);

    const playCards = useCallback(() => {
        if (!socket || selectedCards.length === 0) return;
        (socket as any).emit('tienlen:play', { cardIds: selectedCards }, (response: { success: boolean; message?: string }) => {
            if (!response.success) {
                setError(response.message || 'Invalid play');
                setTimeout(() => setError(''), 3000);
            }
        });
    }, [socket, selectedCards]);

    const pass = useCallback(() => {
        if (!socket) return;
        (socket as any).emit('tienlen:pass', (response: { success: boolean; message?: string }) => {
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
            (socket as any).emit('tienlen:leave');
        }
        onLeave();
    }, [socket, onLeave]);

    const isMyTurn = gameState && gameState.players[gameState.currentPlayerIndex]?.id === user?.id;
    const canPass = isMyTurn && gameState?.lastPlay && gameState.lastPlayerId !== user?.id;

    // Settings screen
    if (showSettings) {
        return (
            <div className="tienlen-container">
                <div className="tienlen-header">
                    <button className="btn btn-secondary" onClick={handleLeave}>← Leave</button>
                    <h2>🃏 Tiến Lên</h2>
                </div>
                <div className="tienlen-settings">
                    <h3>Game Settings</h3>
                    <div className="variant-selector">
                        <label>Variant:</label>
                        <div className="variant-options">
                            <button
                                className={`variant-btn ${variant === 'south' ? 'active' : ''}`}
                                onClick={() => setVariant('south')}
                            >
                                Miền Nam (South)
                            </button>
                            <button
                                className={`variant-btn ${variant === 'north' ? 'active' : ''}`}
                                onClick={() => setVariant('north')}
                            >
                                Miền Bắc (North)
                            </button>
                        </div>
                    </div>
                    <div className="variant-info">
                        {variant === 'south' ? (
                            <p>Southern rules: Chops enabled - Tứ Quý beats single 2, Sảnh Đôi beats 2s</p>
                        ) : (
                            <p>Northern rules: Traditional climbing rules</p>
                        )}
                    </div>
                    <button
                        className="btn btn-primary btn-large"
                        onClick={startGame}
                        disabled={isStarting}
                    >
                        {isStarting ? 'Starting...' : 'Start Game'}
                    </button>
                </div>
            </div>
        );
    }

    // Loading
    if (!gameState) {
        return (
            <div className="tienlen-container">
                <div className="tienlen-header">
                    <button className="btn btn-secondary" onClick={handleLeave}>← Leave</button>
                </div>
                <div className="tienlen-loading">
                    <div className="spinner"></div>
                    <p>Waiting for game to start...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="tienlen-container">
            {/* Header */}
            <div className="tienlen-header">
                <button className="btn btn-secondary" onClick={handleLeave}>← Leave</button>
                <h2>🃏 Tiến Lên ({variant === 'south' ? 'Miền Nam' : 'Miền Bắc'})</h2>
                <div className="turn-indicator">
                    {isMyTurn ? '🎯 Your Turn' : `Waiting for ${gameState.players[gameState.currentPlayerIndex]?.username}`}
                </div>
            </div>

            {error && <div className="tienlen-error">{error}</div>}

            {/* Game Over */}
            {gameState.phase === 'ended' && (
                <div className="game-over-overlay">
                    <div className="game-over-content">
                        <h2>🏆 Game Over!</h2>
                        <div className="rankings">
                            {gameState.winners.map((id, idx) => {
                                const player = gameState.players.find(p => p.id === id);
                                return (
                                    <div key={id} className="rank-row">
                                        <span className="rank-position">{idx + 1}.</span>
                                        <span className="rank-name">{player?.username || id}</span>
                                        {idx === 0 && <span className="rank-trophy">👑</span>}
                                    </div>
                                );
                            })}
                        </div>
                        <button className="btn btn-primary" onClick={handleLeave}>Back to Lobby</button>
                    </div>
                </div>
            )}

            {/* Other Players */}
            <div className="other-players">
                {gameState.players.filter(p => p.id !== user?.id).map((player) => (
                    <div
                        key={player.id}
                        className={`other-player ${gameState.players[gameState.currentPlayerIndex]?.id === player.id ? 'current-turn' : ''} ${player.passed ? 'passed' : ''} ${player.isOut ? 'finished' : ''}`}
                    >
                        <div className="player-avatar">{player.username.charAt(0).toUpperCase()}</div>
                        <div className="player-info">
                            <span className="player-name">{player.username}</span>
                            <span className="player-cards">
                                {player.isOut ? '✓ Finished' : `${player.cardCount} cards`}
                            </span>
                            {player.passed && !player.isOut && <span className="player-passed">Passed</span>}
                        </div>
                    </div>
                ))}
            </div>

            {/* Last Play */}
            <div className="play-area">
                <div className="last-play">
                    {gameState.lastPlay ? (
                        <>
                            <div className="last-play-label">
                                {gameState.players.find(p => p.id === gameState.lastPlayerId)?.username}'s play ({gameState.lastPlay.type})
                            </div>
                            <div className="played-cards">
                                {gameState.lastPlay.cards.map((card, i) => (
                                    <CardDisplay key={i} card={card} />
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="play-area-empty">
                            {gameState.isFirstTurn ? 'First play - must include 3♠' : 'New round - play any combination'}
                        </div>
                    )}
                </div>
            </div>

            {/* My Hand */}
            <div className="my-hand">
                <h4>Your Hand ({gameState.myHand.length} cards)</h4>
                <div className="hand-cards">
                    {gameState.myHand.map(card => (
                        <CardDisplay
                            key={card.id}
                            card={card}
                            selected={selectedCards.includes(card.id)}
                            onClick={() => toggleCard(card.id)}
                        />
                    ))}
                </div>
            </div>

            {/* Controls */}
            {isMyTurn && gameState.phase === 'playing' && (
                <div className="tienlen-controls">
                    <button
                        className="btn btn-primary"
                        onClick={playCards}
                        disabled={selectedCards.length === 0}
                    >
                        Play ({selectedCards.length} cards)
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={pass}
                        disabled={!canPass}
                    >
                        Pass
                    </button>
                    <button
                        className="btn btn-outline"
                        onClick={() => setSelectedCards([])}
                    >
                        Clear
                    </button>
                </div>
            )}
        </div>
    );
}
