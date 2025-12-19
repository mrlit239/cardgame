import type { Card } from './card';

// Game Types
export type GameType = 'phom' | 'poker' | 'durak' | 'tictactoe';
export type GameStatus = 'waiting' | 'playing' | 'finished';

export interface Player {
    id: string;
    username: string;
    hand: Card[];
    isReady: boolean;
    isConnected: boolean;
    score: number;
}

export interface Room {
    id: string;
    name: string;
    gameType: GameType;
    hostId: string;
    players: Player[];
    maxPlayers: number;
    status: GameStatus;
    createdAt: Date;
}

export interface GameState {
    roomId: string;
    gameType: GameType;
    players: Player[];
    currentPlayerIndex: number;
    deck: Card[];
    discardPile: Card[];
    status: GameStatus;
    winner?: string;
    turnTimeLimit: number;
    turnStartTime?: Date;
}

// Phom-specific state
export interface PhomGameState extends GameState {
    gameType: 'phom';
    tableCards: Card[][]; // Cards played on the table (phom sets)
    lastDrawnCard?: Card;
    canTake: boolean; // Can take from discard pile
    round: number;
    dealerId: string;
}

// Poker-specific state
export interface PokerGameState extends GameState {
    gameType: 'poker';
    communityCards: Card[];
    pot: number;
    currentBet: number;
    playerBets: Record<string, number>;
    playerChips: Record<string, number>;
    smallBlind: number;
    bigBlind: number;
    dealerIndex: number;
    phase: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
}

// Durak-specific state
export interface DurakGameState extends GameState {
    gameType: 'durak';
    trumpCard: Card;
    trumpSuit: Card['suit'];
    attackCards: Card[];
    defenseCards: Card[];
    attackerId: string;
    defenderId: string;
    isAttackPhase: boolean;
}
