import { Card, Suit, createDeck, shuffleDeck } from '../types/card';

export interface DurakConfig {
    deckSize: 52 | 36; // 52 standard, 36 removes 2-5
    handSize: 6;
}

export interface DurakPlayer {
    id: string;
    username: string;
    hand: Card[];
    isOut: boolean; // Has finished (won)
}

export interface TableBout {
    attackCard: Card;
    defenseCard?: Card; // undefined if not yet defended
}

export interface DurakState {
    players: DurakPlayer[];
    deck: Card[];
    trumpCard: Card | null; // The revealed trump card (under deck)
    trumpSuit: Suit;
    table: TableBout[]; // Current bouts on table
    discardPile: Card[];
    attackerIndex: number;
    defenderIndex: number;
    currentActorIndex: number; // Who is currently acting (attacker adding, or defender defending)
    phase: 'attacking' | 'defending' | 'ended';
    winners: string[]; // Players who have finished (in order)
    attackersDone: Set<string>; // Attackers who have passed on adding more
    lastActionBy: string | null;
}

// Get card value for comparison (2=2, ..., 10=10, J=11, Q=12, K=13, A=14)
function getCardValue(card: Card): number {
    return card.rank;
}

// Check if defenseCard can beat attackCard given trumpSuit
function canBeat(attackCard: Card, defenseCard: Card, trumpSuit: Suit): boolean {
    const attackIsTrump = attackCard.suit === trumpSuit;
    const defenseIsTrump = defenseCard.suit === trumpSuit;

    // Trump beats non-trump
    if (defenseIsTrump && !attackIsTrump) {
        return true;
    }

    // Non-trump cannot beat trump
    if (!defenseIsTrump && attackIsTrump) {
        return false;
    }

    // Same suit category: must be same suit and higher rank
    if (attackCard.suit === defenseCard.suit) {
        return getCardValue(defenseCard) > getCardValue(attackCard);
    }

    // Different non-trump suits: cannot beat
    return false;
}

// Check if a card can be added to the attack (must match a rank on the table)
function canAddAttack(card: Card, table: TableBout[], defenderHandSize: number, maxAttacks: number): boolean {
    // Cannot exceed max attacks (usually 6 or defender's hand size)
    if (table.length >= maxAttacks || table.length >= defenderHandSize) {
        return false;
    }

    // First attack - any card is valid
    if (table.length === 0) {
        return true;
    }

    // Must match a rank already on table
    const ranksOnTable = new Set<number>();
    for (const bout of table) {
        ranksOnTable.add(bout.attackCard.rank);
        if (bout.defenseCard) {
            ranksOnTable.add(bout.defenseCard.rank);
        }
    }

    return ranksOnTable.has(card.rank);
}

// Sort cards for display: by suit then by rank
function sortHand(cards: Card[]): Card[] {
    const suitOrder: Record<Suit, number> = {
        'spades': 0,
        'clubs': 1,
        'diamonds': 2,
        'hearts': 3
    };

    return [...cards].sort((a, b) => {
        if (a.suit !== b.suit) {
            return suitOrder[a.suit] - suitOrder[b.suit];
        }
        return getCardValue(a) - getCardValue(b);
    });
}

export class DurakEngine {
    private state: DurakState;
    private config: DurakConfig;

