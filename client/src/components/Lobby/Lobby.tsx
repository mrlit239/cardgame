import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import type { Room, GameType } from '../../../../shared/types/game';
import './Lobby.css';

interface LobbyProps {
    onJoinGame: (room: Room) => void;
}

export function Lobby({ onJoinGame }: LobbyProps) {
    const { user, socket, logout } = useAuth();
    const [rooms, setRooms] = useState<Room[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedGameType, setSelectedGameType] = useState<GameType>('phom');
    const [roomName, setRoomName] = useState('');
    const [maxPlayers, setMaxPlayers] = useState(4);
    const [isLoading, setIsLoading] = useState(true);

    // Fetch rooms on mount
    useEffect(() => {
        if (!socket) return;

        socket.emit('lobby:getRooms', (fetchedRooms) => {
            setRooms(fetchedRooms as Room[]);
            setIsLoading(false);
        });

        // Listen for room updates
        socket.on('lobby:roomCreated', (room) => {
            setRooms(prev => [room as Room, ...prev]);
        });

        socket.on('lobby:roomUpdated', (room) => {
            setRooms(prev => prev.map(r => r.id === room.id ? room as Room : r));
        });

        socket.on('lobby:roomDeleted', (roomId) => {
            setRooms(prev => prev.filter(r => r.id !== roomId));
        });

        return () => {
            socket.off('lobby:roomCreated');
            socket.off('lobby:roomUpdated');
            socket.off('lobby:roomDeleted');
        };
    }, [socket]);

    const handleCreateRoom = useCallback(() => {
        if (!socket || !user) return;

        socket.emit('lobby:createRoom', {
            name: roomName || `${user.username}'s Room`,
            gameType: selectedGameType,
            maxPlayers,
        }, (response) => {
            if (response.success && response.room) {
                setShowCreateModal(false);
                setRoomName('');
                onJoinGame(response.room as Room);
            }
        });
    }, [socket, user, roomName, selectedGameType, maxPlayers, onJoinGame]);

    const handleJoinRoom = useCallback((roomId: string) => {
        if (!socket) return;

        socket.emit('lobby:joinRoom', roomId, (response) => {
            if (response.success && response.room) {
                onJoinGame(response.room as Room);
            }
        });
    }, [socket, onJoinGame]);

    const gameTypeInfo = {
        phom: { name: 'Phom', icon: '🎴', players: '2-4', description: 'Vietnamese Rummy' },
        poker: { name: 'Poker', icon: '♠️', players: '2-9', description: 'Texas Hold\'em' },
        durak: { name: 'Durak', icon: '🃏', players: '2-6', description: 'Russian Card Game' },
    };

    return (
        <div className="lobby-container">
            {/* Header */}
            <header className="lobby-header">
                <div className="lobby-brand">
                    <span className="brand-icon">🎴</span>
                    <h1>Card Games</h1>
                </div>
                <div className="lobby-user">
                    <span className="user-name">{user?.username}</span>
                    <button className="btn btn-secondary" onClick={logout}>
                        Logout
                    </button>
                </div>
            </header>

            {/* Game Selection */}
            <section className="game-selection">
                <h2>Choose Your Game</h2>
                <div className="game-cards">
                    {(Object.keys(gameTypeInfo) as GameType[]).map((type) => (
                        <div
                            key={type}
                            className={`game-card ${selectedGameType === type ? 'selected' : ''}`}
                            onClick={() => setSelectedGameType(type)}
                        >
                            <span className="game-icon">{gameTypeInfo[type].icon}</span>
                            <h3>{gameTypeInfo[type].name}</h3>
                            <p className="game-players">{gameTypeInfo[type].players} Players</p>
                            <p className="game-desc">{gameTypeInfo[type].description}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Actions */}
            <section className="lobby-actions">
                <button
                    className="btn btn-primary create-room-btn"
                    onClick={() => setShowCreateModal(true)}
                >
                    <span>+</span> Create Room
                </button>
            </section>

            {/* Room List */}
            <section className="room-list-section">
                <h2>Available Rooms</h2>
                {isLoading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Loading rooms...</p>
                    </div>
                ) : rooms.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon">🎮</span>
                        <p>No rooms available</p>
                        <p className="text-muted">Create a room to start playing!</p>
                    </div>
                ) : (
                    <div className="room-list">
                        {rooms.filter(r => r.gameType === selectedGameType).map((room) => {
                            const roomId = room.id || (room as any)._id;
                            return (
                                <div key={roomId} className="room-item">
                                    <div className="room-info">
                                        <div className="room-header">
                                            <span className="room-icon">{gameTypeInfo[room.gameType].icon}</span>
                                            <h3 className="room-name">{room.name}</h3>
                                        </div>
                                        <div className="room-details">
                                            <span className="room-players">
                                                👥 {room.players.length}/{room.maxPlayers}
                                            </span>
                                            <span className={`room-status ${room.status}`}>
                                                {room.status === 'waiting' ? '⏳ Waiting' : '🎮 Playing'}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => handleJoinRoom(roomId)}
                                        disabled={room.status !== 'waiting' || room.players.length >= room.maxPlayers}
                                    >
                                        Join
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                )}
            </section>

            {/* Create Room Modal */}
            {showCreateModal && (
                <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Create Room</h2>
                            <button className="modal-close" onClick={() => setShowCreateModal(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>Room Name</label>
                                <input
                                    type="text"
                                    className="input"
                                    placeholder={`${user?.username}'s Room`}
                                    value={roomName}
                                    onChange={(e) => setRoomName(e.target.value)}
                                />
                            </div>
                            <div className="form-group">
                                <label>Game Type</label>
                                <select
                                    className="input"
                                    value={selectedGameType}
                                    onChange={(e) => setSelectedGameType(e.target.value as GameType)}
                                >
                                    <option value="phom">Phom (Vietnamese Rummy)</option>
                                    <option value="poker">Poker (Texas Hold'em)</option>
                                    <option value="durak">Durak (Russian)</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Max Players</label>
                                <select
                                    className="input"
                                    value={maxPlayers}
                                    onChange={(e) => setMaxPlayers(Number(e.target.value))}
                                >
                                    {selectedGameType === 'phom' && (
                                        <>
                                            <option value="2">2 Players</option>
                                            <option value="3">3 Players</option>
                                            <option value="4">4 Players</option>
                                        </>
                                    )}
                                    {selectedGameType === 'poker' && (
                                        <>
                                            <option value="2">2 Players</option>
                                            <option value="4">4 Players</option>
                                            <option value="6">6 Players</option>
                                            <option value="9">9 Players</option>
                                        </>
                                    )}
                                    {selectedGameType === 'durak' && (
                                        <>
                                            <option value="2">2 Players</option>
                                            <option value="3">3 Players</option>
                                            <option value="4">4 Players</option>
                                            <option value="6">6 Players</option>
                                        </>
                                    )}
                                </select>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                                Cancel
                            </button>
                            <button className="btn btn-primary" onClick={handleCreateRoom}>
                                Create Room
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
