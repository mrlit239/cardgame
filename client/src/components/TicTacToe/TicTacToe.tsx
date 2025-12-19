import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import './TicTacToe.css';

interface TicTacToePlayer {
    id: string;
    username: string;
    symbol: 'X' | 'O';
}

interface TicTacToeState {
    board: (string | null)[];
    players: TicTacToePlayer[];
    currentPlayerIndex: number;
    winner: string | null;
    isDraw: boolean;
    isGameOver: boolean;
    winningLine: number[] | null;
}

interface TicTacToeGameProps {
    roomId: string;
    onLeave: () => void;
}

export function TicTacToeGame({ roomId, onLeave }: TicTacToeGameProps) {
    const { user, socket } = useAuth();
    const [gameState, setGameState] = useState<TicTacToeState | null>(null);
    const [error, setError] = useState('');
    const [isStarting, setIsStarting] = useState(false);

    useEffect(() => {
        if (!socket) return;

        socket.on('tictactoe:started', (state: TicTacToeState) => {
            setGameState(state);
            setIsStarting(false);
        });

        socket.on('tictactoe:stateUpdate', (state: TicTacToeState) => {
            setGameState(state);
        });

        socket.on('tictactoe:gameOver', (data: { winner: string | null; isDraw: boolean }) => {
            console.log('Game over:', data);
        });

        socket.on('tictactoe:playerLeft', () => {
            setError('Opponent left the game');
            setGameState(null);
        });

        return () => {
            socket.off('tictactoe:started');
            socket.off('tictactoe:stateUpdate');
            socket.off('tictactoe:gameOver');
            socket.off('tictactoe:playerLeft');
        };
    }, [socket]);

    const startGame = useCallback(() => {
        if (!socket) return;
        setIsStarting(true);
        socket.emit('tictactoe:start', (response: any) => {
            if (!response.success) {
                setError(response.message || 'Failed to start game');
                setIsStarting(false);
            }
        });
    }, [socket]);

    const makeMove = useCallback((position: number) => {
        if (!socket || !gameState) return;

        socket.emit('tictactoe:move', position, (response: any) => {
            if (!response.success) {
                setError(response.message || 'Invalid move');
                setTimeout(() => setError(''), 2000);
            }
        });
    }, [socket, gameState]);

    const resetGame = useCallback(() => {
        if (!socket) return;
        socket.emit('tictactoe:reset');
    }, [socket]);

    const handleLeave = useCallback(() => {
        if (socket) {
            socket.emit('tictactoe:leave');
        }
        onLeave();
    }, [socket, onLeave]);

    const currentPlayer = gameState?.players[gameState.currentPlayerIndex];
    const isMyTurn = currentPlayer?.id === user?.id;
    const myPlayer = gameState?.players.find(p => p.id === user?.id);
    const opponentPlayer = gameState?.players.find(p => p.id !== user?.id);

    // If game hasn't started, show start button
    if (!gameState) {
        return (
            <div className="tictactoe-container">
                <div className="tictactoe-header">
                    <button className="btn btn-secondary" onClick={handleLeave}>
                        ← Leave Game
                    </button>
                </div>
                <div className="tictactoe-start-screen">
                    <h1>❌ Tic-Tac-Toe ⭕</h1>
                    <p>Room ID: {roomId}</p>
                    {error && <p className="error">{error}</p>}
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

    return (
        <div className="tictactoe-container">
            <div className="tictactoe-header">
                <button className="btn btn-secondary" onClick={handleLeave}>
                    ← Leave Game
                </button>
                <div className="game-info">
                    {gameState.isGameOver ? (
                        gameState.isDraw ? (
                            <span className="game-status draw">It's a Draw!</span>
                        ) : (
                            <span className="game-status winner">
                                {gameState.winner === user?.id ? '🎉 You Won!' : '😢 You Lost!'}
                            </span>
                        )
                    ) : (
                        <span className={`game-status ${isMyTurn ? 'your-turn' : ''}`}>
                            {isMyTurn ? "Your turn" : `${opponentPlayer?.username}'s turn`}
                        </span>
                    )}
                </div>
            </div>

            <div className="players-info">
                <div className={`player-card ${myPlayer?.symbol === 'X' ? 'x-player' : 'o-player'} ${isMyTurn ? 'active' : ''}`}>
                    <span className="symbol">{myPlayer?.symbol}</span>
                    <span className="name">You ({myPlayer?.username})</span>
                </div>
                <span className="vs">VS</span>
                <div className={`player-card ${opponentPlayer?.symbol === 'X' ? 'x-player' : 'o-player'} ${!isMyTurn && !gameState.isGameOver ? 'active' : ''}`}>
                    <span className="symbol">{opponentPlayer?.symbol}</span>
                    <span className="name">{opponentPlayer?.username}</span>
                </div>
            </div>

            {error && <p className="error">{error}</p>}

            <div className="tictactoe-board">
                {gameState.board.map((cell, index) => (
                    <button
                        key={index}
                        className={`cell ${cell || ''} ${gameState.winningLine?.includes(index) ? 'winning' : ''}`}
                        onClick={() => makeMove(index)}
                        disabled={!!cell || gameState.isGameOver || !isMyTurn}
                    >
                        {cell}
                    </button>
                ))}
            </div>

            {gameState.isGameOver && (
                <div className="game-over-actions">
                    <button className="btn btn-primary" onClick={resetGame}>
                        Play Again
                    </button>
                    <button className="btn btn-secondary" onClick={handleLeave}>
                        Leave
                    </button>
                </div>
            )}
        </div>
    );
}
