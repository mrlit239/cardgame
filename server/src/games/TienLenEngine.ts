import { Card, Suit, createDeck, shuffleDeck } from '../types/card';

export type TienLenVariant = 'south' | 'north';

export interface TienLenConfig {
    variant: TienLenVariant;
}

export interface TienLenPlayer {
    id: string;
    username: string;
    hand: Card[];
    hasPassed: boolean;  // Has passed in current trick
    isOut: boolean;      // Has finished all cards
    hasPlayedAnyCard: boolean;  // For "cóng" detection
}

export type CombinationType =
    | 'single'
    | 'pair'
    | 'triple'
    | 'fourOfAKind'    // Tứ quý (South only)
    | 'sequence'       // Sảnh
    | 'pairSequence';  // Đôi thông (South only)

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
    isFirstTurn: boolean;
    winners: string[];
    phase: 'waiting' | 'playing' | 'ended';
    variant: TienLenVariant;
}

// ============ CARD UTILITIES ============

// Card value: 3=3, 4=4, ..., K=13, A=14, 2=15 (highest)
function getCardValue(card: Card): number {
    if (card.rank === 2) return 15;
    if (card.rank === 14) return 14; // Ace
    return card.rank;
}

// Suit value for Miền Nam: Spades < Clubs < Diamonds < Hearts
// ♠=0, ♣=1, ♦=2, ♥=3
function getSuitValue(suit: Suit): number {
    const suitOrder: Record<Suit, number> = {
        'spades': 0,
        'clubs': 1,
        'diamonds': 2,
        'hearts': 3
    };
    return suitOrder[suit];
}

// Compare two cards - returns positive if a > b, negative if a < b, 0 if equal
// For Miền Nam: compare by value first, then by suit
function compareCards(a: Card, b: Card, useSuit: boolean): number {
    const valueDiff = getCardValue(a) - getCardValue(b);
    if (valueDiff !== 0) return valueDiff;
    if (useSuit) {
        return getSuitValue(a.suit) - getSuitValue(b.suit);
    }
    return 0;
}

// Get color: red (hearts, diamonds) or black (spades, clubs)
function getCardColor(card: Card): 'red' | 'black' {
    return (card.suit === 'hearts' || card.suit === 'diamonds') ? 'red' : 'black';
}

// Sort cards by value then suit
function sortCards(cards: Card[]): Card[] {
    return [...cards].sort((a, b) => {
        const valueDiff = getCardValue(a) - getCardValue(b);
        if (valueDiff !== 0) return valueDiff;
        return a.suit.localeCompare(b.suit);
    });
}

// Check if card is a "2" (Heo)
function isHeo(card: Card): boolean {
    return card.rank === 2;
}

// Get highest card in a set
function getHighestCard(cards: Card[]): Card {
    return cards.reduce((highest, card) =>
        getCardValue(card) > getCardValue(highest) ? card : highest
    );
}

// ============ COMBINATION DETECTION ============

// Check if all cards are same suit
function allSameSuit(cards: Card[]): boolean {
    if (cards.length === 0) return true;
    const suit = cards[0].suit;
    return cards.every(c => c.suit === suit);
}

// Check if all cards are same color (red/black)
function allSameColor(cards: Card[]): boolean {
    if (cards.length === 0) return true;
    const color = getCardColor(cards[0]);
    return cards.every(c => getCardColor(c) === color);
}

// Check if cards form a valid sequence (3+ consecutive, no 2s)
function isSequence(cards: Card[]): boolean {
    if (cards.length < 3) return false;
    if (cards.some(c => c.rank === 2)) return false; // No 2s in sequences

    const sorted = sortCards(cards);
    for (let i = 1; i < sorted.length; i++) {
        if (getCardValue(sorted[i]) - getCardValue(sorted[i - 1]) !== 1) {
            return false;
        }
    }
    return true;
}

// Check if cards form a pair sequence (đôi thông) - consecutive pairs
function isPairSequence(cards: Card[]): number { // Returns number of pairs, 0 if invalid
    if (cards.length < 6 || cards.length % 2 !== 0) return 0;
    if (cards.some(c => c.rank === 2)) return 0; // No 2s

    // Group by rank
    const rankGroups = new Map<number, Card[]>();
    for (const card of cards) {
        const value = getCardValue(card);
        if (!rankGroups.has(value)) rankGroups.set(value, []);
        rankGroups.get(value)!.push(card);
    }

    // Each group must be exactly a pair
    for (const [, group] of rankGroups) {
        if (group.length !== 2) return 0;
    }

    // Check consecutive
    const ranks = Array.from(rankGroups.keys()).sort((a, b) => a - b);
    for (let i = 1; i < ranks.length; i++) {
        if (ranks[i] - ranks[i - 1] !== 1) return 0;
    }

    return ranks.length; // Number of pairs
}

