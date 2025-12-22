import { Card, Suit, Rank, BaCayPlayer, BaCayState, BaCayResult, calculateHandScore, compareHands } from './types';

// Create a standard 52-card deck
function createDeck(variant: '52' | '36' = '52'): Card[] {
    const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
    const deck: Card[] = [];

    // 36-card variant: A-9 only (ranks 2-9, 14 for Ace)
    // 52-card variant: full deck
    const minRank = 2;
    const maxRank = variant === '36' ? 9 : 14;  // 14 = Ace (counted as 1)

    let cardId = 0;
    for (const suit of suits) {
        for (let rank = minRank; rank <= maxRank; rank++) {
            // Skip 10-13 (10, J, Q, K) for 36-card variant
            if (variant === '36' && rank >= 10 && rank <= 13) continue;

            deck.push({
                id: `card_${cardId++}`,
                suit,
                rank: (rank === 1 ? 14 : rank) as Rank  // Ace is stored as 14
            });
        }

        // Add Ace for each suit
        deck.push({
            id: `card_${cardId++}`,
            suit,
            rank: 14  // Ace
        });
    }

    return deck;
}

// Shuffle deck using Fisher-Yates
function shuffleDeck(deck: Card[]): Card[] {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

export class BaCayGame {
    private state: BaCayState;
    private deck: Card[] = [];

    constructor(roomId: string, players: { id: string; username: string }[], betAmount: number = 100) {
        this.state = {
            roomId,
            players: players.map(p => ({
                id: p.id,
                username: p.username,
                hand: [],
                score: 0,
                totalValue: 0,
                isBaTay: false,
                faceCardCount: 0,
                highestCard: null,
                isRevealed: false
            })),
            deckVariant: '52',
            phase: 'waiting',
            betAmount,
            results: []
        };
    }

    // Get max players based on deck (52/3 = 17, but practical limit is 12)
    static getMaxPlayers(deckVariant: '52' | '36' = '52'): number {
        const deckSize = deckVariant === '52' ? 52 : 36;
        const cardsPerPlayer = 3;
        const maxPossible = Math.floor(deckSize / cardsPerPlayer);
        return Math.min(maxPossible, 12);  // Cap at 12 for practical gameplay
    }

    // Start the game - deal 3 cards to each player
    startGame(): BaCayState {
        // Create and shuffle deck
        this.deck = shuffleDeck(createDeck(this.state.deckVariant));

        // Deal 3 cards to each player
        for (const player of this.state.players) {
            player.hand = this.deck.splice(0, 3);

            // Calculate score
            const result = calculateHandScore(player.hand, this.state.deckVariant);
            player.score = result.score;
            player.totalValue = result.totalValue;
            player.isBaTay = result.isBaTay;
            player.faceCardCount = result.faceCardCount;
            player.highestCard = result.highestCard;
            player.isRevealed = false;
        }

        this.state.phase = 'revealing';
        return this.getState();
    }

    // Player reveals their hand
    revealHand(playerId: string): boolean {
        const player = this.state.players.find(p => p.id === playerId);
        if (!player) return false;

        player.isRevealed = true;

        // Check if all players have revealed
        const allRevealed = this.state.players.every(p => p.isRevealed);
        if (allRevealed) {
            this.calculateResults();
        }

        return true;
    }

    // Auto-reveal all hands (for timeout or quick play)
    revealAllHands(): void {
        for (const player of this.state.players) {
            player.isRevealed = true;
        }
        this.calculateResults();
    }

    // Calculate final results and rankings
    private calculateResults(): void {
        this.state.phase = 'showdown';

        // Sort players by hand strength (strongest first)
        const sortedPlayers = [...this.state.players].sort((a, b) => compareHands(b, a));

        // Assign ranks and calculate credits
        const results: BaCayResult[] = [];
        const pot = this.state.betAmount * this.state.players.length;

        // Find all winners (tied for first)
        const winners: BaCayPlayer[] = [sortedPlayers[0]];
        for (let i = 1; i < sortedPlayers.length; i++) {
            if (compareHands(sortedPlayers[0], sortedPlayers[i]) === 0) {
                winners.push(sortedPlayers[i]);
            } else {
                break;
            }
        }

        // Split pot among winners
        const winnerShare = Math.floor(pot / winners.length);

        for (let i = 0; i < sortedPlayers.length; i++) {
            const player = sortedPlayers[i];
            const isWinner = winners.some(w => w.id === player.id);

            results.push({
                playerId: player.id,
                username: player.username,
                rank: isWinner ? 1 : i + 1,
                score: player.score,
                isBaTay: player.isBaTay,
                creditsChange: isWinner ? winnerShare - this.state.betAmount : -this.state.betAmount
            });
        }

        this.state.results = results;
        this.state.phase = 'finished';
    }

    // Get current game state
    getState(): BaCayState {
        return { ...this.state };
    }

    // Get state for a specific player (hide other players' cards if not revealed)
    getStateForPlayer(playerId: string): BaCayState {
        const state = this.getState();

        // If game is finished, show all cards
        if (state.phase === 'finished' || state.phase === 'showdown') {
            return state;
        }

        // Hide unrevealed players' cards
        state.players = state.players.map(p => {
            if (p.id === playerId || p.isRevealed) {
                return p;
            }
            return {
                ...p,
                hand: [],  // Hide cards
                score: 0,
                totalValue: 0,
                isBaTay: false,
                faceCardCount: 0,
                highestCard: null
            };
        });

        return state;
    }

    // Get results
    getResults(): BaCayResult[] {
        return this.state.results;
    }

    // Check if game is finished
    isFinished(): boolean {
        return this.state.phase === 'finished';
    }
}
