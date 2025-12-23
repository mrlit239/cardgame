import {
    UnoCard, UnoColor, UnoValue, UnoPlayer, UnoState, UnoResult,
    UnoConfig, DEFAULT_UNO_CONFIG, isValidPlay, calculateHandScore
} from './types';

// Generate unique card ID
let cardIdCounter = 0;
function generateCardId(): string {
    return `uno_${++cardIdCounter}_${Date.now()}`;
}

// Create a standard 108-card UNO deck
function createDeck(): UnoCard[] {
    const deck: UnoCard[] = [];
    const colors: UnoColor[] = ['red', 'yellow', 'green', 'blue'];

    for (const color of colors) {
        // One 0 per color
        deck.push({ id: generateCardId(), color, value: 0 });

        // Two of each 1-9
        for (let num = 1; num <= 9; num++) {
            deck.push({ id: generateCardId(), color, value: num as UnoValue });
            deck.push({ id: generateCardId(), color, value: num as UnoValue });
        }

        // Two Skip, Reverse, Draw Two per color
        for (let i = 0; i < 2; i++) {
            deck.push({ id: generateCardId(), color, value: 'skip' });
            deck.push({ id: generateCardId(), color, value: 'reverse' });
            deck.push({ id: generateCardId(), color, value: 'draw2' });
        }
    }

    // Four Wild and four Wild Draw Four
    for (let i = 0; i < 4; i++) {
        deck.push({ id: generateCardId(), color: 'wild', value: 'wild' });
        deck.push({ id: generateCardId(), color: 'wild', value: 'draw4' });
    }

    return deck;
}

// Shuffle array in place
function shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

export class UnoGame {
    private state: UnoState;

    constructor(
        roomId: string,
        players: { id: string; username: string }[],
        config: Partial<UnoConfig> = {}
    ) {
        const fullConfig = { ...DEFAULT_UNO_CONFIG, ...config };

        this.state = {
            roomId,
            players: players.map(p => ({
                id: p.id,
                username: p.username,
                hand: [],
                saidUno: false,
                isOut: false
            })),
            currentPlayerIndex: 0,
            direction: 1,
            drawPile: [],
            discardPile: [],
            currentColor: 'red',
            pendingDraw: 0,
            phase: 'waiting',
            winnerId: null,
            results: [],
            lastPlayerId: null,
            config: fullConfig
        };
    }

    // Start the game - deal cards
    startGame(): UnoState {
        const deck = shuffle(createDeck());

        // Deal 7 cards to each player
        for (const player of this.state.players) {
            player.hand = deck.splice(0, 7);
        }

        // Find a valid starting card (must be a number)
        let startCardIndex = deck.findIndex(c => typeof c.value === 'number');
        if (startCardIndex === -1) startCardIndex = 0;

        const startCard = deck.splice(startCardIndex, 1)[0];
        this.state.discardPile = [startCard];
        this.state.currentColor = startCard.color === 'wild' ? 'red' : startCard.color;
        this.state.drawPile = deck;
        this.state.phase = 'playing';
        this.state.currentPlayerIndex = 0;

        console.log(`🎴 UNO game started in room ${this.state.roomId} with ${this.state.players.length} players`);

        return this.getState();
    }

    // Get current player
    getCurrentPlayer(): UnoPlayer | null {
        if (this.state.phase !== 'playing' && this.state.phase !== 'selectingColor') {
            return null;
        }
        return this.state.players[this.state.currentPlayerIndex];
    }

    // Get top card of discard pile
    getTopCard(): UnoCard | null {
        return this.state.discardPile[this.state.discardPile.length - 1] || null;
    }

    // Refill draw pile from discard pile if needed
    private refillDrawPile(): void {
        if (this.state.drawPile.length === 0 && this.state.discardPile.length > 1) {
            const topCard = this.state.discardPile.pop()!;
            this.state.drawPile = shuffle([...this.state.discardPile]);
            this.state.discardPile = [topCard];
            console.log(`♻️ Reshuffled ${this.state.drawPile.length} cards into draw pile`);
        }
    }

    // Draw cards from pile
    private drawCards(count: number): UnoCard[] {
        const cards: UnoCard[] = [];
        for (let i = 0; i < count; i++) {
            this.refillDrawPile();
            if (this.state.drawPile.length > 0) {
                cards.push(this.state.drawPile.pop()!);
            }
        }
        return cards;
    }

    // Check if player can play any card
    hasPlayableCard(playerId: string): boolean {
        const player = this.state.players.find(p => p.id === playerId);
        if (!player) return false;

        const topCard = this.getTopCard();
        if (!topCard) return false;

        return player.hand.some(card =>
            isValidPlay(card, topCard, this.state.currentColor, this.state.pendingDraw, this.state.config)
        );
    }

