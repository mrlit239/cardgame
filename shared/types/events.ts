import type { Card } from './card';
import type { Room, GameType, PhomGameState, PokerGameState, DurakGameState } from './game';

// Client to Server Events
export interface ClientToServerEvents {
    // Auth
    'auth:login': (data: { username: string; password: string }, callback: (response: AuthResponse) => void) => void;
    'auth:register': (data: { username: string; password: string }, callback: (response: AuthResponse) => void) => void;
    'auth:logout': () => void;

    // Lobby
    'lobby:createRoom': (data: { name: string; gameType: GameType; maxPlayers: number }, callback: (response: RoomResponse) => void) => void;
    'lobby:joinRoom': (roomId: string, callback: (response: RoomResponse) => void) => void;
    'lobby:leaveRoom': () => void;
    'lobby:getRooms': (callback: (rooms: Room[]) => void) => void;
    'lobby:ready': () => void;
    'lobby:startGame': () => void;

    // Game Actions
    'game:start': () => void;
    'game:leave': () => void;
    'game:drawCard': () => void;
    'game:discardCard': (cardId: string) => void;
    'game:takeCard': () => void;
    'game:playCards': (cardIds: string[]) => void;
    'game:meldPhom': (cardIds: string[]) => void;
    'game:attachCard': (cardId: string, phomIndex: number) => void;
    'game:fold': () => void;
    'game:check': () => void;
    'game:call': () => void;
    'game:raise': (amount: number) => void;
    'game:allIn': () => void;
    'game:attack': (cardIds: string[]) => void;
    'game:defend': (attackCardId: string, defenseCardId: string) => void;
    'game:takeCards': () => void;
    'game:passAttack': () => void;

    // TicTacToe
    'tictactoe:start': (callback?: (response: { success: boolean; message?: string }) => void) => void;
    'tictactoe:move': (position: number, callback?: (response: { success: boolean; message?: string }) => void) => void;
    'tictactoe:reset': (callback?: (response: { success: boolean; message?: string }) => void) => void;
    'tictactoe:leave': () => void;
}

// Server to Client Events
export interface ServerToClientEvents {
    // Auth
    'auth:success': (data: { userId: string; username: string; token: string }) => void;
    'auth:error': (message: string) => void;

    // Lobby
    'lobby:roomCreated': (room: Room) => void;
    'lobby:roomUpdated': (room: Room) => void;
    'lobby:roomDeleted': (roomId: string) => void;
    'lobby:playerJoined': (data: { roomId: string; player: { id: string; username: string } }) => void;
    'lobby:playerLeft': (data: { roomId: string; playerId: string }) => void;
    'lobby:playerReady': (data: { roomId: string; playerId: string; isReady: boolean }) => void;
    'lobby:error': (message: string) => void;

    // Game
    'game:starting': (data: { roomId: string; gameType: GameType; players: { userId: string; username: string }[] }) => void;
    'game:started': (gameState: PhomGameState | PokerGameState | DurakGameState) => void;
    'game:stateUpdate': (gameState: PhomGameState | PokerGameState | DurakGameState) => void;
    'game:yourTurn': () => void;
    'game:turnEnded': (playerId: string) => void;
    'game:cardDrawn': (card: Card) => void;
    'game:cardDiscarded': (data: { playerId: string; card: Card }) => void;
    'game:cardsPlayed': (data: { playerId: string; cards: Card[] }) => void;
    'game:phomMelded': (data: { playerId: string; cards: Card[] }) => void;
    'game:roundEnded': (data: { scores: Record<string, number> }) => void;
    'game:ended': (data: { winner: string; finalScores: Record<string, number> }) => void;
    'game:error': (message: string) => void;

    // TicTacToe
    'tictactoe:started': (state: TicTacToeState) => void;
    'tictactoe:stateUpdate': (state: TicTacToeState) => void;
    'tictactoe:gameOver': (data: { winner: string | null; isDraw: boolean; winningLine: number[] | null }) => void;
    'tictactoe:playerLeft': (data: { playerId: string }) => void;

    // Chat
    'chat:message': (data: { playerId: string; username: string; message: string; timestamp: Date }) => void;
}

// TicTacToe types
export interface TicTacToeState {
    board: (string | null)[];
    players: { id: string; username: string; symbol: 'X' | 'O' }[];
    currentPlayerIndex: number;
    winner: string | null;
    isDraw: boolean;
    isGameOver: boolean;
    winningLine: number[] | null;
}

// Response types
export interface AuthResponse {
    success: boolean;
    message?: string;
    userId?: string;
    username?: string;
    token?: string;
}

export interface RoomResponse {
    success: boolean;
    message?: string;
    room?: Room;
}
