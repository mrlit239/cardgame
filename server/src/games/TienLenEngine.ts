import { Card, createDeck, shuffleDeck } from '../types/card';

export type TienLenVariant = 'south' | 'north';

export interface TienLenConfig {
    variant: TienLenVariant;
}

export interface TienLenPlayer {
    id: string;
    username: string;
    hand: Card[];
    passed: boolean;
    isOut: boolean;  // Finished all cards
}

export type CombinationType =
    | 'single'
    | 'pair'
    | 'triple'
    | 'fourOfAKind'
    | 'sequence'
    | 'doubleSequence'
    | 'tripleSequence';

export interface PlayedCombination {
    type: CombinationType;
    cards: Card[];
    playerId: string;
}

export interface TienLenState {
    players: TienLenPlayer[];
    currentPlayerIndex: number;
    lastPlay: PlayedCombination | null;
    lastPlayerId: string | null;
    passCount: number;
    isFirstTurn: boolean;
    roundStarter: number;
    winners: string[];  // Order of players who finished
    phase: 'playing' | 'ended';
    variant: TienLenVariant;
}

// Card value for Tiến Lên: 3=3, 4=4, ..., A=14, 2=15 (highest)
function getCardValue(card: Card): number {
    if (card.rank === 2) return 15; // 2 is highest
    if (card.rank === 14) return 14; // Ace
    return card.rank;
}

// Suit ordering: Spades(0) < Clubs(1) < Diamonds(2) < Hearts(3)
function getSuitValue(card: Card): number {
    const suitOrder: Record<string, number> = {
        'spades': 0,
        'clubs': 1,
        'diamonds': 2,
        'hearts': 3
    };
    return suitOrder[card.suit] || 0;
}

// Compare two cards: returns positive if a > b
function compareCards(a: Card, b: Card): number {
    const valueDiff = getCardValue(a) - getCardValue(b);
    if (valueDiff !== 0) return valueDiff;
    return getSuitValue(a) - getSuitValue(b);
}

// Sort cards for display (low to high)
export function sortHand(cards: Card[]): Card[] {
    return [...cards].sort(compareCards);
}

// Get highest card in a set
function getHighestCard(cards: Card[]): Card {
    return cards.reduce((highest, card) =>
        compareCards(card, highest) > 0 ? card : highest
    );
}

// Check if cards form a valid sequence (3+ consecutive, no 2s)
function isValidSequence(cards: Card[]): boolean {
    if (cards.length < 3) return false;

    // No 2s allowed in sequences
    if (cards.some(c => c.rank === 2)) return false;

    const sorted = [...cards].sort((a, b) => getCardValue(a) - getCardValue(b));

    for (let i = 1; i < sorted.length; i++) {
        if (getCardValue(sorted[i]) - getCardValue(sorted[i - 1]) !== 1) {
            return false;
        }
    }
    return true;
}

// Check if cards form a valid double sequence (3+ consecutive pairs)
function isValidDoubleSequence(cards: Card[]): boolean {
    if (cards.length < 6 || cards.length % 2 !== 0) return false;

    // No 2s allowed
    if (cards.some(c => c.rank === 2)) return false;

    // Group by rank
    const rankGroups = new Map<number, Card[]>();
    for (const card of cards) {
        const value = getCardValue(card);
        if (!rankGroups.has(value)) rankGroups.set(value, []);
        rankGroups.get(value)!.push(card);
    }

    // Each group must be a pair
    for (const [, group] of rankGroups) {
        if (group.length !== 2) return false;
    }

    // Check consecutive
    const ranks = Array.from(rankGroups.keys()).sort((a, b) => a - b);
    for (let i = 1; i < ranks.length; i++) {
        if (ranks[i] - ranks[i - 1] !== 1) return false;
    }

    return ranks.length >= 3;
}

// Detect combination type
export function detectCombination(cards: Card[]): CombinationType | null {
    if (cards.length === 0) return null;

    if (cards.length === 1) return 'single';

    if (cards.length === 2) {
        if (cards[0].rank === cards[1].rank) return 'pair';
        return null;
    }

    if (cards.length === 3) {
        if (cards.every(c => c.rank === cards[0].rank)) return 'triple';
        if (isValidSequence(cards)) return 'sequence';
        return null;
    }

    if (cards.length === 4) {
        if (cards.every(c => c.rank === cards[0].rank)) return 'fourOfAKind';
        if (isValidSequence(cards)) return 'sequence';
        return null;
    }

    // 5+ cards
    if (cards.every(c => c.rank === cards[0].rank)) {
        return null; // Can't have 5+ of same rank
    }

    if (isValidSequence(cards)) return 'sequence';
    if (isValidDoubleSequence(cards)) return 'doubleSequence';

    // Check triple sequence
    if (cards.length >= 9 && cards.length % 3 === 0) {
        const rankGroups = new Map<number, Card[]>();
        for (const card of cards) {
            const value = getCardValue(card);
            if (!rankGroups.has(value)) rankGroups.set(value, []);
            rankGroups.get(value)!.push(card);
        }

        const allTriples = Array.from(rankGroups.values()).every(g => g.length === 3);
        if (allTriples) {
            const ranks = Array.from(rankGroups.keys()).sort((a, b) => a - b);
            let consecutive = true;
            for (let i = 1; i < ranks.length; i++) {
                if (ranks[i] - ranks[i - 1] !== 1) consecutive = false;
            }
            if (consecutive && !cards.some(c => c.rank === 2)) {
                return 'tripleSequence';
            }
        }
    }

    return null;
}