// Detect combination type
export function detectCombination(cards: Card[], variant: TienLenVariant): CombinationType | null {
    if (cards.length === 0) return null;

    if (cards.length === 1) return 'single';

    if (cards.length === 2) {
        if (cards[0].rank === cards[1].rank) {
            // Miền Bắc: pairs must be same color
            if (variant === 'north' && !allSameColor(cards)) return null;
            return 'pair';
        }
        return null;
    }

    if (cards.length === 3) {
        if (cards.every(c => c.rank === cards[0].rank)) return 'triple';
        if (isSequence(cards)) {
            // Miền Bắc: sequences must be same suit
            if (variant === 'north' && !allSameSuit(cards)) return null;
            return 'sequence';
        }
        return null;
    }

    if (cards.length === 4) {
        if (cards.every(c => c.rank === cards[0].rank)) {
            // Tứ quý only exists in South
            return variant === 'south' ? 'fourOfAKind' : null;
        }
        if (isSequence(cards)) {
            if (variant === 'north' && !allSameSuit(cards)) return null;
            return 'sequence';
        }
        return null;
    }

    // 5+ cards
    if (isSequence(cards)) {
        if (variant === 'north' && !allSameSuit(cards)) return null;
        return 'sequence';
    }

    // Đôi thông (South only)
    if (variant === 'south' && isPairSequence(cards) >= 3) {
        return 'pairSequence';
    }

    return null;
}

// ============ BEATING LOGIC ============

// Check if newCards can beat lastPlay
function canBeat(
    newCards: Card[],
    lastPlay: PlayedCombination | null,
    variant: TienLenVariant
): boolean {
    const newType = detectCombination(newCards, variant);
    if (!newType) return false;

    // First play of trick - any valid combination
    if (!lastPlay) return true;

    // ============ MIỀN NAM: Chặt Heo Logic ============
    if (variant === 'south') {
        const lastCards = lastPlay.cards;

        // Chặt single Heo (2)
        if (lastPlay.type === 'single' && isHeo(lastCards[0])) {
            // Tứ quý beats single 2
            if (newType === 'fourOfAKind') return true;
            // 3+ pair sequence beats single 2
            if (newType === 'pairSequence' && isPairSequence(newCards) >= 3) return true;
        }

        // Chặt đôi Heo (pair of 2s)
        if (lastPlay.type === 'pair' && lastCards.every(c => isHeo(c))) {
            // Tứ quý beats pair of 2s
            if (newType === 'fourOfAKind') return true;
            // 4+ pair sequence beats pair of 2s
            if (newType === 'pairSequence' && isPairSequence(newCards) >= 4) return true;
        }

        // Chặt Tứ quý (only 4+ đôi thông can beat)
        if (lastPlay.type === 'fourOfAKind') {
            if (newType === 'pairSequence' && isPairSequence(newCards) >= 4) return true;
            // Higher tứ quý
            if (newType === 'fourOfAKind') {
                return getCardValue(getHighestCard(newCards)) > getCardValue(getHighestCard(lastCards));
            }
            return false;
        }

        // Chặt đôi thông (only higher đôi thông can beat)
        if (lastPlay.type === 'pairSequence') {
            if (newType !== 'pairSequence') return false;
            const lastPairs = isPairSequence(lastCards);
            const newPairs = isPairSequence(newCards);
            if (newPairs !== lastPairs) return false; // Must be same length
            return getCardValue(getHighestCard(newCards)) > getCardValue(getHighestCard(lastCards));
        }
    }

    // ============ STANDARD BEATING RULES ============

    // Must be same type
    if (newType !== lastPlay.type) return false;

    // For sequences, must be same length
    if (newType === 'sequence') {
        if (newCards.length !== lastPlay.cards.length) return false;
    }

    // ============ MIỀN BẮC: Same suit/color requirements ============
    if (variant === 'north') {
        // Singles must be same suit
        if (newType === 'single') {
            if (newCards[0].suit !== lastPlay.cards[0].suit) return false;
        }

        // Pairs must be same color
        if (newType === 'pair') {
            if (getCardColor(newCards[0]) !== getCardColor(lastPlay.cards[0])) return false;
        }

        // Sequences must be same suit (already validated in detectCombination)
    }

    // Compare highest cards - new must be higher
    const newHighest = getHighestCard(newCards);
    const lastHighest = getHighestCard(lastPlay.cards);

    // For Miền Nam: if same rank, use suit to determine winner
    // For Miền Bắc: only compare rank (suit already validated)
    return compareCards(newHighest, lastHighest, variant === 'south') > 0;
}

