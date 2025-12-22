import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { GameTable } from '../GameTable';
import type { PlayerData } from '../GameTable';
import type { Card as CardType } from '../../../../shared/types/card';
import './BaCay.css';

interface BaCayPlayer {
    id: string;
    username: string;
    hand: CardType[];
    score: number;
    totalValue: number;
    isBaTay: boolean;
    faceCardCount: number;
    isRevealed: boolean;
    avatar?: string;
}

interface BaCayResult {
    playerId: string;
    username: string;
    rank: number;
    score: number;
    isBaTay: boolean;
    creditsChange: number;
}

interface BaCayState {
    roomId: string;
    players: BaCayPlayer[];
    phase: 'waiting' | 'dealing' | 'revealing' | 'showdown' | 'finished';
    betAmount: number;
    results: BaCayResult[];
}

interface BaCayGameProps {
    onLeave: () => void;
}

// Card display constants
const RANK_DISPLAY: Record<number, string> = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
    11: 'J', 12: 'Q', 13: 'K', 14: 'A'
};

const SUIT_SYMBOLS: Record<string, string> = {
    hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠'
};

const SUIT_COLORS: Record<string, string> = {
    hearts: '#ef4444', diamonds: '#ef4444',
    clubs: '#1f2937', spades: '#1f2937'
};

function PlayingCard({ card, hidden = false, small = false }: { card: CardType; hidden?: boolean; small?: boolean }) {
    if (hidden) {
        return <div className={`bacay-card card-back ${small ? 'small' : ''}`}>🂠</div>;
    }

    const color = SUIT_COLORS[card.suit];
    return (
        <div className={`bacay-card ${small ? 'small' : ''}`} style={{ color }}>
            <span className="card-rank">{RANK_DISPLAY[card.rank]}</span>
            <span className="card-suit">{SUIT_SYMBOLS[card.suit]}</span>
        </div>
    );
}

