import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import './Uno.css';

// UNO Types - matching server
type UnoColor = 'red' | 'yellow' | 'green' | 'blue' | 'wild';
type UnoValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 'skip' | 'reverse' | 'draw2' | 'wild' | 'draw4';

interface UnoCard {
    id: string;
    color: UnoColor;
    value: UnoValue;
}

interface UnoPlayer {
    id: string;
    username: string;
    hand: UnoCard[];
    saidUno: boolean;
    isOut: boolean;
}

interface UnoResult {
    playerId: string;
    username: string;
    rank: number;
    handScore: number;
    creditsChange: number;
}

interface UnoState {
    roomId: string;
    players: UnoPlayer[];
    currentPlayerIndex: number;
    direction: 1 | -1;
    drawPile: UnoCard[];
    discardPile: UnoCard[];
    currentColor: UnoColor;
    pendingDraw: number;
    phase: 'waiting' | 'playing' | 'selectingColor' | 'finished';
    winnerId: string | null;
    results: UnoResult[];
    lastPlayerId: string | null;
}

interface UnoGameProps {
    roomId: string;
    onLeave: () => void;
}

export function UnoGame({ onLeave }: UnoGameProps) {
    const { user, socket } = useAuth();
    const { theme } = useTheme();
    const [gameState, setGameState] = useState<UnoState | null>(null);
    const [error, setError] = useState('');
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const [gameStarted, setGameStarted] = useState(false);

    useEffect(() => {
        if (!socket) return;

        const s = socket as unknown as {
            on: (event: string, handler: (...args: unknown[]) => void) => void;
            off: (event: string) => void;
        };

        s.on('uno:started', (state: unknown) => {
            setGameState(state as UnoState);
            setGameStarted(true);
            setError('');
        });

        s.on('uno:stateUpdate', (state: unknown) => {
            const unoState = state as UnoState;
            setGameState(unoState);
            if (unoState.phase === 'selectingColor') {
                const currentPlayer = unoState.players[unoState.currentPlayerIndex];
                if (currentPlayer.id === user?.id) {
                    setShowColorPicker(true);
                }
            } else {
                setShowColorPicker(false);
            }
        });

        s.on('uno:selectColor', () => {
            setShowColorPicker(true);
        });

        s.on('uno:gameOver', (data: unknown) => {
            const { state } = data as { results: UnoResult[]; state: UnoState };
            setGameState(state);
            setShowResults(true);
        });

        s.on('uno:unoCalled', (data: unknown) => {
            const { username } = data as { playerId: string; username: string };
            setError(`${username} called UNO!`);
            setTimeout(() => setError(''), 2000);
        });

        s.on('uno:unoChallenge', (data: unknown) => {
            const { message } = data as { targetId: string; penalty: number; message: string };
            setError(message);
            setTimeout(() => setError(''), 3000);
        });

        return () => {
            s.off('uno:started');
            s.off('uno:stateUpdate');
            s.off('uno:selectColor');
            s.off('uno:gameOver');
            s.off('uno:unoCalled');
            s.off('uno:unoChallenge');
        };
    }, [socket, user?.id]);

    // Type-safe socket emit helper
    const emitUno = useCallback((event: string, data?: unknown, callback?: (response: unknown) => void) => {
        if (!socket) return;
        const s = socket as unknown as { emit: (event: string, data?: unknown, callback?: (response: unknown) => void) => void };
        if (callback) {
            s.emit(event, data, callback);
        } else if (data !== undefined) {
            s.emit(event, data);
        } else {
            s.emit(event);
        }
    }, [socket]);

    const startGame = useCallback(() => {
        emitUno('uno:start', {}, (response: unknown) => {
            const r = response as { success: boolean; message?: string };
            if (!r.success) {
                setError(r.message || 'Failed to start game');
            }
        });
    }, [emitUno]);

    const playCard = useCallback((cardId: string) => {
        emitUno('uno:play', { cardId }, (response: unknown) => {
            const r = response as { success: boolean; message?: string; needsColorSelect?: boolean };
            if (!r.success) {
                setError(r.message || 'Invalid play');
                setTimeout(() => setError(''), 2000);
            }
        });
    }, [emitUno]);

    const selectColor = useCallback((color: UnoColor) => {
        emitUno('uno:selectColor', { color }, (response: unknown) => {
            const r = response as { success: boolean; message?: string };
            if (r.success) {
                setShowColorPicker(false);
            }
        });
    }, [emitUno]);

    const drawCard = useCallback(() => {
        emitUno('uno:draw', undefined, (response: unknown) => {
            const r = response as { success: boolean; message?: string; mustPlay?: boolean };
            if (!r.success) {
                setError(r.message || 'Cannot draw');
                setTimeout(() => setError(''), 2000);
            }
        });
    }, [emitUno]);

    const callUno = useCallback(() => {
        emitUno('uno:callUno', undefined, (response: unknown) => {
            const r = response as { success: boolean; message?: string };
            if (!r.success) {
                setError(r.message || 'Cannot call UNO');
                setTimeout(() => setError(''), 2000);
            }
        });
    }, [emitUno]);

    const handleLeave = useCallback(() => {
        emitUno('uno:leave');
        onLeave();
    }, [emitUno, onLeave]);

    // Get my hand
    const myPlayer = gameState?.players.find(p => p.id === user?.id);
    const myHand = myPlayer?.hand || [];
    const isMyTurn = gameState && gameState.players[gameState.currentPlayerIndex]?.id === user?.id;
    const topCard = gameState?.discardPile[gameState.discardPile.length - 1];

    // Check if card is playable
    const isCardPlayable = (card: UnoCard): boolean => {
        if (!isMyTurn || !topCard || !gameState) return false;
        if (gameState.phase !== 'playing') return false;

        // Pending draw - can only stack
        if (gameState.pendingDraw > 0) {
            if (topCard.value === 'draw2' && card.value === 'draw2') return true;
            if (topCard.value === 'draw4' && card.value === 'draw4') return true;
            return false;
        }

        if (card.color === 'wild') return true;
        if (card.color === gameState.currentColor) return true;
        if (card.value === topCard.value) return true;
        return false;
    };

    // Render card
    const renderCard = (card: UnoCard, clickable = false, isPlayable = false) => {
        const colorClass = card.color === 'wild' ? 'wild' : card.color;
        const valueDisplay = typeof card.value === 'number' ? card.value :
            card.value === 'skip' ? '⊘' :
                card.value === 'reverse' ? '↻' :
                    card.value === 'draw2' ? '+2' :
                        card.value === 'wild' ? '★' : '+4';

        return (
            <div
                key={card.id}
                className={`uno-card ${colorClass} ${clickable && isPlayable ? 'playable' : ''} ${clickable && !isPlayable ? 'not-playable' : ''}`}
                onClick={() => clickable && isPlayable && playCard(card.id)}
            >
                <span className="card-value">{valueDisplay}</span>
                {card.color === 'wild' && <span className="card-wild-colors">🔴🟡🟢🔵</span>}
            </div>
        );
    };

    // Setup screen
    if (!gameStarted) {
        return (
            <div className={`uno-container ${theme === 'stealth' ? 'theme-stealth' : ''}`}>
                <header className="uno-header">
                    <button className="btn-link" onClick={handleLeave}>← Back to Lobby</button>
                    <h2>UNO - Waiting Room</h2>
                </header>
                <div className="uno-setup">
                    <div className="setup-card">
                        <h3>🔴 UNO</h3>
                        <p className="setup-info">
                            Match cards by color or number!
                            {'\n'}Action cards: Skip, Reverse, +2
                            {'\n'}Wild cards: Change color, +4
                        </p>
                        <button className="btn-primary btn-large" onClick={startGame}>
                            🎴 Start Game
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Get other players
    const otherPlayers = gameState?.players.filter(p => p.id !== user?.id) || [];

    return (
        <div className={`uno-container ${theme === 'stealth' ? 'theme-stealth' : ''}`}>
            {/* Header */}
            <header className="uno-header">
                <button className="btn-link" onClick={handleLeave}>← Leave</button>
                <div className="game-info">
                    <span className="game-badge">UNO</span>
                    {(gameState?.pendingDraw ?? 0) > 0 && (
                        <span className="pending-draw">+{gameState?.pendingDraw} pending!</span>
                    )}
                </div>
                <div className="direction-indicator">
                    {gameState?.direction === 1 ? '➡️ Clockwise' : '⬅️ Counter'}
                </div>
            </header>

            {/* Error Toast */}
            {error && <div className="error-toast">{error}</div>}

            {/* Other Players */}
            <div className="other-players">
                {otherPlayers.map(player => {
                    const isCurrent = gameState?.players[gameState.currentPlayerIndex]?.id === player.id;
                    return (
                        <div key={player.id} className={`player-slot ${isCurrent ? 'current-turn' : ''}`}>
                            <div className="player-name">{player.username}</div>
                            <div className="player-hand-count">
                                {player.hand.length} cards
                                {player.saidUno && player.hand.length === 1 && <span className="uno-badge">UNO!</span>}
                            </div>
                            <div className="card-backs">
                                {Array.from({ length: Math.min(player.hand.length, 5) }).map((_, i) => (
                                    <div key={i} className="card-back" />
                                ))}
                                {player.hand.length > 5 && <span className="more-cards">+{player.hand.length - 5}</span>}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Center Area */}
            <div className="center-area">
                <div className="draw-pile" onClick={isMyTurn ? drawCard : undefined}>
                    <div className="card-back large">DRAW</div>
                    <span className="pile-count">{gameState?.drawPile.length}</span>
                </div>
                <div className="discard-pile">
                    {topCard && renderCard(topCard)}
                    <div className={`current-color ${gameState?.currentColor}`}>
                        {gameState?.currentColor.toUpperCase()}
                    </div>
                </div>
            </div>

            {/* My Hand */}
            <div className="my-hand">
                <div className="my-hand-header">
                    <span className="my-name">{myPlayer?.username} (You)</span>
                    <div className="my-actions">
                        {myHand.length === 1 && !myPlayer?.saidUno && (
                            <button className="btn-uno" onClick={callUno}>UNO!</button>
                        )}
                        {isMyTurn && <span className="turn-indicator">Your Turn!</span>}
                    </div>
                </div>
                <div className="my-cards">
                    {myHand.map(card => renderCard(card, true, isCardPlayable(card)))}
                </div>
            </div>

            {/* Color Picker Modal */}
            {showColorPicker && (
                <div className="modal-overlay">
                    <div className="modal-content color-picker">
                        <h3>Choose a Color</h3>
                        <div className="color-options">
                            <button className="color-btn red" onClick={() => selectColor('red')}>🔴 Red</button>
                            <button className="color-btn yellow" onClick={() => selectColor('yellow')}>🟡 Yellow</button>
                            <button className="color-btn green" onClick={() => selectColor('green')}>🟢 Green</button>
                            <button className="color-btn blue" onClick={() => selectColor('blue')}>🔵 Blue</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Results Modal */}
            {showResults && gameState?.results && (
                <div className="modal-overlay">
                    <div className="modal-content results">
                        <h2>🏆 Game Over!</h2>
                        <div className="results-list">
                            {gameState.results.map((result, index) => (
                                <div key={result.playerId} className={`result-row ${result.rank === 1 ? 'winner' : ''}`}>
                                    <span className="rank">{index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}</span>
                                    <span className="name">{result.username}</span>
                                    <span className="score">{result.handScore} pts</span>
                                    <span className={`credits ${result.creditsChange >= 0 ? 'positive' : 'negative'}`}>
                                        {result.creditsChange >= 0 ? '+' : ''}{result.creditsChange}
                                    </span>
                                </div>
                            ))}
                        </div>
                        <button className="btn-primary" onClick={handleLeave}>Back to Lobby</button>
                    </div>
                </div>
            )}
        </div>
    );
}