    constructor(
        playerData: { id: string; username: string }[],
        config: Partial<DurakConfig> = {}
    ) {
        this.config = {
            deckSize: config.deckSize || 52,
            handSize: config.handSize || 6
        };

        // Create and shuffle deck
        let deck = createDeck();

        // Remove low cards for 36-card variant
        if (this.config.deckSize === 36) {
            deck = deck.filter(c => c.rank >= 6); // Remove 2-5
        }

        deck = shuffleDeck(deck);

        // Create players
        const players: DurakPlayer[] = playerData.map(p => ({
            id: p.id,
            username: p.username,
            hand: [],
            isOut: false
        }));

        // Deal cards
        for (let i = 0; i < this.config.handSize; i++) {
            for (const player of players) {
                const card = deck.pop();
                if (card) {
                    player.hand.push(card);
                }
            }
        }

        // Sort hands
        for (const player of players) {
            player.hand = sortHand(player.hand);
        }

        // Reveal trump card (last card of deck, placed under)
        const trumpCard = deck.shift()!; // Take from top, conceptually "under" deck
        deck.push(trumpCard); // Put it back at the end (it will be drawn last)

        const trumpSuit = trumpCard.suit;

        // Find first attacker: player with lowest trump
        let attackerIndex = 0;
        let lowestTrumpValue = Infinity;

        for (let i = 0; i < players.length; i++) {
            for (const card of players[i].hand) {
                if (card.suit === trumpSuit && getCardValue(card) < lowestTrumpValue) {
                    lowestTrumpValue = getCardValue(card);
                    attackerIndex = i;
                }
            }
        }

        const defenderIndex = (attackerIndex + 1) % players.length;

        this.state = {
            players,
            deck,
            trumpCard,
            trumpSuit,
            table: [],
            discardPile: [],
            attackerIndex,
            defenderIndex,
            currentActorIndex: attackerIndex,
            phase: 'attacking',
            winners: [],
            attackersDone: new Set(),
            lastActionBy: null
        };
    }

    getState(): DurakState {
        return { ...this.state, attackersDone: new Set(this.state.attackersDone) };
    }

    // Get state for a specific player (hide other hands)
    getStateForPlayer(playerId: string): DurakState & { myHand: Card[] } {
        const player = this.state.players.find(p => p.id === playerId);

        const playersWithHidden = this.state.players.map(p => ({
            ...p,
            hand: p.id === playerId ? p.hand : [], // Hide other hands
            cardCount: p.hand.length
        }));

        return {
            ...this.state,
            players: playersWithHidden as unknown as DurakPlayer[],
            attackersDone: new Set(this.state.attackersDone),
            myHand: player?.hand || []
        };
    }

    // Primary attacker starts an attack
    attack(playerId: string, cardIds: string[]): { success: boolean; message?: string } {
        if (this.state.phase !== 'attacking') {
            return { success: false, message: 'Not in attacking phase' };
        }

        const player = this.state.players.find(p => p.id === playerId);
        if (!player) {
            return { success: false, message: 'Player not found' };
        }

        // Only attackers (not defender) can attack
        if (playerId === this.state.players[this.state.defenderIndex].id) {
            return { success: false, message: 'Defender cannot attack' };
        }

        // Check if this player is allowed to add attacks
        const attackerPlayer = this.state.players[this.state.attackerIndex];
        const isMainAttacker = playerId === attackerPlayer.id;

        // If not main attacker, table must have cards (podkidnoy)
        if (!isMainAttacker && this.state.table.length === 0) {
            return { success: false, message: 'Only main attacker can start' };
        }

        // Check if attacker has already passed
        if (this.state.attackersDone.has(playerId)) {
            return { success: false, message: 'You have already passed' };
        }

        const defender = this.state.players[this.state.defenderIndex];
        const maxAttacks = Math.min(6, defender.hand.length);

        // Get cards from hand
        const cards: Card[] = [];
        for (const cardId of cardIds) {
            const card = player.hand.find(c => c.id === cardId);
            if (!card) {
                return { success: false, message: 'Card not in hand' };
            }
            cards.push(card);
        }

        // Validate each card can be added
        for (const card of cards) {
            // Check current table + already added cards
            const tempTable = [...this.state.table, ...cards.filter(c => c !== card).map(c => ({ attackCard: c }))];
            if (!canAddAttack(card, this.state.table, defender.hand.length, maxAttacks)) {
                return { success: false, message: `Cannot add ${card.rank} - rank not on table or limit reached` };
            }
        }

        // Check total doesn't exceed limit
        if (this.state.table.length + cards.length > maxAttacks) {
            return { success: false, message: `Cannot add ${cards.length} cards - would exceed limit of ${maxAttacks}` };
        }

        // Add cards to table
        for (const card of cards) {
            this.state.table.push({ attackCard: card });
            player.hand = player.hand.filter(c => c.id !== card.id);
        }

        this.state.lastActionBy = playerId;
        this.state.phase = 'defending';
        this.state.currentActorIndex = this.state.defenderIndex;

        return { success: true };
    }

