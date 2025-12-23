import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useSync } from '../../contexts/SyncContext';
import type { Room } from '../../../../shared/types/game';
import './GameRoom.css';

interface GameRoomProps {
    room: Room;
    onLeave: () => void;
    onGameStart: () => void;
}

export function GameRoom({ room: initialRoom, onLeave, onGameStart }: GameRoomProps) {
    const { user, socket } = useAuth();
    const { credits } = useSync();
    const { theme } = useTheme();
    const [room, setRoom] = useState(initialRoom);
    const [betAmount, setBetAmount] = useState(room.betAmount || 100);
    const [error, setError] = useState('');

    const isHost = user?.id === room.hostId;
    const roomId = room.id || (room as unknown as { _id: string })._id;

    useEffect(() => {
        if (!socket) return;

        // Listen for full room state updates (most reliable)
        socket.on('lobby:roomUpdated', (updatedRoom: Room) => {
            const updatedRoomId = updatedRoom.id || (updatedRoom as unknown as { _id: string })._id;
            if (updatedRoomId === roomId) {
                console.log('📦 Room updated:', updatedRoom.players.length, 'players');
                setRoom(updatedRoom);
            }
        });

        socket.on('lobby:playerJoined', (data: { roomId: string; player: { id: string; username: string } }) => {
            console.log('👋 Player joined event:', data.player.username);
            const dataRoomId = data.roomId;
            if (dataRoomId === roomId) {
                setRoom(prev => {
                    // Check if player already exists
                    if (prev.players.some(p => p.id === data.player.id)) {
                        return prev;
                    }
                    return {
                        ...prev,
                        players: [...prev.players, {
                            id: data.player.id,
                            username: data.player.username,
                            hand: [],
                            isReady: false,
                            isConnected: true,
                            score: 0
                        }]
                    };
                });
            }
        });

        socket.on('lobby:playerLeft', (data: { roomId: string; playerId: string }) => {
            const dataRoomId = data.roomId;
            if (dataRoomId === roomId) {
                setRoom(prev => ({
                    ...prev,
                    players: prev.players.filter(p => p.id !== data.playerId)
                }));
            }
        });

        socket.on('lobby:playerReady', (data: { roomId: string; playerId: string; isReady: boolean }) => {
            const dataRoomId = data.roomId;
            if (dataRoomId === roomId) {
                setRoom(prev => ({
                    ...prev,
                    players: prev.players.map(p =>
                        p.id === data.playerId ? { ...p, isReady: data.isReady } : p
                    )
                }));
            }
        });

        socket.on('lobby:error', (message: string) => {
            setError(message);
            setTimeout(() => setError(''), 3000);
        });

        socket.on('game:starting', () => {
            onGameStart();
        });

        return () => {
            socket.off('lobby:roomUpdated');
            socket.off('lobby:playerJoined');
            socket.off('lobby:playerLeft');
            socket.off('lobby:playerReady');
            socket.off('lobby:error');
            socket.off('game:starting');
        };
    }, [socket, roomId, onGameStart]);

    const handleReady = useCallback(() => {
        if (!socket) return;
        socket.emit('lobby:ready');
    }, [socket]);

    const handleStartGame = useCallback(() => {
        if (!socket) return;
        socket.emit('lobby:startGame');
    }, [socket]);

    const handleLeave = useCallback(() => {
        if (!socket) return;
        socket.emit('lobby:leaveRoom');
        onLeave();
    }, [socket, onLeave]);

    const gameTypeInfo = {
        phom: { name: 'Phom', icon: '🎴', description: 'Vietnamese Rummy - Form sets and runs' },
        poker: { name: 'Poker', icon: '♠️', description: 'Texas Hold\'em - Best 5-card hand wins' },
        tienlen: { name: 'Tiến Lên', icon: '🃏', description: 'Vietnamese Thirteen - Be first to shed all cards!' },
        durak: { name: 'Durak', icon: '🎯', description: 'Russian Card Game - Don\'t be the fool!' },
        tictactoe: { name: 'Tic-Tac-Toe', icon: '❌', description: 'Classic XO Game - Get 3 in a row!' },
        bacay: { name: 'Ba Cây', icon: '🃏', description: '3-Card Game - Score = last digit of total' },
        uno: { name: 'UNO', icon: '🔴', description: 'Classic Color Matching - Play same color or number!' },
    };

    const currentPlayer = room.players.find(p => p.id === user?.id);
    const isReady = currentPlayer?.isReady || false;
    const allPlayersReady = room.players.every(p => p.id === room.hostId || p.isReady);

    // Check if all players have sufficient credits for the bet
    const insufficientCreditsPlayers = room.players.filter(p =>
        (p.credits ?? credits) < betAmount
    );
    const allCanAffordBet = insufficientCreditsPlayers.length === 0;
    const canStart = isHost && room.players.length >= 2 && allPlayersReady && allCanAffordBet;

    return (
        <div className={`game-room-container ${theme === 'stealth' ? 'theme-stealth' : ''}`}>
            <div className="game-room-header">
                <button className="btn btn-secondary back-btn" onClick={handleLeave}>
                    ← Back to Lobby
                </button>
                <div className="my-credits">
                    💰 {credits.toLocaleString()}
                </div>
            </div>

            <div className="game-room-content">
                <div className="room-card">
                    <div className="room-card-header">
                        <span className="game-icon">{gameTypeInfo[room.gameType].icon}</span>
                        <div>
                            <h1 className="room-title">{room.name}</h1>
                            <p className="room-game-type">{gameTypeInfo[room.gameType].name}</p>
                        </div>
                    </div>

                    <p className="game-description">{gameTypeInfo[room.gameType].description}</p>

                    {/* Bet Amount Section */}
                    <div className="bet-section">
                        <h2>💰 Bet Amount</h2>
                        {isHost ? (
                            <select
                                value={betAmount}
                                onChange={(e) => setBetAmount(Number(e.target.value))}
                                className="bet-select"
                            >
                                <option value={50}>50 💰</option>
                                <option value={100}>100 💰</option>
                                <option value={200}>200 💰</option>
                                <option value={500}>500 💰</option>
                                <option value={1000}>1000 💰</option>
                            </select>
                        ) : (
                            <span className="bet-display">{betAmount} 💰</span>
                        )}
                    </div>

                    <div className="players-section">
                        <h2>Players ({room.players.length}/{room.maxPlayers})</h2>
                        <div className="players-grid">
                            {Array.from({ length: room.maxPlayers }).map((_, index) => {
                                const player = room.players[index];
                                const playerCredits = player?.credits ?? (player?.id === user?.id ? credits : 0);
                                const canAfford = playerCredits >= betAmount;
                                return (
                                    <div
                                        key={index}
                                        className={`player-slot ${player ? 'occupied' : 'empty'} ${player?.id === room.hostId ? 'host' : ''} ${player && !canAfford ? 'insufficient' : ''}`}
                                    >
                                        {player ? (
                                            <>
                                                <div className="player-avatar">
                                                    {(player as unknown as { avatar?: string }).avatar || player.username.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="player-info">
                                                    <span className="player-name">
                                                        {player.username}
                                                        {player.id === room.hostId && <span className="host-badge">👑</span>}
                                                    </span>
                                                    <span className="player-credits">
                                                        💰 {playerCredits.toLocaleString()}
                                                        {!canAfford && <span className="warning">⚠️</span>}
                                                    </span>
                                                    <span className={`player-status ${player.isReady ? 'ready' : ''}`}>
                                                        {player.id === room.hostId ? 'Host' : player.isReady ? '✓ Ready' : 'Waiting...'}
                                                    </span>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="empty-slot">
                                                <span>+</span>
                                                <span>Waiting for player</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {error && <div className="room-error">{error}</div>}

                    <div className="room-actions">
                        {!isHost && (
                            <button
                                className={`btn ${isReady ? 'btn-secondary' : 'btn-success'} ready-btn`}
                                onClick={handleReady}
                            >
                                {isReady ? 'Cancel Ready' : 'Ready'}
                            </button>
                        )}
                        {isHost && (
                            <button
                                className="btn btn-primary start-btn"
                                onClick={handleStartGame}
                                disabled={!canStart}
                            >
                                {room.players.length < 2
                                    ? 'Need more players'
                                    : !allPlayersReady
                                        ? 'Waiting for players...'
                                        : 'Start Game'}
                            </button>
                        )}
                    </div>
                </div>

                <div className="room-info-panel">
                    <h3>Game Rules</h3>
                    <div className="rules-content">
                        {room.gameType === 'phom' && (
                            <ul>
                                <li>Each player receives 9 cards (dealer gets 10)</li>
                                <li>Form "phom" (sets of 3+ same rank or runs)</li>
                                <li>On your turn: draw, optionally meld, then discard</li>
                                <li>Goal: Minimize deadwood (unmelded cards)</li>
                            </ul>
                        )}
                        {room.gameType === 'poker' && (
                            <ul>
                                <li>Each player receives 2 hole cards</li>
                                <li>5 community cards dealt in stages</li>
                                <li>Make best 5-card hand from 7 cards</li>
                                <li>Betting rounds: Preflop, Flop, Turn, River</li>
                            </ul>
                        )}
                        {room.gameType === 'durak' && (
                            <ul>
                                <li>Each player receives 6 cards</li>
                                <li>Bottom card determines trump suit</li>
                                <li>Attack with cards, defend or pick up</li>
                                <li>Goal: Be first to empty your hand</li>
                            </ul>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
