// Poker Hand Evaluator - Determines the strength of poker hands

import { Card, Suit, Rank } from '../types/card';

export enum HandRank {
    HIGH_CARD = 1,
    ONE_PAIR = 2,
    TWO_PAIR = 3,
    THREE_OF_A_KIND = 4,
    STRAIGHT = 5,
    FLUSH = 6,
    FULL_HOUSE = 7,
    FOUR_OF_A_KIND = 8,
    STRAIGHT_FLUSH = 9,
    ROYAL_FLUSH = 10,
}

export interface HandResult {
    rank: HandRank;
    rankName: string;
    cards: Card[];      // The 5 cards that make up the hand
    kickers: number[];  // Kicker values for tiebreaks
    score: number;      // Numeric score for comparison
}

// Get rank name for display
export function getHandRankName(rank: HandRank): string {
    const names: Record<HandRank, string> = {
        [HandRank.HIGH_CARD]: 'High Card',
        [HandRank.ONE_PAIR]: 'One Pair',
        [HandRank.TWO_PAIR]: 'Two Pair',
        [HandRank.THREE_OF_A_KIND]: 'Three of a Kind',
        [HandRank.STRAIGHT]: 'Straight',
        [HandRank.FLUSH]: 'Flush',
        [HandRank.FULL_HOUSE]: 'Full House',
        [HandRank.FOUR_OF_A_KIND]: 'Four of a Kind',
        [HandRank.STRAIGHT_FLUSH]: 'Straight Flush',
        [HandRank.ROYAL_FLUSH]: 'Royal Flush',
    };
    return names[rank];
}

// Calculate score for hand comparison
function calculateScore(rank: HandRank, kickers: number[]): number {
    // Base score from hand rank (multiply by large number)
    let score = rank * 10000000;

    // Add kickers with decreasing weight
    for (let i = 0; i < kickers.length && i < 5; i++) {
        score += kickers[i] * Math.pow(15, 4 - i);
    }

    return score;
}

// Count cards by rank
function countByRank(cards: Card[]): Map<Rank, Card[]> {
    const counts = new Map<Rank, Card[]>();
    for (const card of cards) {
        if (!counts.has(card.rank)) {
            counts.set(card.rank, []);
        }
        counts.get(card.rank)!.push(card);
    }
    return counts;
}

// Count cards by suit
function countBySuit(cards: Card[]): Map<Suit, Card[]> {
    const counts = new Map<Suit, Card[]>();
    for (const card of cards) {
        if (!counts.has(card.suit)) {
            counts.set(card.suit, []);
        }
        counts.get(card.suit)!.push(card);
    }
    return counts;
}

// Check for flush (5+ cards of same suit)
function findFlush(cards: Card[]): Card[] | null {
    const bySuit = countBySuit(cards);
    for (const [, suitCards] of bySuit) {
        if (suitCards.length >= 5) {
            // Return top 5 cards of this suit
            return suitCards
                .sort((a, b) => b.rank - a.rank)
                .slice(0, 5);
        }
    }
    return null;
}

// Check for straight (5 consecutive ranks)
function findStraight(cards: Card[]): Card[] | null {
    // Get unique ranks, sorted descending
    const uniqueRanks = [...new Set(cards.map(c => c.rank))].sort((a, b) => b - a);

    // Check for A-2-3-4-5 (wheel) - Ace can be low
    if (uniqueRanks.includes(14) && uniqueRanks.includes(2) &&
        uniqueRanks.includes(3) && uniqueRanks.includes(4) && uniqueRanks.includes(5)) {
        const straightCards: Card[] = [];
        for (const rank of [5, 4, 3, 2]) {
            straightCards.push(cards.find(c => c.rank === rank)!);
        }
        straightCards.push(cards.find(c => c.rank === 14)!); // Ace as low
        return straightCards;
    }

    // Check for regular straight
    for (let i = 0; i <= uniqueRanks.length - 5; i++) {
        let isSequence = true;
        for (let j = 0; j < 4; j++) {
            if (uniqueRanks[i + j] - uniqueRanks[i + j + 1] !== 1) {
                isSequence = false;
                break;
            }
        }
        if (isSequence) {
            const straightCards: Card[] = [];
            for (let j = 0; j < 5; j++) {
                straightCards.push(cards.find(c => c.rank === uniqueRanks[i + j])!);
            }
            return straightCards;
        }
    }

    return null;
}