    // Defender defends a specific attack card
    defend(playerId: string, attackCardId: string, defenseCardId: string): { success: boolean; message?: string } {
        if (this.state.phase !== 'defending') {
            return { success: false, message: 'Not in defending phase' };
        }

        const defender = this.state.players[this.state.defenderIndex];
        if (playerId !== defender.id) {
            return { success: false, message: 'Not your turn to defend' };
        }

        // Find the attack card on table
        const bout = this.state.table.find(b => b.attackCard.id === attackCardId);
        if (!bout) {
            return { success: false, message: 'Attack card not found on table' };
        }

        if (bout.defenseCard) {
            return { success: false, message: 'Already defended' };
        }

        // Find defense card in hand
        const defenseCard = defender.hand.find(c => c.id === defenseCardId);
        if (!defenseCard) {
            return { success: false, message: 'Defense card not in hand' };
        }

        // Check if defense is valid
        if (!canBeat(bout.attackCard, defenseCard, this.state.trumpSuit)) {
            return { success: false, message: 'Card cannot beat the attack' };
        }

        // Place defense
        bout.defenseCard = defenseCard;
        defender.hand = defender.hand.filter(c => c.id !== defenseCardId);
        this.state.lastActionBy = playerId;

        // Check if all attacks are defended
        const allDefended = this.state.table.every(b => b.defenseCard);

        if (allDefended) {
            // Attackers can add more cards
            this.state.phase = 'attacking';
            this.state.currentActorIndex = this.state.attackerIndex;
        }

        return { success: true };
    }

    // Defender picks up all cards
    pickUp(playerId: string): { success: boolean; message?: string } {
        if (this.state.phase !== 'defending' && this.state.phase !== 'attacking') {
            return { success: false, message: 'Cannot pick up now' };
        }

        const defender = this.state.players[this.state.defenderIndex];
        if (playerId !== defender.id) {
            return { success: false, message: 'Only defender can pick up' };
        }

        // Collect all cards from table
        for (const bout of this.state.table) {
            defender.hand.push(bout.attackCard);
            if (bout.defenseCard) {
                defender.hand.push(bout.defenseCard);
            }
        }

        defender.hand = sortHand(defender.hand);
        this.state.table = [];
        this.state.lastActionBy = playerId;

        // Refill hands (attacker first, skip defender)
        this.refillHands(true);

        // Defender loses turn - next player attacks
        this.advanceTurnAfterPickUp();

        return { success: true };
    }

    // Attacker signals they're done adding cards
    skipAttack(playerId: string): { success: boolean; message?: string } {
        if (this.state.phase !== 'attacking') {
            return { success: false, message: 'Not in attacking phase' };
        }

        const defender = this.state.players[this.state.defenderIndex];
        if (playerId === defender.id) {
            return { success: false, message: 'Defender cannot skip attack' };
        }

        this.state.attackersDone.add(playerId);
        this.state.lastActionBy = playerId;

        // Check if all potential attackers are done
        const allAttackersDone = this.checkAllAttackersDone();

        if (allAttackersDone) {
            // Defense successful - discard all cards
            this.endSuccessfulDefense();
        }

        return { success: true };
    }

    // Check if all attackers have passed
    private checkAllAttackersDone(): boolean {
        for (let i = 0; i < this.state.players.length; i++) {
            if (i === this.state.defenderIndex) continue;

            const player = this.state.players[i];
            if (player.isOut) continue;
            if (player.hand.length === 0) continue;

            if (!this.state.attackersDone.has(player.id)) {
                return false;
            }
        }
        return true;
    }

    // Successful defense - discard and advance
    private endSuccessfulDefense(): void {
        // Move all cards to discard
        for (const bout of this.state.table) {
            this.state.discardPile.push(bout.attackCard);
            if (bout.defenseCard) {
                this.state.discardPile.push(bout.defenseCard);
            }
        }
        this.state.table = [];

        // Refill hands (attacker first, then others, then defender)
        this.refillHands(false);

        // Advance turn - defender becomes attacker
        this.advanceTurnAfterSuccess();
    }

