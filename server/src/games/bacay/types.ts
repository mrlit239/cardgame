// Define card types locally to avoid rootDir issues
export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
    id: string;
    suit: Suit;
    rank: Rank;
}

// Ba Cây Player
export interface BaCayPlayer {
    id: string;
    username: string;
    hand: Card[];
    score: number;        // 0-9 (last digit of sum)
    totalValue: number;   // actual sum before mod 10
    isBaTay: boolean;     // 3 face cards = instant win
    faceCardCount: number;
    highestCard: Card | null;
    isRevealed: boolean;
}

// Game result for a player
export interface BaCayResult {
    playerId: string;
    username: string;
    rank: number;         // 1 = winner
    score: number;
    isBaTay: boolean;
    creditsChange: number;
}

// Game state
export interface BaCayState {
    roomId: string;
    players: BaCayPlayer[];
    deckVariant: '52' | '36';  // 52-card or 36-card (A-9 only)
    phase: 'waiting' | 'dealing' | 'revealing' | 'showdown' | 'finished';
    betAmount: number;
    results: BaCayResult[];
}

// Card value mapping
export function getCardValue(card: Card, deckVariant: '52' | '36' = '52'): number {
    // A = 1
    if (card.rank === 14) return 1;  // Ace

    // 2-9 = face value
    if (card.rank >= 2 && card.rank <= 9) return card.rank;

    // For 52-card variant: 10, J, Q, K = 10
    if (deckVariant === '52') {
        if (card.rank >= 10 && card.rank <= 13) return 10;
    }

    return card.rank;
}

// Check if card is a face card (J, Q, K)
export function isFaceCard(card: Card): boolean {
    return card.rank >= 11 && card.rank <= 13;  // J=11, Q=12, K=13
}

// Calculate hand score (returns 0-9)
export function calculateHandScore(cards: Card[], deckVariant: '52' | '36' = '52'): {
    score: number;
    totalValue: number;
    isBaTay: boolean;
    faceCardCount: number;
    highestCard: Card | null;
} {
    if (cards.length !== 3) {
        return { score: 0, totalValue: 0, isBaTay: false, faceCardCount: 0, highestCard: null };
    }

    // Count face cards
    const faceCardCount = cards.filter(c => isFaceCard(c)).length;

    // Ba Tây = 3 face cards (J, Q, K) - instant win
    const isBaTay = faceCardCount === 3;

    // Calculate total value
    const totalValue = cards.reduce((sum, card) => sum + getCardValue(card, deckVariant), 0);

    // Score = last digit (0-9)
    const score = totalValue % 10;

    // Find highest card for tie-breaker
    const sortedCards = [...cards].sort((a, b) => b.rank - a.rank);
    const highestCard = sortedCards[0];

    return { score, totalValue, isBaTay, faceCardCount, highestCard };
}

// Suit order for tie-breaking: ♥ > ♦ > ♣ > ♠
export const SUIT_ORDER: Record<Suit, number> = {
    hearts: 4,
    diamonds: 3,
    clubs: 2,
    spades: 1
};

// Compare two hands: returns -1 (h1 loses), 0 (tie), 1 (h1 wins)
export function compareHands(h1: BaCayPlayer, h2: BaCayPlayer): number {
    // 1. Ba Tây beats everything (except another Ba Tây)
    if (h1.isBaTay && !h2.isBaTay) return 1;
    if (!h1.isBaTay && h2.isBaTay) return -1;
    if (h1.isBaTay && h2.isBaTay) {
        // Both Ba Tây - compare highest face card
        if (h1.highestCard && h2.highestCard) {
            if (h1.highestCard.rank !== h2.highestCard.rank) {
                return h1.highestCard.rank > h2.highestCard.rank ? 1 : -1;
            }
            // Same rank, compare suit
            return SUIT_ORDER[h1.highestCard.suit] > SUIT_ORDER[h2.highestCard.suit] ? 1 : -1;
        }
        return 0;
    }

    // 2. Compare score (0-9, higher wins)
    if (h1.score !== h2.score) {
        return h1.score > h2.score ? 1 : -1;
    }

    // 3. Same score - compare face card count
    if (h1.faceCardCount !== h2.faceCardCount) {
        return h1.faceCardCount > h2.faceCardCount ? 1 : -1;
    }

    // 4. Compare highest card rank
    if (h1.highestCard && h2.highestCard) {
        if (h1.highestCard.rank !== h2.highestCard.rank) {
            return h1.highestCard.rank > h2.highestCard.rank ? 1 : -1;
        }
        // 5. Same rank - compare suit
        return SUIT_ORDER[h1.highestCard.suit] > SUIT_ORDER[h2.highestCard.suit] ? 1 : -1;
    }

    return 0;  // True tie (shouldn't happen with suit comparison)
}
