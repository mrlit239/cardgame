import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import type { Card, Suit } from '../../../../shared/types/card';
import './Durak.css';

interface DurakGameProps {
    onLeave: () => void;
    isHost: boolean;
}

interface DurakPlayer {
    id: string;
    username: string;
    cardCount: number;
    isOut: boolean;
    hand?: Card[];
}

interface TableBout {
    attackCard: Card;
    defenseCard?: Card;
}

interface DurakState {
    players: DurakPlayer[];
    deck: Card[];
    trumpCard: Card | null;
    trumpSuit: Suit;
    table: TableBout[];
    attackerIndex: number;
    defenderIndex: number;
    currentActorIndex: number;
    phase: 'attacking' | 'defending' | 'ended';
    winners: string[];
    attackersDone: string[]; // Now an array
    myHand: Card[];
    betAmount: number;
    gameResults?: DurakGameResult[];
}

interface DurakGameResult {
    playerId: string;
    username: string;
    position: number;
    creditsChange: number;
    isDurak: boolean;
}

// Card rendering with suit symbols
const SUIT_SYMBOLS: Record<Suit, string> = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠'
};

const SUIT_COLORS: Record<Suit, string> = {
    hearts: '#ef4444',
    diamonds: '#ef4444',
    clubs: '#1f2937',
    spades: '#1f2937'
};

const RANK_DISPLAY: Record<number, string> = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
    11: 'J', 12: 'Q', 13: 'K', 14: 'A'
};

function PlayingCard({
    card,
    selected,
    onClick,
    small,
    isTrump,
    disabled
}: {
    card: Card;
    selected?: boolean;
    onClick?: () => void;
    small?: boolean;
    isTrump?: boolean;
    disabled?: boolean;
}) {
    const suitSymbol = SUIT_SYMBOLS[card.suit];
    const color = SUIT_COLORS[card.suit];
    const rank = RANK_DISPLAY[card.rank];

    return (
        <div
            className={`durak-card ${selected ? 'selected' : ''} ${small ? 'small' : ''} ${isTrump ? 'trump' : ''} ${disabled ? 'disabled' : ''}`}
            onClick={disabled ? undefined : onClick}
            style={{ color }}
        >
            <div className="card-corner top-left">
                <span className="card-rank">{rank}</span>
                <span className="card-suit">{suitSymbol}</span>
            </div>
            <div className="card-center">
                <span className="card-suit-large">{suitSymbol}</span>
            </div>
            <div className="card-corner bottom-right">
                <span className="card-rank">{rank}</span>
                <span className="card-suit">{suitSymbol}</span>
            </div>
        </div>
    );
}

function CardBack({ small }: { small?: boolean }) {
    return (
        <div className={`durak-card card-back ${small ? 'small' : ''}`}>
            <div className="card-back-pattern"></div>
        </div>
    );
}