    // Refill hands from deck
    private refillHands(defenderPickedUp: boolean): void {
        const order: number[] = [];

        // Start with attacker
        order.push(this.state.attackerIndex);

        // Then others (excluding defender for now)
        for (let i = 1; i < this.state.players.length; i++) {
            const idx = (this.state.attackerIndex + i) % this.state.players.length;
            if (idx !== this.state.defenderIndex) {
                order.push(idx);
            }
        }

        // Defender last (or skip if picked up in some variants)
        if (!defenderPickedUp) {
            order.push(this.state.defenderIndex);
        } else {
            // Defender still refills after picking up
            order.push(this.state.defenderIndex);
        }

        for (const playerIndex of order) {
            const player = this.state.players[playerIndex];
            while (player.hand.length < this.config.handSize && this.state.deck.length > 0) {
                const card = this.state.deck.pop()!;
                player.hand.push(card);
            }
            player.hand = sortHand(player.hand);
        }

        // Check for winners (empty hand after refill when deck is empty)
        this.checkWinners();
    }

    // Check if any players have won
    private checkWinners(): void {
        for (const player of this.state.players) {
            if (!player.isOut && player.hand.length === 0 && this.state.deck.length === 0) {
                player.isOut = true;
                this.state.winners.push(player.id);
            }
        }

        // Check if game is over (only one player left with cards)
        const playersWithCards = this.state.players.filter(p => !p.isOut);
        if (playersWithCards.length <= 1) {
            this.state.phase = 'ended';
            // The remaining player is the durak (loser)
            if (playersWithCards.length === 1) {
                // Don't add durak to winners - they lost!
            }
        }
    }

    // Advance turn after defender picks up
    private advanceTurnAfterPickUp(): void {
        // Find next attacker (skip defender, skip players who are out)
        let nextAttacker = (this.state.defenderIndex + 1) % this.state.players.length;
        while (this.state.players[nextAttacker].isOut) {
            nextAttacker = (nextAttacker + 1) % this.state.players.length;
        }

        let nextDefender = (nextAttacker + 1) % this.state.players.length;
        while (this.state.players[nextDefender].isOut) {
            nextDefender = (nextDefender + 1) % this.state.players.length;
        }

        this.state.attackerIndex = nextAttacker;
        this.state.defenderIndex = nextDefender;
        this.state.currentActorIndex = nextAttacker;
        this.state.phase = 'attacking';
        this.state.attackersDone = new Set();
    }

    // Advance turn after successful defense
    private advanceTurnAfterSuccess(): void {
        // Defender becomes attacker
        let nextAttacker = this.state.defenderIndex;
        while (this.state.players[nextAttacker].isOut) {
            nextAttacker = (nextAttacker + 1) % this.state.players.length;
        }

        let nextDefender = (nextAttacker + 1) % this.state.players.length;
        while (this.state.players[nextDefender].isOut) {
            nextDefender = (nextDefender + 1) % this.state.players.length;
        }

        // Make sure attacker and defender are different
        if (nextAttacker === nextDefender) {
            // Only one active player left
            this.state.phase = 'ended';
            return;
        }

        this.state.attackerIndex = nextAttacker;
        this.state.defenderIndex = nextDefender;
        this.state.currentActorIndex = nextAttacker;
        this.state.phase = 'attacking';
        this.state.attackersDone = new Set();
    }

    // Get valid plays for a player
    getValidPlays(playerId: string): { canAttack: Card[]; canDefend: Map<string, Card[]> } {
        const player = this.state.players.find(p => p.id === playerId);
        if (!player) return { canAttack: [], canDefend: new Map() };

        const result: { canAttack: Card[]; canDefend: Map<string, Card[]> } = {
            canAttack: [],
            canDefend: new Map()
        };

        const defender = this.state.players[this.state.defenderIndex];
        const maxAttacks = Math.min(6, defender.hand.length);

        // Check attack options
        if (playerId !== defender.id && !this.state.attackersDone.has(playerId)) {
            for (const card of player.hand) {
                if (canAddAttack(card, this.state.table, defender.hand.length, maxAttacks)) {
                    result.canAttack.push(card);
                }
            }
        }

        // Check defense options (only for defender)
        if (playerId === defender.id) {
            for (const bout of this.state.table) {
                if (!bout.defenseCard) {
                    const validDefenses: Card[] = [];
                    for (const card of player.hand) {
                        if (canBeat(bout.attackCard, card, this.state.trumpSuit)) {
                            validDefenses.push(card);
                        }
                    }
                    result.canDefend.set(bout.attackCard.id, validDefenses);
                }
            }
        }

        return result;
    }
}
