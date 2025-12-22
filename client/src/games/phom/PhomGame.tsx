import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Card } from '../../components/Card';
import type { Card as CardType } from '../../../../shared/types/card';
import './PhomGame.css';

interface PhomPlayer {
    id: string;
    username: string;
    hand: CardType[];
    phoms: CardType[][];
    score: number;
    isConnected: boolean;
}

interface PhomGameState {
    roomId: string;
    players: PhomPlayer[];
    currentPlayerIndex: number;
    deck: CardType[];
    discardPile: CardType[];
    status: 'waiting' | 'playing' | 'finished';
    round: number;
    winner?: string;
    lastAction?: {
        type: string;
        playerId: string;
        card?: CardType;
    };
}

interface PhomGameProps {
    roomId: string;
    onLeave: () => void;
}

export function PhomGame({ onLeave }: PhomGameProps) {
    const { user, socket } = useAuth();
    const { theme } = useTheme();
    const [gameState, setGameState] = useState<PhomGameState | null>(null);
    const [selectedCards, setSelectedCards] = useState<string[]>([]);
    const [isMyTurn, setIsMyTurn] = useState(false);
    const [error, setError] = useState('');
    const [hasDrawn, setHasDrawn] = useState(false);

    // Listen for game events
    useEffect(() => {
        if (!socket) return;

        socket.on('game:started', (state) => {
            setGameState(state as unknown as PhomGameState);
            setSelectedCards([]);
            setHasDrawn(false);
        });

        socket.on('game:stateUpdate', (state) => {
            setGameState(state as unknown as PhomGameState);
        });

        socket.on('game:yourTurn', () => {
            setIsMyTurn(true);
            setHasDrawn(false);
        });

        socket.on('game:cardDrawn', () => {
            setHasDrawn(true);
        });

        socket.on('game:ended', (data) => {
            alert(`Game Over! Winner: ${data.winner}`);
        });

        socket.on('game:error', (message: string) => {
            setError(message);
            setTimeout(() => setError(''), 3000);
        });

        // Request game start
        socket.emit('game:start');

        return () => {
            socket.off('game:started');
            socket.off('game:stateUpdate');
            socket.off('game:yourTurn');
            socket.off('game:cardDrawn');
            socket.off('game:ended');
            socket.off('game:error');
        };
    }, [socket]);

    // Check if it's my turn based on game state
    useEffect(() => {
        if (!gameState || !user) return;
        const currentPlayerId = gameState.players[gameState.currentPlayerIndex]?.id;
        setIsMyTurn(currentPlayerId === user.id);
    }, [gameState, user]);

    // Get my player
    const myPlayer = gameState?.players.find(p => p.id === user?.id);
    const myHand = myPlayer?.hand || [];

    // Handle card selection
    const toggleCardSelection = useCallback((cardId: string) => {
        setSelectedCards(prev =>
            prev.includes(cardId)
                ? prev.filter(id => id !== cardId)
                : [...prev, cardId]
        );
    }, []);

    // Draw from deck
    const handleDrawFromDeck = useCallback(() => {
        if (!socket || !isMyTurn || hasDrawn) return;
        socket.emit('game:drawCard');
    }, [socket, isMyTurn, hasDrawn]);

    // Take from discard
    const handleTakeFromDiscard = useCallback(() => {
        if (!socket || !isMyTurn || hasDrawn) return;
        socket.emit('game:takeCard');
    }, [socket, isMyTurn, hasDrawn]);

    // Discard selected card
    const handleDiscard = useCallback(() => {
        if (!socket || !isMyTurn || !hasDrawn) return;
        if (selectedCards.length !== 1) {
            setError('Select exactly 1 card to discard');
            return;
        }
        socket.emit('game:discardCard', selectedCards[0]);
        setSelectedCards([]);
        setIsMyTurn(false);
        setHasDrawn(false);
    }, [socket, isMyTurn, hasDrawn, selectedCards]);

    // Meld phom
    const handleMeldPhom = useCallback(() => {
        if (!socket || !isMyTurn) return;
        if (selectedCards.length < 3) {
            setError('Select at least 3 cards to meld a phom');
            return;
        }
        socket.emit('game:meldPhom', selectedCards);
        setSelectedCards([]);
    }, [socket, isMyTurn, selectedCards]);

    // Leave game
    const handleLeave = useCallback(() => {
        if (socket) {
            socket.emit('game:leave');
        }
        onLeave();
    }, [socket, onLeave]);

    if (!gameState) {
        return (
            <div className={`phom-loading ${theme === 'stealth' ? 'theme-stealth' : ''}`}>
                <div className="spinner"></div>
                <p>Loading game...</p>
            </div>
        );
    }

    const topCard = gameState.discardPile[gameState.discardPile.length - 1];
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const otherPlayers = gameState.players.filter(p => p.id !== user?.id);

    return (
        <div className={`phom-game ${theme === 'stealth' ? 'theme-stealth' : ''}`}>
            {/* Header */}
            <div className="phom-header">
                <button className="btn btn-secondary" onClick={handleLeave}>
                    ← Leave Game
                </button>
                <div className="game-info">
                    <span className="round-info">Round {gameState.round}</span>
                    <span className={`turn-indicator ${isMyTurn ? 'my-turn' : ''}`}>
                        {isMyTurn ? "🎯 Your Turn!" : `${currentPlayer?.username}'s turn`}
                    </span>
                </div>
                <div className="deck-count">
                    🎴 {gameState.deck.length} cards left
                </div>
            </div>

            {/* Other Players */}
            <div className="other-players">
                {otherPlayers.map((player) => (
                    <div
                        key={player.id}
                        className={`opponent ${player.id === currentPlayer?.id ? 'current' : ''}`}
                    >
                        <div className="opponent-info">
                            <span className="opponent-name">{player.username}</span>
                            <span className="opponent-cards">{player.hand.length} cards</span>
                        </div>
                        <div className="opponent-hand">
                            {player.hand.slice(0, 5).map((_, i) => (
                                <div key={i} className="opponent-card"></div>
                            ))}
                            {player.hand.length > 5 && (
                                <span className="more-cards">+{player.hand.length - 5}</span>
                            )}
                        </div>
                        {player.phoms.length > 0 && (
                            <div className="opponent-phoms">
                                {player.phoms.map((phom, i) => (
                                    <div key={i} className="phom-set mini">
                                        {phom.length} cards
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Game Table */}
            <div className="game-table">
                {/* Deck */}
                <div
                    className={`deck-pile ${isMyTurn && !hasDrawn ? 'clickable' : ''}`}
                    onClick={handleDrawFromDeck}
                >
                    <div className="deck-visual">
                        <Card faceDown size="medium" />
                    </div>
                    <span className="pile-label">Draw</span>
                </div>

                {/* Discard Pile */}
                <div
                    className={`discard-pile ${isMyTurn && !hasDrawn && topCard ? 'clickable' : ''}`}
                    onClick={handleTakeFromDiscard}
                >
                    {topCard ? (
                        <Card card={topCard} size="medium" />
                    ) : (
                        <div className="empty-pile">Empty</div>
                    )}
                    <span className="pile-label">Discard</span>
                </div>
            </div>

            {/* My Phoms */}
            {myPlayer && myPlayer.phoms.length > 0 && (
                <div className="my-phoms">
                    <h3>My Phoms</h3>
                    <div className="phoms-list">
                        {myPlayer.phoms.map((phom, index) => (
                            <div key={index} className="phom-set">
                                {phom.map(card => (
                                    <Card key={card.id} card={card} size="small" />
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* My Hand */}
            <div className="my-hand-section">
                <h3>My Hand ({myHand.length} cards)</h3>
                <div className="my-hand">
                    {myHand.map(card => (
                        <Card
                            key={card.id}
                            card={card}
                            size="large"
                            selected={selectedCards.includes(card.id)}
                            onClick={() => toggleCardSelection(card.id)}
                            disabled={!isMyTurn}
                        />
                    ))}
                </div>
            </div>

            {/* Actions */}
            <div className="game-actions">
                {error && <div className="game-error">{error}</div>}

                {isMyTurn && (
                    <div className="action-buttons">
                        {!hasDrawn ? (
                            <p className="action-hint">Draw a card from the deck or take from discard pile</p>
                        ) : (
                            <>
                                <button
                                    className="btn btn-primary"
                                    onClick={handleMeldPhom}
                                    disabled={selectedCards.length < 3}
                                >
                                    Meld Phom ({selectedCards.length} selected)
                                </button>
                                <button
                                    className="btn btn-danger"
                                    onClick={handleDiscard}
                                    disabled={selectedCards.length !== 1}
                                >
                                    Discard Selected
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Game Over */}
            {gameState.status === 'finished' && (
                <div className="game-over-overlay">
                    <div className="game-over-modal">
                        <h2>🎉 Game Over!</h2>
                        <p>Winner: {gameState.players.find(p => p.id === gameState.winner)?.username}</p>
                        <div className="final-scores">
                            {gameState.players.map(p => (
                                <div key={p.id} className="score-row">
                                    <span>{p.username}</span>
                                    <span>{p.score} points</span>
                                </div>
                            ))}
                        </div>
                        <button className="btn btn-primary" onClick={handleLeave}>
                            Back to Lobby
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