export function DurakGame({ onLeave, isHost }: DurakGameProps) {
    const { user, socket } = useAuth();
    const { theme } = useTheme();
    const [gameState, setGameState] = useState<DurakState | null>(null);
    const [selectedCard, setSelectedCard] = useState<string | null>(null);
    const [selectedAttackCard, setSelectedAttackCard] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [isStarting, setIsStarting] = useState(false);
    const [gameStarted, setGameStarted] = useState(false);

    useEffect(() => {
        if (!socket) return;

        const handleStateUpdate = (state: DurakState) => {
            // attackersDone is now already an array from server
            setGameState(state);
            setSelectedCard(null);
            setSelectedAttackCard(null);
            setGameStarted(true);
        };

        const handleGameOver = (data: { winners: string[]; durak: { id: string; username: string } | null; gameResults?: DurakGameResult[] }) => {
            console.log('Game over! Durak:', data.durak?.username);
            // Results will be in gameState.gameResults
        };

        const handlePlayerLeft = () => {
            setError('A player left the game');
        };

        (socket as unknown as { on: (event: string, handler: (...args: unknown[]) => void) => void }).on('durak:stateUpdate', handleStateUpdate as (...args: unknown[]) => void);
        (socket as unknown as { on: (event: string, handler: (...args: unknown[]) => void) => void }).on('durak:gameOver', handleGameOver as (...args: unknown[]) => void);
        (socket as unknown as { on: (event: string, handler: (...args: unknown[]) => void) => void }).on('durak:playerLeft', handlePlayerLeft as (...args: unknown[]) => void);

        // Request current state
        (socket as unknown as { emit: (event: string, callback: (response: { success: boolean; state?: DurakState }) => void) => void }).emit('durak:getState', (response) => {
            if (response.success && response.state) {
                handleStateUpdate(response.state);
            }
        });

        return () => {
            (socket as unknown as { off: (event: string) => void }).off('durak:stateUpdate');
            (socket as unknown as { off: (event: string) => void }).off('durak:gameOver');
            (socket as unknown as { off: (event: string) => void }).off('durak:playerLeft');
        };
    }, [socket]);

    const startGame = useCallback(() => {
        if (!socket || !isHost) return;
        setIsStarting(true);
        // Bet amount now comes from room state, just use a placeholder
        (socket as unknown as { emit: (event: string, data: unknown, callback: (response: { success: boolean; message?: string }) => void) => void }).emit('durak:start', {}, (response) => {
            setIsStarting(false);
            if (!response.success) {
                setError(response.message || 'Failed to start game');
                setTimeout(() => setError(''), 3000);
            }
        });
    }, [socket, isHost]);

    const attack = useCallback((cardId: string) => {
        if (!socket) return;
        (socket as unknown as { emit: (event: string, data: unknown, callback: (response: { success: boolean; message?: string }) => void) => void }).emit('durak:attack', { cardIds: [cardId] }, (response) => {
            if (!response.success) {
                setError(response.message || 'Invalid attack');
                setTimeout(() => setError(''), 3000);
            }
        });
    }, [socket]);

    const defend = useCallback((attackCardId: string, defenseCardId: string) => {
        if (!socket) return;
        (socket as unknown as { emit: (event: string, data: unknown, callback: (response: { success: boolean; message?: string }) => void) => void }).emit('durak:defend', { attackCardId, defenseCardId }, (response) => {
            if (!response.success) {
                setError(response.message || 'Invalid defense');
                setTimeout(() => setError(''), 3000);
            }
        });
    }, [socket]);

    const pickUp = useCallback(() => {
        if (!socket) return;
        (socket as unknown as { emit: (event: string, callback: (response: { success: boolean; message?: string }) => void) => void }).emit('durak:pickup', (response) => {
            if (!response.success) {
                setError(response.message || 'Cannot pick up');
                setTimeout(() => setError(''), 3000);
            }
        });
    }, [socket]);

    const skipAttack = useCallback(() => {
        if (!socket) return;
        (socket as unknown as { emit: (event: string, callback: (response: { success: boolean; message?: string }) => void) => void }).emit('durak:skip', (response) => {
            if (!response.success) {
                setError(response.message || 'Cannot skip');
                setTimeout(() => setError(''), 3000);
            }
        });
    }, [socket]);

    const handleLeave = useCallback(() => {
        if (socket) {
            (socket as unknown as { emit: (event: string) => void }).emit('durak:leave');
        }
        onLeave();
    }, [socket, onLeave]);

    const handleCardClick = (cardId: string) => {
        if (!gameState || !user) return;

        const defender = gameState.players[gameState.defenderIndex];
        const isDefender = defender.id === user.id;
        const isAttacker = !isDefender;

        // Defender mode - if attack card selected, try to defend
        if (isDefender && gameState.phase === 'defending') {
            if (selectedAttackCard) {
                defend(selectedAttackCard, cardId);
                setSelectedAttackCard(null);
            } else {
                setSelectedCard(cardId);
            }
        }
        // Attacker mode
        else if (isAttacker && gameState.phase === 'attacking') {
            attack(cardId);
        }
    };

    const handleTableCardClick = (attackCardId: string) => {
        if (!gameState || !user) return;
        const defender = gameState.players[gameState.defenderIndex];
        const isDefender = defender.id === user.id;

        if (isDefender && gameState.phase === 'defending') {
            // Select this attack card to defend against
            const bout = gameState.table.find(b => b.attackCard.id === attackCardId);
            if (bout && !bout.defenseCard) {
                setSelectedAttackCard(attackCardId);
            }
        }
    };

    // Pre-game lobby - simplified since bet selection is now in GameRoom
    if (!gameStarted) {
        return (
            <div className={`durak-container ${theme === 'stealth' ? 'theme-stealth' : ''}`}>
                <div className="durak-header">
                    <button className="btn-link" onClick={handleLeave}>← Leave</button>
                    <h2>{theme === 'stealth' ? '📊 Sprint Planning' : '🃏 Bài Tấn (Durak)'}</h2>
                    <div></div>
                </div>
                <div className="durak-lobby">
                    <h3>{theme === 'stealth' ? 'Waiting for participants...' : 'Waiting for players...'}</h3>
                    {isHost ? (
                        <button
                            className="btn-primary btn-large"
                            onClick={startGame}
                            disabled={isStarting}
                        >
                            {isStarting ? 'Starting...' : '▶ Start Game'}
                        </button>
                    ) : (
                        <p>Waiting for host to start...</p>
                    )}
                    {error && <div className="error-toast">{error}</div>}
                </div>
            </div>
        );
    }

    // Loading
    if (!gameState) {
        return (
            <div className={`durak-container ${theme === 'stealth' ? 'theme-stealth' : ''}`}>
                <div className="durak-header">
                    <button className="btn-link" onClick={handleLeave}>← Leave</button>
                    <h2>{theme === 'stealth' ? '📊 Sprint Planning' : '🃏 Bài Tấn (Durak)'}</h2>
                    <div></div>
                </div>
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Loading game...</p>
                </div>
            </div>
        );
    }

    const attacker = gameState.players[gameState.attackerIndex];
    const defender = gameState.players[gameState.defenderIndex];
    const isDefender = defender?.id === user?.id;
    const isAttacker = attacker?.id === user?.id || (!isDefender && gameState.phase === 'attacking');
    const canAct = (isDefender && gameState.phase === 'defending') || (isAttacker && gameState.phase === 'attacking');
    const otherPlayers = gameState.players.filter(p => p.id !== user?.id);
    const undefendedCount = gameState.table.filter(b => !b.defenseCard).length;

    return (
        <div className={`durak-container ${theme === 'stealth' ? 'theme-stealth' : ''}`}>
            {/* Header */}
            <div className="durak-header">
                <button className="btn-link" onClick={handleLeave}>← Leave</button>
                <div className="game-status">
                    {gameState.phase === 'attacking' && (
                        <span>⚔️ {attacker?.username} is attacking</span>
                    )}
                    {gameState.phase === 'defending' && (
                        <span>🛡️ {defender?.username} must defend ({undefendedCount} left)</span>
                    )}
                    {gameState.phase === 'ended' && (
                        <span>🏁 Game Over!</span>
                    )}
                </div>
                <div className="trump-indicator">
                    Trump: <span style={{ color: SUIT_COLORS[gameState.trumpSuit] }}>{SUIT_SYMBOLS[gameState.trumpSuit]}</span>
                </div>
            </div>

            {error && <div className="error-toast">{error}</div>}

            {/* Game Over Modal */}
            {gameState.phase === 'ended' && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2>🏁 Game Over!</h2>
                        <div className="results-list">
                            <h3>Winners (escaped):</h3>
                            {gameState.winners.map((id, idx) => {
                                const player = gameState.players.find(p => p.id === id);
                                return (
                                    <div key={id} className="result-row winner">
                                        <span className="rank">#{idx + 1}</span>
                                        <span className="name">{player?.username}</span>
                                        <span className="badge">🏃 Escaped!</span>
                                    </div>
                                );
                            })}
                            {gameState.players.filter(p => !p.isOut && (p.cardCount || 0) > 0).map(player => (
                                <div key={player.id} className="result-row durak">
                                    <span className="rank">💀</span>
                                    <span className="name">{player.username}</span>
                                    <span className="badge">😵 Durak!</span>
                                </div>
                            ))}
                        </div>
                        <button className="btn-primary" onClick={handleLeave}>Back to Lobby</button>
                    </div>
                </div>
            )}

            {/* Main Game Area */}
            <div className="game-board">
                {/* Opponents at top */}
                <div className="opponents-row">
                    {otherPlayers.map((player) => {
                        const isTheirTurn = player.id === attacker?.id || player.id === defender?.id;
                        const role = player.id === attacker?.id ? '⚔️' : player.id === defender?.id ? '🛡️' : '';
                        return (
                            <div key={player.id} className={`opponent ${isTheirTurn ? 'active' : ''} ${player.isOut ? 'out' : ''}`}>
                                <div className="opponent-name">{role} {player.username}</div>
                                <div className="opponent-cards">
                                    {player.isOut ? (
                                        <span className="out-badge">Escaped!</span>
                                    ) : (
                                        Array.from({ length: Math.min(player.cardCount || 0, 6) }).map((_, i) => (
                                            <CardBack key={i} small />
                                        ))
                                    )}
                                </div>
                                <div className="card-count">{player.cardCount || 0} cards</div>
                            </div>
                        );
                    })}
                </div>

                {/* Center: Deck + Trump + Battlefield */}
                <div className="center-area">
                    {/* Deck on left */}
                    <div className="deck-area">
                        {gameState.deck.length > 0 && (
                            <>
                                <div className="deck-stack">
                                    <CardBack />
                                    <span className="deck-count">{gameState.deck.length}</span>
                                </div>
                                {gameState.trumpCard && (
                                    <div className="trump-card">
                                        <PlayingCard card={gameState.trumpCard} small isTrump />
                                    </div>
                                )}
                            </>
                        )}
                        {gameState.deck.length === 0 && (
                            <div className="deck-empty">No deck</div>
                        )}
                    </div>

                    {/* Battlefield - center */}
                    <div className="battlefield">
                        {gameState.table.length === 0 ? (
                            <div className="empty-table">
                                {gameState.phase === 'attacking' && isAttacker && (
                                    <span>Click a card to attack</span>
                                )}
                                {gameState.phase === 'attacking' && !isAttacker && (
                                    <span>Waiting for attack...</span>
                                )}
                            </div>
                        ) : (
                            <div className="bouts">
                                {gameState.table.map((bout, idx) => (
                                    <div
                                        key={idx}
                                        className={`bout ${selectedAttackCard === bout.attackCard.id ? 'selected' : ''} ${!bout.defenseCard ? 'undefended' : ''}`}
                                        onClick={() => handleTableCardClick(bout.attackCard.id)}
                                    >
                                        <div className="attack-card">
                                            <PlayingCard
                                                card={bout.attackCard}
                                                isTrump={bout.attackCard.suit === gameState.trumpSuit}
                                            />
                                        </div>
                                        {bout.defenseCard ? (
                                            <div className="defense-card">
                                                <PlayingCard
                                                    card={bout.defenseCard}
                                                    isTrump={bout.defenseCard.suit === gameState.trumpSuit}
                                                />
                                            </div>
                                        ) : (
                                            <div className="defense-placeholder">
                                                {isDefender && <span>?</span>}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* My Hand at bottom */}
                <div className="my-hand-area">
                    <div className="hand-header">
                        <span className="role-badge">
                            {isDefender ? '🛡️ Defending' : isAttacker ? '⚔️ Attacking' : '👀 Watching'}
                        </span>
                        <span>My Hand ({gameState.myHand.length} cards)</span>
                        {selectedAttackCard && (
                            <span className="hint">Select a card to defend</span>
                        )}
                    </div>
                    <div className="my-hand">
                        {gameState.myHand.map(card => (
                            <PlayingCard
                                key={card.id}
                                card={card}
                                selected={selectedCard === card.id}
                                onClick={() => handleCardClick(card.id)}
                                isTrump={card.suit === gameState.trumpSuit}
                                disabled={!canAct}
                            />
                        ))}
                    </div>

                    {/* Action Buttons */}
                    <div className="action-bar">
                        {isDefender && gameState.phase === 'defending' && (
                            <button className="btn-danger" onClick={pickUp}>
                                🫳 Pick Up All ({gameState.table.length} cards)
                            </button>
                        )}
                        {isAttacker && gameState.phase === 'attacking' && gameState.table.length > 0 && (
                            <button className="btn-secondary" onClick={skipAttack}>
                                ✓ Done Adding
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