// Check if play beats previous play
function canBeat(
    newCards: Card[],
    lastPlay: PlayedCombination | null,
    variant: TienLenVariant
): boolean {
    const newType = detectCombination(newCards);
    if (!newType) return false;

    // First play of round - any valid combination
    if (!lastPlay) return true;

    // Chops/Bombs - special beats
    if (variant === 'south') {
        // Four of a kind beats any single 2
        if (newType === 'fourOfAKind' && lastPlay.type === 'single' && lastPlay.cards[0].rank === 2) {
            return true;
        }

        // Double sequence of 3+ pairs beats single 2
        if (newType === 'doubleSequence' && lastPlay.type === 'single' && lastPlay.cards[0].rank === 2) {
            if (newCards.length >= 6) return true;
        }

        // Double sequence of 4+ pairs beats pair of 2s
        if (newType === 'doubleSequence' && lastPlay.type === 'pair' && lastPlay.cards[0].rank === 2) {
            if (newCards.length >= 8) return true;
        }

        // Four of a kind beats pair of 2s
        if (newType === 'fourOfAKind' && lastPlay.type === 'pair' && lastPlay.cards[0].rank === 2) {
            return true;
        }
    }

    // Must be same type
    if (newType !== lastPlay.type) return false;

    // Must be same length for sequences
    if (newType === 'sequence' || newType === 'doubleSequence' || newType === 'tripleSequence') {
        if (newCards.length !== lastPlay.cards.length) return false;
    }

    // Compare highest cards
    const newHighest = getHighestCard(newCards);
    const lastHighest = getHighestCard(lastPlay.cards);

    return compareCards(newHighest, lastHighest) > 0;
}

export class TienLenEngine {
    private state: TienLenState;
    private config: TienLenConfig;

    constructor(
        playerData: { id: string; username: string }[],
        config: TienLenConfig
    ) {
        this.config = config;

        // Create and shuffle deck
        const deck = shuffleDeck(createDeck());

        // Deal 13 cards to each player
        const players: TienLenPlayer[] = playerData.map((p, index) => ({
            id: p.id,
            username: p.username,
            hand: sortHand(deck.slice(index * 13, (index + 1) * 13)),
            passed: false,
            isOut: false,
        }));

        // Find player with 3♠ to start
        let startingPlayer = 0;
        for (let i = 0; i < players.length; i++) {
            if (players[i].hand.some(c => c.rank === 3 && c.suit === 'spades')) {
                startingPlayer = i;
                break;
            }
        }

        this.state = {
            players,
            currentPlayerIndex: startingPlayer,
            lastPlay: null,
            lastPlayerId: null,
            passCount: 0,
            isFirstTurn: true,
            roundStarter: startingPlayer,
            winners: [],
            phase: 'playing',
            variant: config.variant,
        };
    }

    getState(): TienLenState {
        return { ...this.state };
    }

    getStateForPlayer(playerId: string): Omit<TienLenState, 'players'> & {
        players: Array<Omit<TienLenPlayer, 'hand'> & { cardCount: number; hand?: Card[] }>;
        myHand: Card[];
    } {
        const state = this.getState();
        const player = state.players.find(p => p.id === playerId);

        // For other players, show card count only; for self, show actual hand
        const playersWithHidden = state.players.map(p => ({
            id: p.id,
            username: p.username,
            passed: p.passed,
            isOut: p.isOut,
            cardCount: p.hand.length,
            hand: p.id === playerId ? p.hand : undefined,
        }));

        return {
            currentPlayerIndex: state.currentPlayerIndex,
            lastPlay: state.lastPlay,
            lastPlayerId: state.lastPlayerId,
            passCount: state.passCount,
            isFirstTurn: state.isFirstTurn,
            roundStarter: state.roundStarter,
            winners: state.winners,
            phase: state.phase,
            variant: state.variant,
            players: playersWithHidden,
            myHand: player?.hand || []
        };
    }

    // Validate and play cards
    playCards(playerId: string, cardIds: string[]): { success: boolean; message?: string } {
        if (this.state.phase !== 'playing') {
            return { success: false, message: 'Game is over' };
        }

        const playerIndex = this.state.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) {
            return { success: false, message: 'Player not found' };
        }

        if (playerIndex !== this.state.currentPlayerIndex) {
            return { success: false, message: 'Not your turn' };
        }

        const player = this.state.players[playerIndex];

        // Get cards from hand
        const cards = cardIds.map(id => player.hand.find(c => c.id === id)).filter(Boolean) as Card[];
        if (cards.length !== cardIds.length) {
            return { success: false, message: 'Invalid cards' };
        }

