import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthPage } from './components/Auth';
import { Lobby } from './components/Lobby';
import { GameRoom } from './components/GameRoom';
import { PhomGame } from './games/phom';
import type { Room } from '../../shared/types/game';
import './index.css';

type AppView = 'auth' | 'lobby' | 'room' | 'game';

function AppContent() {
  const { user, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<AppView>('lobby');
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);

  // Show loading state
  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <span className="loading-icon">🎴</span>
          <h1>Card Games</h1>
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Show auth if not logged in
  if (!user) {
    return <AuthPage />;
  }

  // Handle room join
  const handleJoinGame = (room: Room) => {
    setCurrentRoom(room);
    setCurrentView('room');
  };

  // Handle leaving room
  const handleLeaveRoom = () => {
    setCurrentRoom(null);
    setCurrentView('lobby');
  };

  // Handle game start
  const handleGameStart = () => {
    setCurrentView('game');
  };

  // Render based on current view
  switch (currentView) {
    case 'room':
      return currentRoom ? (
        <GameRoom
          room={currentRoom}
          onLeave={handleLeaveRoom}
          onGameStart={handleGameStart}
        />
      ) : (
        <Lobby onJoinGame={handleJoinGame} />
      );

    case 'game':
      if (!currentRoom) {
        return <Lobby onJoinGame={handleJoinGame} />;
      }

      // Render game based on game type
      if (currentRoom.gameType === 'phom') {
        return (
          <PhomGame
            roomId={currentRoom.id}
            onLeave={handleLeaveRoom}
          />
        );
      }

      // Fallback for other games (not yet implemented)
      return (
        <div className="game-placeholder">
          <h1>{currentRoom.gameType.toUpperCase()} - Coming Soon!</h1>
          <p>This game is not yet implemented.</p>
          <button className="btn btn-secondary" onClick={handleLeaveRoom}>
            Back to Lobby
          </button>
        </div>
      );

    default:
      return <Lobby onJoinGame={handleJoinGame} />;
  }
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;