    // Get valid cards for player
    getPlayableCards(playerId: string): UnoCard[] {
        const player = this.state.players.find(p => p.id === playerId);
        if (!player) return [];

        const topCard = this.getTopCard();
        if (!topCard) return [];

        return player.hand.filter(card =>
            isValidPlay(card, topCard, this.state.currentColor, this.state.pendingDraw, this.state.config)
        );
    }

    // Play a card
    playCard(playerId: string, cardId: string, chosenColor?: UnoColor): {
        success: boolean;
        message?: string;
        needsColorSelect?: boolean;
    } {
        if (this.state.phase !== 'playing') {
            return { success: false, message: 'Game not in playing phase' };
        }

        const currentPlayer = this.getCurrentPlayer();
        if (!currentPlayer || currentPlayer.id !== playerId) {
            return { success: false, message: 'Not your turn' };
        }

        const cardIndex = currentPlayer.hand.findIndex(c => c.id === cardId);
        if (cardIndex === -1) {
            return { success: false, message: 'Card not in hand' };
        }

        const card = currentPlayer.hand[cardIndex];
        const topCard = this.getTopCard();

        if (!topCard || !isValidPlay(card, topCard, this.state.currentColor, this.state.pendingDraw, this.state.config)) {
            return { success: false, message: 'Invalid play' };
        }

        // Remove card from hand
        currentPlayer.hand.splice(cardIndex, 1);
        this.state.discardPile.push(card);
        this.state.lastPlayerId = playerId;

        // Reset UNO flag (must say it again if back to 1 card)
        currentPlayer.saidUno = false;

        // Handle Wild cards - need color selection
        if (card.color === 'wild') {
            if (chosenColor && chosenColor !== 'wild') {
                this.state.currentColor = chosenColor;
            } else {
                this.state.phase = 'selectingColor';
                return { success: true, needsColorSelect: true };
            }
        } else {
            this.state.currentColor = card.color;
        }

        // Apply card effects
        this.applyCardEffect(card);

        // Check for win
        if (currentPlayer.hand.length === 0) {
            this.endGame(playerId);
            return { success: true };
        }

        // Next turn
        this.nextTurn();

        return { success: true };
    }

    // Select color after Wild
    selectColor(playerId: string, color: UnoColor): { success: boolean; message?: string } {
        if (this.state.phase !== 'selectingColor') {
            return { success: false, message: 'Not selecting color' };
        }

        const currentPlayer = this.state.players[this.state.currentPlayerIndex];
        if (currentPlayer.id !== playerId) {
            return { success: false, message: 'Not your turn' };
        }

        if (color === 'wild') {
            return { success: false, message: 'Must choose a color' };
        }

        this.state.currentColor = color;
        this.state.phase = 'playing';

        // Apply Wild +4 effect if that was the card
        const topCard = this.getTopCard();
        if (topCard?.value === 'draw4') {
            this.applyCardEffect(topCard);
        } else if (topCard?.value === 'wild') {
            // Regular wild - just move to next player
            this.nextTurn();
        }

        // Check for win
        const player = this.state.players.find(p => p.id === playerId);
        if (player && player.hand.length === 0) {
            this.endGame(playerId);
        }

        return { success: true };
    }

    // Apply card effect
    private applyCardEffect(card: UnoCard): void {
        switch (card.value) {
            case 'skip':
                // Skip next player
                this.advancePlayer();
                break;

            case 'reverse':
                // Reverse direction
                this.state.direction *= -1;
                // In 2-player game, reverse = skip
                if (this.state.players.length === 2) {
                    this.advancePlayer();
                }
                break;

            case 'draw2':
                if (this.state.config.stacking) {
                    this.state.pendingDraw += 2;
                } else {
                    // Next player draws 2 and loses turn
                    this.advancePlayer();
                    const nextPlayer = this.getCurrentPlayer();
                    if (nextPlayer) {
                        const cards = this.drawCards(2);
                        nextPlayer.hand.push(...cards);
                    }
                }
                break;

            case 'draw4':
                if (this.state.config.stacking) {
                    this.state.pendingDraw += 4;
                } else {
                    // Next player draws 4 and loses turn
                    this.advancePlayer();
                    const nextPlayer = this.getCurrentPlayer();
                    if (nextPlayer) {
                        const cards = this.drawCards(4);
                        nextPlayer.hand.push(...cards);
                    }
                }
                break;
        }
    }

    // Advance to next player
    private advancePlayer(): void {
        const playerCount = this.state.players.length;
        this.state.currentPlayerIndex = (this.state.currentPlayerIndex + this.state.direction + playerCount) % playerCount;
    }

