// UNO Card Types
export type UnoColor = 'red' | 'yellow' | 'green' | 'blue' | 'wild';
export type UnoValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 'skip' | 'reverse' | 'draw2' | 'wild' | 'draw4';

export interface UnoCard {
    id: string;
    color: UnoColor;
    value: UnoValue;
}

export interface UnoPlayer {
    id: string;
    username: string;
    hand: UnoCard[];
    saidUno: boolean;
    isOut: boolean;
}

export interface UnoResult {
    playerId: string;
    username: string;
    rank: number;
    handScore: number;
    creditsChange: number;
}

export type UnoPhase = 'waiting' | 'playing' | 'selectingColor' | 'finished';

export interface UnoState {
    roomId: string;
    players: UnoPlayer[];
    currentPlayerIndex: number;
    direction: 1 | -1; // 1 = clockwise, -1 = counter
    drawPile: UnoCard[];
    discardPile: UnoCard[];
    currentColor: UnoColor;
    pendingDraw: number; // stacked +2/+4 count
    phase: UnoPhase;
    winnerId: string | null;
    results: UnoResult[];
    lastPlayerId: string | null;
    config: UnoConfig;
}

export interface UnoConfig {
    stacking: boolean;           // Allow +2 on +2, +4 on +4
    wildDraw4Free: boolean;      // Allow +4 anytime (not just when no matching color)
    forcePlay: boolean;          // Must play drawn card if valid
    drawUntilMatch: boolean;     // Draw until valid card found
    unoPenalty: number;          // Cards to draw for missed UNO call
}

export const DEFAULT_UNO_CONFIG: UnoConfig = {
    stacking: true,
    wildDraw4Free: true,
    forcePlay: true,
    drawUntilMatch: false,
    unoPenalty: 2
};

// Card value for scoring
export function getCardScore(card: UnoCard): number {
    if (typeof card.value === 'number') return card.value;
    if (card.value === 'skip' || card.value === 'reverse' || card.value === 'draw2') return 20;
    if (card.value === 'wild' || card.value === 'draw4') return 50;
    return 0;
}

// Calculate hand score
export function calculateHandScore(hand: UnoCard[]): number {
    return hand.reduce((sum, card) => sum + getCardScore(card), 0);
}

// Check if a card can be played
export function isValidPlay(
    card: UnoCard,
    topCard: UnoCard,
    currentColor: UnoColor,
    pendingDraw: number,
    config: UnoConfig
): boolean {
    // If there's pending draw, only +2/+4 stacking allowed (if enabled)
    if (pendingDraw > 0) {
        if (!config.stacking) return false;

        // Can only stack same type
        if (topCard.value === 'draw2' && card.value === 'draw2') return true;
        if (topCard.value === 'draw4' && card.value === 'draw4') return true;
        return false;
    }

    // Wild cards always playable
    if (card.color === 'wild') return true;

    // Match current color
    if (card.color === currentColor) return true;

    // Match value (number or action)
    if (card.value === topCard.value) return true;

    return false;
}

// Check if +4 is legal (no matching color in hand)
export function isWildDraw4Legal(hand: UnoCard[], currentColor: UnoColor): boolean {
    return !hand.some(c => c.color === currentColor);
}

// Create display name for card
export function getCardDisplayName(card: UnoCard): string {
    const colorNames: Record<UnoColor, string> = {
        red: 'Red', yellow: 'Yellow', green: 'Green', blue: 'Blue', wild: 'Wild'
    };
    const valueNames: Record<string, string> = {
        skip: 'Skip', reverse: 'Reverse', draw2: '+2', wild: 'Wild', draw4: '+4'
    };

    const color = colorNames[card.color];
    const value = typeof card.value === 'number' ? card.value.toString() : valueNames[card.value];

    if (card.color === 'wild') return value;
    return `${color} ${value}`;
}