// Check for straight flush
function findStraightFlush(cards: Card[]): Card[] | null {
    const bySuit = countBySuit(cards);

    for (const [, suitCards] of bySuit) {
        if (suitCards.length >= 5) {
            const straight = findStraight(suitCards);
            if (straight) {
                return straight;
            }
        }
    }

    return null;
}

// Main hand evaluation function
export function evaluateHand(allCards: Card[]): HandResult {
    if (allCards.length < 5) {
        throw new Error('Need at least 5 cards to evaluate');
    }

    const byRank = countByRank(allCards);

    // Count pairs, trips, quads
    const pairs: Rank[] = [];
    const trips: Rank[] = [];
    const quads: Rank[] = [];

    for (const [rank, cards] of byRank) {
        if (cards.length === 2) pairs.push(rank);
        else if (cards.length === 3) trips.push(rank);
        else if (cards.length === 4) quads.push(rank);
    }

    // Sort by rank value
    pairs.sort((a, b) => b - a);
    trips.sort((a, b) => b - a);
    quads.sort((a, b) => b - a);

    // Check for Royal Flush
    const straightFlush = findStraightFlush(allCards);
    if (straightFlush && straightFlush[0].rank === 14) {
        return {
            rank: HandRank.ROYAL_FLUSH,
            rankName: 'Royal Flush',
            cards: straightFlush,
            kickers: [14],
            score: calculateScore(HandRank.ROYAL_FLUSH, [14]),
        };
    }

    // Check for Straight Flush
    if (straightFlush) {
        return {
            rank: HandRank.STRAIGHT_FLUSH,
            rankName: 'Straight Flush',
            cards: straightFlush,
            kickers: [straightFlush[0].rank],
            score: calculateScore(HandRank.STRAIGHT_FLUSH, [straightFlush[0].rank]),
        };
    }

    // Check for Four of a Kind
    if (quads.length > 0) {
        const quadCards = byRank.get(quads[0])!;
        const kicker = allCards
            .filter(c => c.rank !== quads[0])
            .sort((a, b) => b.rank - a.rank)[0];
        return {
            rank: HandRank.FOUR_OF_A_KIND,
            rankName: 'Four of a Kind',
            cards: [...quadCards, kicker],
            kickers: [quads[0], kicker.rank],
            score: calculateScore(HandRank.FOUR_OF_A_KIND, [quads[0], kicker.rank]),
        };
    }

    // Check for Full House
    if (trips.length > 0 && (pairs.length > 0 || trips.length > 1)) {
        const tripCards = byRank.get(trips[0])!;
        const pairRank = pairs.length > 0 ? pairs[0] : trips[1];
        const pairCards = byRank.get(pairRank)!.slice(0, 2);
        return {
            rank: HandRank.FULL_HOUSE,
            rankName: 'Full House',
            cards: [...tripCards, ...pairCards],
            kickers: [trips[0], pairRank],
            score: calculateScore(HandRank.FULL_HOUSE, [trips[0], pairRank]),
        };
    }

    // Check for Flush
    const flush = findFlush(allCards);
    if (flush) {
        const kickers = flush.map(c => c.rank).sort((a, b) => b - a);
        return {
            rank: HandRank.FLUSH,
            rankName: 'Flush',
            cards: flush,
            kickers,
            score: calculateScore(HandRank.FLUSH, kickers),
        };
    }

    // Check for Straight
    const straight = findStraight(allCards);
    if (straight) {
        return {
            rank: HandRank.STRAIGHT,
            rankName: 'Straight',
            cards: straight,
            kickers: [straight[0].rank],
            score: calculateScore(HandRank.STRAIGHT, [straight[0].rank]),
        };
    }

    // Check for Three of a Kind
    if (trips.length > 0) {
        const tripCards = byRank.get(trips[0])!;
        const kickers = allCards
            .filter(c => c.rank !== trips[0])
            .sort((a, b) => b.rank - a.rank)
            .slice(0, 2);
        return {
            rank: HandRank.THREE_OF_A_KIND,
            rankName: 'Three of a Kind',
            cards: [...tripCards, ...kickers],
            kickers: [trips[0], ...kickers.map(c => c.rank)],
            score: calculateScore(HandRank.THREE_OF_A_KIND, [trips[0], ...kickers.map(c => c.rank)]),
        };
    }

    // Check for Two Pair
    if (pairs.length >= 2) {
        const pair1 = byRank.get(pairs[0])!;
        const pair2 = byRank.get(pairs[1])!;
        const kicker = allCards
            .filter(c => c.rank !== pairs[0] && c.rank !== pairs[1])
            .sort((a, b) => b.rank - a.rank)[0];
        return {
            rank: HandRank.TWO_PAIR,
            rankName: 'Two Pair',
            cards: [...pair1, ...pair2, kicker],
            kickers: [pairs[0], pairs[1], kicker.rank],
            score: calculateScore(HandRank.TWO_PAIR, [pairs[0], pairs[1], kicker.rank]),
        };
    }

    // Check for One Pair
    if (pairs.length === 1) {
        const pairCards = byRank.get(pairs[0])!;
        const kickers = allCards
            .filter(c => c.rank !== pairs[0])
            .sort((a, b) => b.rank - a.rank)
            .slice(0, 3);
        return {
            rank: HandRank.ONE_PAIR,
            rankName: 'One Pair',
            cards: [...pairCards, ...kickers],
            kickers: [pairs[0], ...kickers.map(c => c.rank)],
            score: calculateScore(HandRank.ONE_PAIR, [pairs[0], ...kickers.map(c => c.rank)]),
        };
    }

    // High Card
    const highCards = allCards
        .sort((a, b) => b.rank - a.rank)
        .slice(0, 5);
    const kickers = highCards.map(c => c.rank);
    return {
        rank: HandRank.HIGH_CARD,
        rankName: 'High Card',
        cards: highCards,
        kickers,
        score: calculateScore(HandRank.HIGH_CARD, kickers),
    };
}