        // First turn must include 3♠
        if (this.state.isFirstTurn) {
            if (!cards.some(c => c.rank === 3 && c.suit === 'spades')) {
                return { success: false, message: 'First play must include 3♠' };
            }
        }

        // Check if valid play
        if (!canBeat(cards, this.state.lastPlay, this.config.variant)) {
            return { success: false, message: 'Invalid play - cannot beat previous cards' };
        }

        // Remove cards from hand
        player.hand = player.hand.filter(c => !cardIds.includes(c.id));

        // Record play
        const combType = detectCombination(cards)!;
        this.state.lastPlay = {
            type: combType,
            cards,
            playerId
        };
        this.state.lastPlayerId = playerId;
        this.state.passCount = 0;
        this.state.isFirstTurn = false;

        // Check if player finished
        if (player.hand.length === 0) {
            player.isOut = true;
            this.state.winners.push(playerId);

            // Check if game over (only 1 player left)
            const remaining = this.state.players.filter(p => !p.isOut);
            if (remaining.length <= 1) {
                if (remaining.length === 1) {
                    this.state.winners.push(remaining[0].id);
                }
                this.state.phase = 'ended';
                return { success: true };
            }
        }

        // Next player
        this.advanceToNextPlayer();

        return { success: true };
    }

    // Pass turn
    pass(playerId: string): { success: boolean; message?: string } {
        if (this.state.phase !== 'playing') {
            return { success: false, message: 'Game is over' };
        }

        const playerIndex = this.state.players.findIndex(p => p.id === playerId);
        if (playerIndex !== this.state.currentPlayerIndex) {
            return { success: false, message: 'Not your turn' };
        }

        // Can't pass on first turn or when starting new round
        if (!this.state.lastPlay) {
            return { success: false, message: 'Cannot pass - you must play' };
        }

        // Can't pass if you played last
        if (this.state.lastPlayerId === playerId) {
            return { success: false, message: 'Cannot pass - you played last' };
        }

        this.state.players[playerIndex].passed = true;
        this.state.passCount++;

        // Check if round ends (everyone passed)
        const activePlayers = this.state.players.filter(p => !p.isOut);
        if (this.state.passCount >= activePlayers.length - 1) {
            // New round - last player who played starts
            this.startNewRound();
        } else {
            this.advanceToNextPlayer();
        }

        return { success: true };
    }

    private advanceToNextPlayer(): void {
        let next = (this.state.currentPlayerIndex + 1) % this.state.players.length;

        // Skip players who are out or passed
        while (
            this.state.players[next].isOut ||
            (this.state.players[next].passed && this.state.lastPlayerId !== this.state.players[next].id)
        ) {
            next = (next + 1) % this.state.players.length;

            // Safety check
            if (next === this.state.currentPlayerIndex) break;
        }

        this.state.currentPlayerIndex = next;
    }

    private startNewRound(): void {
        // Reset passes
        for (const player of this.state.players) {
            player.passed = false;
        }

        // Find last player who played
        const lastPlayerIndex = this.state.players.findIndex(p => p.id === this.state.lastPlayerId);

        if (lastPlayerIndex !== -1 && !this.state.players[lastPlayerIndex].isOut) {
            this.state.currentPlayerIndex = lastPlayerIndex;
        } else {
            // Find next active player
            let next = lastPlayerIndex;
            do {
                next = (next + 1) % this.state.players.length;
            } while (this.state.players[next].isOut);
            this.state.currentPlayerIndex = next;
        }

        this.state.lastPlay = null;
        this.state.passCount = 0;
        this.state.roundStarter = this.state.currentPlayerIndex;
    }

    // Get valid plays for current player (for UI highlighting)
    getValidPlays(playerId: string): string[][] {
        const player = this.state.players.find(p => p.id === playerId);
        if (!player || player.isOut) return [];

        const validPlays: string[][] = [];
        const hand = player.hand;

        // Generate all possible combinations and check if valid
        // This is simplified - a full implementation would be more complex

        // Singles
        for (const card of hand) {
            if (canBeat([card], this.state.lastPlay, this.config.variant)) {
                validPlays.push([card.id]);
            }
        }

        // Pairs
        const rankGroups = new Map<number, Card[]>();
        for (const card of hand) {
            const rank = card.rank;
            if (!rankGroups.has(rank)) rankGroups.set(rank, []);
            rankGroups.get(rank)!.push(card);
        }

        for (const [, cards] of rankGroups) {
            if (cards.length >= 2) {
                // All pairs from this rank
                for (let i = 0; i < cards.length - 1; i++) {
                    for (let j = i + 1; j < cards.length; j++) {
                        const pair = [cards[i], cards[j]];
                        if (canBeat(pair, this.state.lastPlay, this.config.variant)) {
                            validPlays.push([cards[i].id, cards[j].id]);
                        }
                    }
                }
            }
        }

        // Note: Full sequence/triple detection would be more complex
        // This gives basic valid plays

        return validPlays;
    }
}
