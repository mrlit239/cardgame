import type { Card, Suit, Rank } from '../types/card';
import { createDeck, shuffleDeck } from '../types/card';

export interface PhomPlayer {
    id: string;
    username: string;
    hand: Card[];
    phoms: Card[][]; // Melded phom sets
    score: number;
    isConnected: boolean;
}

export interface PhomGameState {
    roomId: string;
    players: PhomPlayer[];
    currentPlayerIndex: number;
    deck: Card[];
    discardPile: Card[];
    status: 'waiting' | 'playing' | 'finished';
    round: number;
    dealerIndex: number;
    lastAction?: {
        type: 'draw' | 'take' | 'discard' | 'meld' | 'attach';
        playerId: string;
        card?: Card;
        cards?: Card[];
    };
    winner?: string;
    turnStartTime: number;
    turnTimeLimit: number;
}

export class PhomEngine {
    private state: PhomGameState;

    constructor(roomId: string, players: { id: string; username: string }[]) {
        this.state = {
            roomId,
            players: players.map(p => ({
                id: p.id,
                username: p.username,
                hand: [],
                phoms: [],
                score: 0,
                isConnected: true,
            })),
            currentPlayerIndex: 0,
            deck: [],
            discardPile: [],
            status: 'waiting',
            round: 1,
            dealerIndex: 0,
            turnStartTime: Date.now(),
            turnTimeLimit: 30000, // 30 seconds per turn
        };
    }

    // Start a new game
    startGame(): PhomGameState {
        // Create and shuffle deck
        this.state.deck = shuffleDeck(createDeck());
        this.state.status = 'playing';
        this.state.discardPile = [];

        // Reset player hands and phoms
        this.state.players.forEach(p => {
            p.hand = [];
            p.phoms = [];
        });

        // Deal cards - 9 cards each, dealer gets 10
        const numPlayers = this.state.players.length;
        for (let i = 0; i < 9; i++) {
            for (let j = 0; j < numPlayers; j++) {
                const card = this.state.deck.pop();
                if (card) {
                    this.state.players[j].hand.push(card);
                }
            }
        }

        // Dealer gets one extra card (10 cards total)
        const extraCard = this.state.deck.pop();
        if (extraCard) {
            this.state.players[this.state.dealerIndex].hand.push(extraCard);
        }

        // Dealer goes first
        this.state.currentPlayerIndex = this.state.dealerIndex;
        this.state.turnStartTime = Date.now();

        // Sort all hands
        this.state.players.forEach(p => {
            p.hand = this.sortHand(p.hand);
        });

        return this.getState();
    }

    // Get current game state
    getState(): PhomGameState {
        return { ...this.state };
    }

    // Get state for a specific player (hides other players' cards)
    getStateForPlayer(playerId: string): PhomGameState {
        const state = this.getState();
        state.players = state.players.map(p => ({
            ...p,
            hand: p.id === playerId ? p.hand : p.hand.map(() => ({ id: 'hidden', suit: 'spades' as Suit, rank: 2 as Rank })),
        }));
        return state;
    }

    // Get current player
    getCurrentPlayer(): PhomPlayer {
        return this.state.players[this.state.currentPlayerIndex];
    }

    // Draw a card from deck
    drawCard(playerId: string): { success: boolean; card?: Card; error?: string } {
        if (this.state.status !== 'playing') {
            return { success: false, error: 'Game is not in progress' };
        }

        const currentPlayer = this.getCurrentPlayer();
        if (currentPlayer.id !== playerId) {
            return { success: false, error: 'Not your turn' };
        }

        // Can only draw if hand has 9 cards (haven't drawn yet this turn)
        if (currentPlayer.hand.length >= 10) {
            return { success: false, error: 'Already drew a card this turn' };
        }

        if (this.state.deck.length === 0) {
            return { success: false, error: 'Deck is empty' };
        }

        const card = this.state.deck.pop()!;
        currentPlayer.hand.push(card);
        currentPlayer.hand = this.sortHand(currentPlayer.hand);

        this.state.lastAction = { type: 'draw', playerId, card };

        return { success: true, card };
    }

    // Take top card from discard pile
    takeFromDiscard(playerId: string): { success: boolean; card?: Card; error?: string } {
        if (this.state.status !== 'playing') {
            return { success: false, error: 'Game is not in progress' };
        }

        const currentPlayer = this.getCurrentPlayer();
        if (currentPlayer.id !== playerId) {
            return { success: false, error: 'Not your turn' };
        }

        if (currentPlayer.hand.length >= 10) {
            return { success: false, error: 'Already drew a card this turn' };
        }

        if (this.state.discardPile.length === 0) {
            return { success: false, error: 'Discard pile is empty' };
        }

        const card = this.state.discardPile.pop()!;
        currentPlayer.hand.push(card);
        currentPlayer.hand = this.sortHand(currentPlayer.hand);

        this.state.lastAction = { type: 'take', playerId, card };

        return { success: true, card };
    }