// ============ GAME ENGINE ============

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
            hand: sortCards(deck.slice(index * 13, (index + 1) * 13)),
            hasPassed: false,
            isOut: false,
            hasPlayedAnyCard: false,
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
            isFirstTurn: true,
            winners: [],
            phase: 'playing',
            variant: config.variant,
        };
    }

    getState(): TienLenState {
        return { ...this.state };
    }

    getStateForPlayer(playerId: string): {
        players: Array<{
            id: string;
            username: string;
            cardCount: number;
            hasPassed: boolean;
            isOut: boolean;
            hand?: Card[];
        }>;
        currentPlayerIndex: number;
        lastPlay: PlayedCombination | null;
        lastPlayerId: string | null;
        isFirstTurn: boolean;
        winners: string[];
        phase: 'waiting' | 'playing' | 'ended';
        variant: TienLenVariant;
        myHand: Card[];
    } {
        const state = this.getState();
        const player = state.players.find(p => p.id === playerId);

        const playersWithHidden = state.players.map(p => ({
            id: p.id,
            username: p.username,
            cardCount: p.hand.length,
            hasPassed: p.hasPassed,
            isOut: p.isOut,
            hand: p.id === playerId ? p.hand : undefined,
        }));

        return {
            currentPlayerIndex: state.currentPlayerIndex,
            lastPlay: state.lastPlay,
            lastPlayerId: state.lastPlayerId,
            isFirstTurn: state.isFirstTurn,
            winners: state.winners,
            phase: state.phase,
            variant: state.variant,
            players: playersWithHidden,
            myHand: player?.hand || []
        };
    }

    // Play cards
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

        // Can't play if already passed this trick
        if (player.hasPassed) {
            return { success: false, message: 'You already passed this trick' };
        }

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

        // Validate combination and beating
        if (!canBeat(cards, this.state.lastPlay, this.config.variant)) {
            return { success: false, message: 'Invalid play - cannot beat previous cards' };
        }

        // Remove cards from hand
        player.hand = player.hand.filter(c => !cardIds.includes(c.id));
        player.hasPlayedAnyCard = true;

        // Record play
        const combType = detectCombination(cards, this.config.variant)!;
        this.state.lastPlay = {
            type: combType,
            cards,
            playerId
        };
        this.state.lastPlayerId = playerId;
        this.state.isFirstTurn = false;

        // Reset all passed flags (new cards on table)
        for (const p of this.state.players) {
            if (p.id !== playerId) {
                p.hasPassed = false;
            }
        }

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

        const player = this.state.players[playerIndex];

        // Can't pass on first turn or when no cards on table
        if (!this.state.lastPlay) {
            return { success: false, message: 'Cannot pass - you must play' };
        }

        // Can't pass if you played last (you won the trick)
        if (this.state.lastPlayerId === playerId) {
            return { success: false, message: 'Cannot pass - you won the trick' };
        }

        player.hasPassed = true;

        // Check if all others have passed -> reset trick
        const activePlayers = this.state.players.filter(p => !p.isOut);
        const allOthersPassed = activePlayers.every(p =>
            p.id === this.state.lastPlayerId || p.hasPassed
        );

        if (allOthersPassed) {
            this.resetTrick();
        } else {
            this.advanceToNextPlayer();
        }

        return { success: true };
    }

    private advanceToNextPlayer(): void {
        const numPlayers = this.state.players.length;
        let next = (this.state.currentPlayerIndex + 1) % numPlayers;
        let attempts = 0;

        // Skip players who are out or have passed
        while (attempts < numPlayers) {
            const nextPlayer = this.state.players[next];

            // Skip if out
            if (nextPlayer.isOut) {
                next = (next + 1) % numPlayers;
                attempts++;
                continue;
            }

            // Skip if passed (unless they played last)
            if (nextPlayer.hasPassed && nextPlayer.id !== this.state.lastPlayerId) {
                next = (next + 1) % numPlayers;
                attempts++;
                continue;
            }

            break;
        }

        this.state.currentPlayerIndex = next;
    }

    private resetTrick(): void {
        // Reset all pass flags
        for (const player of this.state.players) {
            player.hasPassed = false;
        }

        // Clear the table
        this.state.lastPlay = null;

        // Winner of trick starts new trick
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
    }
}
