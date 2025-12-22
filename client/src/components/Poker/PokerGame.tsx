import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import type { PokerState, PokerAction, PokerPlayer } from '../../../../shared/types/events';
import type { Card } from '../../../../shared/types/card';
import './Poker.css';

interface PokerGameProps {
    onLeave: () => void;
}

const RANK_NAMES: Record<number, string> = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
    11: 'J', 12: 'Q', 13: 'K', 14: 'A'
};

const SUIT_SYMBOLS: Record<string, string> = {
    hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠'
};

function CardDisplay({ card, hidden = false }: { card: Card; hidden?: boolean }) {
    if (hidden || card.id === 'hidden') {
        return <div className="poker-card card-back">🂠</div>;
    }

    const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
    return (
        <div className={`poker-card ${isRed ? 'red' : 'black'}`}>
            <span className="card-rank">{RANK_NAMES[card.rank]}</span>
            <span className="card-suit">{SUIT_SYMBOLS[card.suit]}</span>
        </div>
    );
}

export function PokerGame({ onLeave }: PokerGameProps) {
    const { user, socket } = useAuth();
    const { theme } = useTheme();
    const [gameState, setGameState] = useState<PokerState | null>(null);
    const [error, setError] = useState('');
    const [raiseAmount, setRaiseAmount] = useState(0);
    const [isStarting, setIsStarting] = useState(false);
    const [smallBlind, setSmallBlind] = useState(10);
    const [bigBlind, setBigBlind] = useState(20);
    const [showSettings, setShowSettings] = useState(true);
    const [winners, setWinners] = useState<string[]>([]);
    const [showWinMessage, setShowWinMessage] = useState(false);

    useEffect(() => {
        if (!socket) return;

        socket.on('poker:stateUpdate', (state: PokerState) => {
            setGameState(state);
            if (state.phase !== 'ended') {
                setShowWinMessage(false);
            }
            // Set default raise amount
            if (state.minRaise) {
                setRaiseAmount(state.currentBet + state.minRaise);
            }
        });

        socket.on('poker:handEnd', (data: { winners: string[]; pot: number }) => {
            setWinners(data.winners);
            setShowWinMessage(true);
        });

        socket.on('poker:gameOver', (data: { message: string }) => {
            setError(data.message);
        });

        socket.on('poker:playerLeft', () => {
            setError('A player left the game');
        });

        return () => {
            socket.off('poker:stateUpdate');
            socket.off('poker:handEnd');
            socket.off('poker:gameOver');
            socket.off('poker:playerLeft');
        };
    }, [socket]);

    const startGame = useCallback(() => {
        if (!socket) return;
        setIsStarting(true);
        setShowSettings(false);
        socket.emit('poker:start', { smallBlind, bigBlind }, (response: { success: boolean; message?: string }) => {
            setIsStarting(false);
            if (!response.success) {
                setError(response.message || 'Failed to start game');
                setShowSettings(true);
            }
        });
    }, [socket, smallBlind, bigBlind]);

    const doAction = useCallback((action: PokerAction, amount?: number) => {
        if (!socket) return;
        socket.emit('poker:action', { action, amount }, (response: { success: boolean; message?: string }) => {
            if (!response.success) {
                setError(response.message || 'Invalid action');
                setTimeout(() => setError(''), 2000);
            }
        });
    }, [socket]);

    const nextHand = useCallback(() => {
        if (!socket) return;
        setShowWinMessage(false);
        socket.emit('poker:nextHand', (response: { success: boolean; message?: string }) => {
            if (!response.success) {
                setError(response.message || 'Cannot start next hand');
            }
        });
    }, [socket]);

    const handleLeave = useCallback(() => {
        if (socket) {
            socket.emit('poker:leave');
        }
        onLeave();
    }, [socket, onLeave]);

    const me = gameState?.players.find(p => p.id === user?.id);
    const isMyTurn = gameState && gameState.players[gameState.currentPlayerIndex]?.id === user?.id;
    const canCheck = gameState && me && gameState.currentBet <= me.currentBet;
    const toCall = gameState && me ? Math.max(0, gameState.currentBet - me.currentBet) : 0;

    // Settings screen
    if (showSettings) {
        return (
            <div className={`poker-container ${theme === 'stealth' ? 'theme-stealth' : ''}`}>
                <div className="poker-header">
                    <button className="btn btn-secondary" onClick={handleLeave}>← Leave</button>
                    <h2>♠️ Texas Hold'em ♥️</h2>
                </div>
                <div className="poker-settings">
                    <h3>Game Settings</h3>
                    <div className="setting-group">
                        <label>Small Blind</label>
                        <input
                            type="number"
                            value={smallBlind}
                            onChange={(e) => setSmallBlind(Number(e.target.value))}
                            min={1}
                            max={100}
                        />
                    </div>
                    <div className="setting-group">
                        <label>Big Blind</label>
                        <input
                            type="number"
                            value={bigBlind}
                            onChange={(e) => setBigBlind(Number(e.target.value))}
                            min={2}
                            max={200}
                        />
                    </div>
                    <p className="setting-info">Each player starts with 1000 chips</p>
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

    // Loading state or no game
    if (!gameState) {
        return (
            <div className={`poker-container ${theme === 'stealth' ? 'theme-stealth' : ''}`}>
                <div className="poker-header">
                    <button className="btn btn-secondary" onClick={handleLeave}>← Leave</button>
                </div>
                <div className="poker-loading">
                    <div className="spinner"></div>
                    <p>Waiting for game to start...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`poker-container ${theme === 'stealth' ? 'theme-stealth' : ''}`}>
            {/* Header */}
            <div className="poker-header">
                <button className="btn btn-secondary" onClick={handleLeave}>← Leave</button>
                <div className="game-phase">
                    <span className="phase-label">{gameState.phase.toUpperCase()}</span>
                    <span className="blinds-info">Blinds: {gameState.smallBlind}/{gameState.bigBlind}</span>
                </div>
                <div className="pot-display">
                    <span className="pot-label">POT</span>
                    <span className="pot-amount">${gameState.pot}</span>
                </div>
            </div>

            {error && <div className="poker-error">{error}</div>}

            {/* Winners message */}
            {showWinMessage && (
                <div className="winners-overlay">
                    <div className="winners-message">
                        <h2>🏆 Hand Complete!</h2>
                        <p>
                            {winners.map(id => gameState.players.find(p => p.id === id)?.username).join(', ')} wins!
                        </p>
                        {gameState.players.filter(p => !p.folded).map(p => (
                            p.handResult && (
                                <div key={p.id} className="winner-hand">
                                    <span>{p.username}: {p.handResult.rankName}</span>
                                </div>
                            )
                        ))}
                        <button className="btn btn-primary" onClick={nextHand}>
                            Next Hand
                        </button>
                    </div>
                </div>
            )}

            {/* Poker Table */}
            <div className="poker-table">
                {/* Community Cards */}
                <div className="community-cards">
                    {gameState.communityCards.map((card, i) => (
                        <CardDisplay key={i} card={card} />
                    ))}
                    {/* Placeholder cards */}
                    {Array.from({ length: 5 - gameState.communityCards.length }).map((_, i) => (
                        <div key={`empty-${i}`} className="poker-card card-placeholder"></div>
                    ))}
                </div>

                {/* Players around table */}
                <div className="players-around-table">
                    {gameState.players.map((player, index) => (
                        <PlayerSeat
                            key={player.id}
                            player={player}
                            isMe={player.id === user?.id}
                            isCurrentTurn={index === gameState.currentPlayerIndex && gameState.phase !== 'ended'}
                            isDealer={index === gameState.dealerIndex}
                            isWinner={winners.includes(player.id)}
                            position={index}
                            totalPlayers={gameState.players.length}
                        />
                    ))}
                </div>
            </div>

            {/* Player Controls */}
            {isMyTurn && gameState.phase !== 'showdown' && gameState.phase !== 'ended' && me && !me.folded && !me.allIn && (
                <div className="poker-controls">
                    <button className="btn btn-danger" onClick={() => doAction('fold')}>
                        Fold
                    </button>

                    {canCheck ? (
                        <button className="btn btn-secondary" onClick={() => doAction('check')}>
                            Check
                        </button>
                    ) : (
                        <button
                            className="btn btn-primary"
                            onClick={() => doAction('call')}
                            disabled={me.chips < toCall}
                        >
                            Call ${Math.min(toCall, me.chips)}
                        </button>
                    )}

                    <div className="raise-controls">
                        <input
                            type="range"
                            min={gameState.currentBet + gameState.minRaise}
                            max={me.chips + me.currentBet}
                            value={raiseAmount}
                            onChange={(e) => setRaiseAmount(Number(e.target.value))}
                        />
                        <input
                            type="number"
                            value={raiseAmount}
                            onChange={(e) => setRaiseAmount(Number(e.target.value))}
                            min={gameState.currentBet + gameState.minRaise}
                            max={me.chips + me.currentBet}
                        />
                        <button
                            className="btn btn-success"
                            onClick={() => doAction('raise', raiseAmount)}
                            disabled={raiseAmount < gameState.currentBet + gameState.minRaise}
                        >
                            Raise to ${raiseAmount}
                        </button>
                    </div>

                    <button className="btn btn-warning" onClick={() => doAction('allIn')}>
                        All In (${me.chips})
                    </button>
                </div>
            )}

            {/* My Cards */}
            {me && (
                <div className="my-cards">
                    <h4>Your Hand</h4>
                    <div className="hole-cards">
                        {me.holeCards.map((card, i) => (
                            <CardDisplay key={i} card={card} />
                        ))}
                    </div>
                    <div className="my-info">
                        <span>Chips: ${me.chips}</span>
                        {me.handResult && <span className="hand-rank">{me.handResult.rankName}</span>}
                    </div>
                </div>
            )}
        </div>
    );
}

// Player seat component
function PlayerSeat({
    player,
    isMe,
    isCurrentTurn,
    isDealer,
    isWinner,
    position,
    totalPlayers,
}: {
    player: PokerPlayer;
    isMe: boolean;
    isCurrentTurn: boolean;
    isDealer: boolean;
    isWinner: boolean;
    position: number;
    totalPlayers: number;
}) {
    const seatClass = `player-seat position-${position} total-${totalPlayers}`;

    return (
        <div className={`${seatClass} ${isCurrentTurn ? 'current-turn' : ''} ${player.folded ? 'folded' : ''} ${isWinner ? 'winner' : ''}`}>
            {isDealer && <div className="dealer-button">D</div>}

            <div className="player-avatar emoji-avatar">
                {(player as unknown as { avatar?: string }).avatar || player.username.charAt(0).toUpperCase()}
            </div>

            <div className="player-info">
                <span className="player-name">{isMe ? 'You' : player.username}</span>
                <span className="player-chips">${player.chips}</span>
                {player.currentBet > 0 && (
                    <span className="player-bet">Bet: ${player.currentBet}</span>
                )}
                {player.folded && <span className="player-status">Folded</span>}
                {player.allIn && <span className="player-status all-in">ALL IN</span>}
            </div>

            {/* Hole cards (hidden for others except at showdown) */}
            <div className="player-cards">
                {player.holeCards.slice(0, 2).map((card, i) => (
                    <CardDisplay
                        key={i}
                        card={card}
                        hidden={!isMe && card.id === 'hidden'}
                    />
                ))}
            </div>

            {player.handResult && (
                <div className="player-hand-result">{player.handResult.rankName}</div>
            )}
        </div>
    );
}