    // Discard a card (ends turn)
    discardCard(playerId: string, cardId: string): { success: boolean; error?: string } {
        if (this.state.status !== 'playing') {
            return { success: false, error: 'Game is not in progress' };
        }

        const currentPlayer = this.getCurrentPlayer();
        if (currentPlayer.id !== playerId) {
            return { success: false, error: 'Not your turn' };
        }

        if (currentPlayer.hand.length !== 10) {
            return { success: false, error: 'Must draw a card first' };
        }

        const cardIndex = currentPlayer.hand.findIndex(c => c.id === cardId);
        if (cardIndex === -1) {
            return { success: false, error: 'Card not in hand' };
        }

        const [card] = currentPlayer.hand.splice(cardIndex, 1);
        this.state.discardPile.push(card);

        this.state.lastAction = { type: 'discard', playerId, card };

        // Check for win (empty hand with valid phoms)
        const handSize = currentPlayer.hand.length;
        if (handSize < 1) {
            this.endRound(playerId);
        } else {
            // Move to next player
            this.nextTurn();
        }

        return { success: true };
    }

    // Meld a phom (set or run)
    meldPhom(playerId: string, cardIds: string[]): { success: boolean; error?: string } {
        if (this.state.status !== 'playing') {
            return { success: false, error: 'Game is not in progress' };
        }

        const currentPlayer = this.getCurrentPlayer();
        if (currentPlayer.id !== playerId) {
            return { success: false, error: 'Not your turn' };
        }

        if (cardIds.length < 3) {
            return { success: false, error: 'Phom must have at least 3 cards' };
        }

        // Get the cards
        const cards: Card[] = [];
        for (const id of cardIds) {
            const card = currentPlayer.hand.find(c => c.id === id);
            if (!card) {
                return { success: false, error: 'Card not in hand' };
            }
            cards.push(card);
        }

        // Validate phom
        if (!this.isValidPhom(cards)) {
            return { success: false, error: 'Invalid phom - must be a set (same rank) or run (consecutive same suit)' };
        }

        // Remove cards from hand and add to phoms
        for (const id of cardIds) {
            const idx = currentPlayer.hand.findIndex(c => c.id === id);
            if (idx !== -1) {
                currentPlayer.hand.splice(idx, 1);
            }
        }
        currentPlayer.phoms.push(cards);

        this.state.lastAction = { type: 'meld', playerId, cards };

        return { success: true };
    }

    // Check if cards form a valid phom
    isValidPhom(cards: Card[]): boolean {
        if (cards.length < 3) return false;

        // Check for set (same rank)
        const isSet = cards.every(c => c.rank === cards[0].rank);
        if (isSet) return true;

        // Check for run (consecutive same suit)
        const sameSuit = cards.every(c => c.suit === cards[0].suit);
        if (!sameSuit) return false;

        // Sort by rank and check consecutive
        const sorted = [...cards].sort((a, b) => a.rank - b.rank);
        for (let i = 1; i < sorted.length; i++) {
            if (sorted[i].rank !== sorted[i - 1].rank + 1) {
                return false;
            }
        }

        return true;
    }

    // End the round
    private endRound(winnerId: string) {
        this.state.status = 'finished';
        this.state.winner = winnerId;

        // Calculate scores (deadwood = unmelded cards value)
        for (const player of this.state.players) {
            if (player.id === winnerId) {
                player.score = 0;
            } else {
                player.score = this.calculateDeadwood(player.hand);
            }
        }
    }

    // Calculate deadwood score
    private calculateDeadwood(hand: Card[]): number {
        return hand.reduce((sum, card) => {
            if (card.rank >= 10) return sum + 10; // J, Q, K = 10
            if (card.rank === 14) return sum + 1; // A = 1
            return sum + card.rank;
        }, 0);
    }

    // Move to next player's turn
    private nextTurn() {
        this.state.currentPlayerIndex = (this.state.currentPlayerIndex + 1) % this.state.players.length;
        this.state.turnStartTime = Date.now();
    }

    // Sort hand by suit then rank
    private sortHand(hand: Card[]): Card[] {
        return [...hand].sort((a, b) => {
            if (a.suit !== b.suit) {
                const suitOrder = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };
                return suitOrder[a.suit] - suitOrder[b.suit];
            }
            return a.rank - b.rank;
        });
    }

    // Handle player disconnect
    playerDisconnected(playerId: string) {
        const player = this.state.players.find(p => p.id === playerId);
        if (player) {
            player.isConnected = false;
        }
    }

    // Handle player reconnect
    playerReconnected(playerId: string) {
        const player = this.state.players.find(p => p.id === playerId);
        if (player) {
            player.isConnected = true;
        }
    }
}