// Compare two hands, returns positive if hand1 wins, negative if hand2 wins, 0 for tie
export function compareHands(hand1: HandResult, hand2: HandResult): number {
    return hand1.score - hand2.score;
}

// Find the best hand from hole cards + community cards
export function findBestHand(holeCards: Card[], communityCards: Card[]): HandResult {
    const allCards = [...holeCards, ...communityCards];

    if (allCards.length < 5) {
        throw new Error('Need at least 5 cards');
    }

    // If exactly 5 or fewer cards, evaluate directly
    if (allCards.length <= 5) {
        return evaluateHand(allCards);
    }

    // Find the best 5-card combination from all cards
    let bestHand: HandResult | null = null;

    // Generate all 5-card combinations
    const combinations = getCombinations(allCards, 5);

    for (const combo of combinations) {
        const hand = evaluateHand(combo);
        if (!bestHand || hand.score > bestHand.score) {
            bestHand = hand;
        }
    }

    return bestHand!;
}

// Generate all k-combinations from an array
function getCombinations<T>(arr: T[], k: number): T[][] {
    const result: T[][] = [];

    function combine(start: number, combo: T[]) {
        if (combo.length === k) {
            result.push([...combo]);
            return;
        }

        for (let i = start; i < arr.length; i++) {
            combo.push(arr[i]);
            combine(i + 1, combo);
            combo.pop();
        }
    }

    combine(0, []);
    return result;
}