export function BaCayGame({ onLeave }: BaCayGameProps) {
    const { user, socket } = useAuth();
    const { theme } = useTheme();
    const isStealth = theme === 'stealth';

    const [gameState, setGameState] = useState<BaCayState | null>(null);
    const [error, setError] = useState('');
    const [isStarting, setIsStarting] = useState(false);
    const [betAmount, setBetAmount] = useState(100);
    const [showResults, setShowResults] = useState(false);

    useEffect(() => {
        if (!socket) return;

        socket.on('bacay:started', (state: BaCayState) => {
            setGameState(state);
            setIsStarting(false);
            setShowResults(false);
        });

        socket.on('bacay:stateUpdate', (state: BaCayState) => {
            setGameState(state);
        });

        socket.on('bacay:gameOver', (data: { results: BaCayResult[]; state: BaCayState }) => {
            setGameState(data.state);
            setShowResults(true);
        });

        return () => {
            socket.off('bacay:started');
            socket.off('bacay:stateUpdate');
            socket.off('bacay:gameOver');
        };
    }, [socket]);

    const startGame = useCallback(() => {
        if (!socket) return;
        setIsStarting(true);
        socket.emit('bacay:start', { betAmount }, (response: { success: boolean; message?: string }) => {
            if (!response.success) {
                setError(response.message || 'Failed to start game');
                setIsStarting(false);
            }
        });
    }, [socket, betAmount]);

    const revealHand = useCallback(() => {
        if (!socket) return;
        socket.emit('bacay:reveal', (response: { success: boolean; message?: string }) => {
            if (!response.success) {
                setError(response.message || 'Failed to reveal');
            }
        });
    }, [socket]);

    const revealAll = useCallback(() => {
        if (!socket) return;
        socket.emit('bacay:revealAll', (response: { success: boolean; message?: string }) => {
            if (!response.success) {
                setError(response.message || 'Failed to reveal all');
            }
        });
    }, [socket]);

    const handleLeave = useCallback(() => {
        if (socket) {
            socket.emit('bacay:leave');
        }
        onLeave();
    }, [socket, onLeave]);

    const myPlayer = gameState?.players.find(p => p.id === user?.id);

    // Convert BaCay players to GameTable PlayerData format
    const convertToPlayerData = (players: BaCayPlayer[]): PlayerData[] => {
        return players.map(player => ({
            id: player.id,
            username: player.username,
            avatar: player.avatar,
            status: player.isRevealed ? 'active' : 'waiting',
            statusText: player.isRevealed
                ? (player.isBaTay ? '🎴 Ba Tây!' : `Score: ${player.score}`)
                : 'Hidden',
            cards: (
                <div className="player-hand-mini">
                    {player.isRevealed ? (
                        player.hand.map((card, idx) => (
                            <PlayingCard key={idx} card={card} small />
                        ))
                    ) : (
                        [0, 1, 2].map(i => <PlayingCard key={i} card={{} as CardType} hidden small />)
                    )}
                </div>
            )
        }));
    };

    // Waiting / Setup screen
    if (!gameState || gameState.phase === 'waiting') {
        return (
            <div className={`bacay-container ${isStealth ? 'theme-stealth' : 'normal-mode'}`}>
                <div className="bacay-header">
                    <button className="btn-link" onClick={handleLeave}>
                        {isStealth ? '← Back to Dashboard' : '← Thoát'}
                    </button>
                    <h2>{isStealth ? '🎴 Card Assessment Tool' : '🎴 Ba Cây'}</h2>
                </div>
                <div className="bacay-setup">
                    <div className="setup-card">
                        <h3>{isStealth ? '📊 Configure Assessment' : '🎲 Thiết lập ván chơi'}</h3>
                        <div className="bet-selector">
                            <label>{isStealth ? 'Assessment Value:' : 'Mức cược:'}</label>
                            <select
                                value={betAmount}
                                onChange={(e) => setBetAmount(Number(e.target.value))}
                            >
                                <option value={50}>50 💰</option>
                                <option value={100}>100 💰</option>
                                <option value={200}>200 💰</option>
                                <option value={500}>500 💰</option>
                            </select>
                        </div>
                        <p className="setup-info">
                            {isStealth
                                ? '• Each participant receives 3 assessment cards\n• Score = last digit of total value\n• Triple executive cards = instant win'
                                : '• Mỗi người được chia 3 lá\n• Điểm = chữ số cuối của tổng\n• Ba Tây (J/Q/K) = thắng ngay'}
                        </p>
                        <button
                            className="btn-primary btn-large"
                            onClick={startGame}
                            disabled={isStarting}
                        >
                            {isStarting
                                ? (isStealth ? 'Starting Assessment...' : 'Đang bắt đầu...')
                                : (isStealth ? '🚀 Start Assessment' : '🎴 Bắt đầu ván chơi')}
                        </button>
                        {error && <p className="error">{error}</p>}
                    </div>
                </div>
            </div>
        );
    }

    // Game in progress - use GameTable for normal mode
    const centerContent = (
        <div className="bacay-center-content">
            <div className="pot-display">
                <span className="pot-label">{isStealth ? 'Pool' : 'Nồi'}</span>
                <span className="pot-value">{gameState.betAmount * gameState.players.length} 💰</span>
            </div>
            <div className="phase-display">
                {gameState.phase === 'revealing' && (isStealth ? '⏳ Revealing...' : '⏳ Đang mở bài...')}
                {gameState.phase === 'showdown' && (isStealth ? '👀 Showdown!' : '👀 So bài!')}
                {gameState.phase === 'finished' && (isStealth ? '🏆 Complete' : '🏆 Kết thúc')}
            </div>
        </div>
    );

    const actions = myPlayer && (
        <div className="bacay-actions">
            {!myPlayer.isRevealed && (
                <button className="btn-primary" onClick={revealHand}>
                    {isStealth ? '📋 Submit' : '👀 Mở bài'}
                </button>
            )}
            <button className="btn-secondary" onClick={revealAll}>
                {isStealth ? '⏩ Reveal All' : '⏩ Mở tất cả'}
            </button>
            <button className="btn-link" onClick={handleLeave}>
                {isStealth ? 'Leave' : 'Thoát'}
            </button>
        </div>
    );

    return (
        <div className={`bacay-game-wrapper ${isStealth ? 'stealth-mode' : 'normal-mode'}`}>
            {error && <div className="error-toast">{error}</div>}

            {/* Results Modal */}
            {showResults && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2>{isStealth ? '📊 Assessment Results' : '🏆 Kết quả'}</h2>
                        <div className="results-list">
                            {gameState.results.map((result) => (
                                <div
                                    key={result.playerId}
                                    className={`result-row ${result.rank === 1 ? 'winner' : ''} ${result.isBaTay ? 'ba-tay' : ''}`}
                                >
                                    <span className="rank">
                                        {result.rank === 1 ? '🏆' : `#${result.rank}`}
                                    </span>
                                    <span className="name">{result.username}</span>
                                    <span className="score">
                                        {result.isBaTay
                                            ? (isStealth ? '🎴 Triple Exec' : '🎴 Ba Tây!')
                                            : `${isStealth ? 'Score:' : 'Điểm:'} ${result.score}`}
                                    </span>
                                    <span className={`credits ${result.creditsChange >= 0 ? 'positive' : 'negative'}`}>
                                        {result.creditsChange >= 0 ? '+' : ''}{result.creditsChange} 💰
                                    </span>
                                </div>
                            ))}
                        </div>
                        <button className="btn-primary" onClick={handleLeave}>
                            {isStealth ? 'Return to Dashboard' : 'Quay lại Lobby'}
                        </button>
                    </div>
                </div>
            )}

            {/* Main Game Table */}
            <GameTable
                players={convertToPlayerData(gameState.players)}
                currentPlayerId={null}
                myId={user?.id || ''}
                centerContent={centerContent}
                actions={actions}
                gameInfo={{
                    gameName: isStealth ? 'Card Assessment' : 'Ba Cây',
                    pot: gameState.betAmount * gameState.players.length
                }}
            />

            {/* My Hand Panel - Fixed at bottom */}
            {myPlayer && (
                <div className="my-hand-panel">
                    <div className="my-hand-header">
                        <span className="my-name">{isStealth ? 'Your Assessment' : 'Bài của bạn'}</span>
                        {myPlayer.isRevealed && (
                            <span className="my-score">
                                {myPlayer.isBaTay
                                    ? <span className="ba-tay-badge">{isStealth ? '🎴 Triple Exec!' : '🎴 Ba Tây!'}</span>
                                    : <span>{isStealth ? 'Score:' : 'Điểm:'} <strong>{myPlayer.score}</strong> ({isStealth ? 'Total:' : 'Tổng:'} {myPlayer.totalValue})</span>}
                            </span>
                        )}
                    </div>
                    <div className="my-cards">
                        {myPlayer.hand.map((card, idx) => (
                            <PlayingCard key={idx} card={card} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