    // Move to next turn
    private nextTurn(): void {
        this.advancePlayer();

        // If stacking is on and there's pending draw, check if next player can stack
        if (this.state.pendingDraw > 0 && !this.state.config.stacking) {
            // Pending draw without stacking - shouldn't happen
            return;
        }

        // If there's pending draw and next player can't stack, they draw
        if (this.state.pendingDraw > 0) {
            const nextPlayer = this.getCurrentPlayer();
            if (nextPlayer && !this.hasPlayableCard(nextPlayer.id)) {
                const cards = this.drawCards(this.state.pendingDraw);
                nextPlayer.hand.push(...cards);
                this.state.pendingDraw = 0;
                this.advancePlayer(); // Skip their turn
            }
        }
    }

    // Draw card action
    drawCard(playerId: string): { success: boolean; message?: string; drawnCard?: UnoCard } {
        if (this.state.phase !== 'playing') {
            return { success: false, message: 'Game not in playing phase' };
        }

        const currentPlayer = this.getCurrentPlayer();
        if (!currentPlayer || currentPlayer.id !== playerId) {
            return { success: false, message: 'Not your turn' };
        }

        // If there's pending draw, must draw all
        if (this.state.pendingDraw > 0) {
            const cards = this.drawCards(this.state.pendingDraw);
            currentPlayer.hand.push(...cards);
            this.state.pendingDraw = 0;
            this.nextTurn();
            return { success: true, message: `Drew ${cards.length} cards` };
        }

        // Draw one card
        const cards = this.drawCards(1);
        if (cards.length === 0) {
            return { success: false, message: 'No cards left to draw' };
        }

        const drawnCard = cards[0];
        currentPlayer.hand.push(drawnCard);

        // If force play is on and card is playable, they must play it
        const topCard = this.getTopCard();
        if (this.state.config.forcePlay && topCard &&
            isValidPlay(drawnCard, topCard, this.state.currentColor, 0, this.state.config)) {
            // Return card info - client must play it
            return { success: true, drawnCard, message: 'Must play drawn card' };
        }

        // Otherwise, lose turn
        this.nextTurn();
        return { success: true, drawnCard };
    }

    // Call UNO
    callUno(playerId: string): { success: boolean; message?: string } {
        const player = this.state.players.find(p => p.id === playerId);
        if (!player) {
            return { success: false, message: 'Player not found' };
        }

        if (player.hand.length === 1) {
            player.saidUno = true;
            return { success: true };
        }

        return { success: false, message: 'Can only call UNO with one card' };
    }

    // Challenge missed UNO call
    challengeUno(challengerId: string, targetId: string): { success: boolean; message?: string; penalty?: number } {
        const target = this.state.players.find(p => p.id === targetId);
        if (!target) {
            return { success: false, message: 'Target not found' };
        }

        // Can only challenge if target has 1 card and didn't say UNO
        if (target.hand.length === 1 && !target.saidUno && target.id === this.state.lastPlayerId) {
            const penaltyCards = this.drawCards(this.state.config.unoPenalty);
            target.hand.push(...penaltyCards);
            return { success: true, penalty: penaltyCards.length, message: `${target.username} forgot to say UNO!` };
        }

        return { success: false, message: 'Invalid challenge' };
    }

    // End game
    private endGame(winnerId: string): void {
        this.state.phase = 'finished';
        this.state.winnerId = winnerId;

        // Calculate scores and credits
        const winner = this.state.players.find(p => p.id === winnerId);
        let totalScore = 0;

        const results: UnoResult[] = [];

        for (const player of this.state.players) {
            const handScore = calculateHandScore(player.hand);
            totalScore += handScore;

            results.push({
                playerId: player.id,
                username: player.username,
                rank: player.id === winnerId ? 1 : 2,
                handScore,
                creditsChange: 0 // Will be calculated
            });
        }

        // Winner gets total score as credits
        // Losers lose based on their hand score
        for (const result of results) {
            if (result.playerId === winnerId) {
                result.creditsChange = Math.floor(totalScore / 10); // Scale down
            } else {
                result.creditsChange = -Math.floor(result.handScore / 10);
            }
        }

        // Sort by rank
        results.sort((a, b) => a.rank - b.rank);
        this.state.results = results;

        console.log(`🏆 UNO game ended! Winner: ${winner?.username}`);
    }

    // Get state for a specific player (hide other hands)
    getStateForPlayer(playerId: string): UnoState {
        const state = { ...this.state };
        state.players = state.players.map(p => ({
            ...p,
            hand: p.id === playerId ? p.hand : p.hand.map(() => ({ id: '', color: 'wild' as UnoColor, value: 0 as UnoValue }))
        }));
        return state;
    }

    // Get full state (for server)
    getState(): UnoState {
        return { ...this.state };
    }

    // Get results
    getResults(): UnoResult[] {
        return this.state.results;
    }

    // Check if game is finished
    isFinished(): boolean {
        return this.state.phase === 'finished';
    }
}
