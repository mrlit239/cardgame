import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import type { Room } from '../../../../shared/types/game';
import './GameRoom.css';

interface GameRoomProps {
    room: Room;
    onLeave: () => void;
    onGameStart: () => void;
}

export function GameRoom({ room: initialRoom, onLeave, onGameStart }: GameRoomProps) {
    const { user, socket } = useAuth();
    const [room, setRoom] = useState(initialRoom);
    const [error, setError] = useState('');

    const isHost = user?.id === room.hostId;
    const roomId = room.id || (room as any)._id;

    useEffect(() => {
        if (!socket) return;

        socket.on('lobby:playerJoined', (data) => {
            const dataRoomId = data.roomId || (data as any)._id;
            if (dataRoomId === roomId) {
                setRoom(prev => ({
                    ...prev,
                    players: [...prev.players, {
                        id: data.player.id,
                        username: data.player.username,
                        hand: [],
                        isReady: false,
                        isConnected: true,
                        score: 0
                    }]
                }));
            }
        });

        socket.on('lobby:playerLeft', (data) => {
            const dataRoomId = data.roomId || (data as any)._id;
            if (dataRoomId === roomId) {
                setRoom(prev => ({
                    ...prev,
                    players: prev.players.filter(p => p.id !== data.playerId)
                }));
            }
        });

        socket.on('lobby:playerReady', (data) => {
            const dataRoomId = data.roomId || (data as any)._id;
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
        durak: { name: 'Durak', icon: '🃏', description: 'Russian Card Game - Don\'t be the fool!' },
        tictactoe: { name: 'Tic-Tac-Toe', icon: '❌', description: 'Classic XO Game - Get 3 in a row!' },
    };

    const currentPlayer = room.players.find(p => p.id === user?.id);
    const isReady = currentPlayer?.isReady || false;
    const allPlayersReady = room.players.every(p => p.id === room.hostId || p.isReady);
    const canStart = isHost && room.players.length >= 2 && allPlayersReady;

    return (
        <div className="game-room-container">
            <div className="game-room-header">
                <button className="btn btn-secondary back-btn" onClick={handleLeave}>
                    ← Back to Lobby
                </button>
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

                    <div className="players-section">
                        <h2>Players ({room.players.length}/{room.maxPlayers})</h2>
                        <div className="players-grid">
                            {Array.from({ length: room.maxPlayers }).map((_, index) => {
                                const player = room.players[index];
                                return (
                                    <div
                                        key={index}
                                        className={`player-slot ${player ? 'occupied' : 'empty'} ${player?.id === room.hostId ? 'host' : ''}`}
                                    >
                                        {player ? (
                                            <>
                                                <div className="player-avatar">
                                                    {player.username.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="player-info">
                                                    <span className="player-name">
                                                        {player.username}
                                                        {player.id === room.hostId && <span className="host-badge">👑</span>}
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
