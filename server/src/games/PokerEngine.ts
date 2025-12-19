// Texas Hold'em Poker Game Engine

import { Card, createDeck, shuffleDeck } from '../types/card';
import { evaluateHand, findBestHand, HandResult, compareHands } from './PokerHandEvaluator';

export type PokerPhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'ended';
export type PokerAction = 'fold' | 'check' | 'call' | 'raise' | 'allIn';

export interface PokerPlayer {
    id: string;
    username: string;
    chips: number;
    currentBet: number;
    holeCards: Card[];
    folded: boolean;
    allIn: boolean;
    hasActed: boolean;
    isConnected: boolean;
    handResult?: HandResult;
}

export interface PokerState {
    phase: PokerPhase;
    players: PokerPlayer[];
    communityCards: Card[];
    pot: number;
    currentBet: number;
    currentPlayerIndex: number;
    dealerIndex: number;
    smallBlind: number;
    bigBlind: number;
    minRaise: number;
    winners: string[];
    lastAction?: { playerId: string; action: PokerAction; amount?: number };
}

export interface PokerConfig {
    smallBlind: number;
    bigBlind: number;
    startingChips: number;
}

export class PokerEngine {
    private deck: Card[];
    private communityCards: Card[];
    private players: PokerPlayer[];
    private phase: PokerPhase;
    private pot: number;
    private currentBet: number;
    private currentPlayerIndex: number;
    private dealerIndex: number;
    private smallBlind: number;
    private bigBlind: number;
    private minRaise: number;
    private winners: string[];
    private lastAction?: { playerId: string; action: PokerAction; amount?: number };
    private actionsThisRound: number;

    constructor(
        playerData: { id: string; username: string; chips: number }[],
        config: PokerConfig
    ) {
        if (playerData.length < 2 || playerData.length > 6) {
            throw new Error('Poker requires 2-6 players');
        }

        this.players = playerData.map(p => ({
            id: p.id,
            username: p.username,
            chips: p.chips,
            currentBet: 0,
            holeCards: [],
            folded: false,
            allIn: false,
            hasActed: false,
            isConnected: true,
        }));

        this.deck = [];
        this.communityCards = [];
        this.phase = 'waiting';
        this.pot = 0;
        this.currentBet = 0;
        this.currentPlayerIndex = 0;
        this.dealerIndex = 0;
        this.smallBlind = config.smallBlind;
        this.bigBlind = config.bigBlind;
        this.minRaise = config.bigBlind;
        this.winners = [];
        this.actionsThisRound = 0;
    }

    // Start a new hand
    startHand(): void {
        // Reset for new hand
        this.deck = shuffleDeck(createDeck());
        this.communityCards = [];
        this.pot = 0;
        this.currentBet = 0;
        this.winners = [];
        this.lastAction = undefined;
        this.actionsThisRound = 0;

        // Reset player states
        for (const player of this.players) {
            player.holeCards = [];
            player.currentBet = 0;
            player.folded = false;
            player.allIn = false;
            player.hasActed = false;
            player.handResult = undefined;
        }

        // Remove players with no chips
        this.players = this.players.filter(p => p.chips > 0);

        if (this.players.length < 2) {
            this.phase = 'ended';
            return;
        }

        // Move dealer button
        this.dealerIndex = (this.dealerIndex + 1) % this.players.length;

        // Deal hole cards
        for (const player of this.players) {
            player.holeCards = [this.deck.pop()!, this.deck.pop()!];
        }

        // Post blinds
        this.postBlinds();

        // Start preflop betting
        this.phase = 'preflop';
    }

    private postBlinds(): void {
        const sbIndex = (this.dealerIndex + 1) % this.players.length;
        const bbIndex = (this.dealerIndex + 2) % this.players.length;

        // Small blind
        const sbPlayer = this.players[sbIndex];
        const sbAmount = Math.min(this.smallBlind, sbPlayer.chips);
        sbPlayer.chips -= sbAmount;
        sbPlayer.currentBet = sbAmount;
        this.pot += sbAmount;
        if (sbPlayer.chips === 0) sbPlayer.allIn = true;

        // Big blind
        const bbPlayer = this.players[bbIndex];
        const bbAmount = Math.min(this.bigBlind, bbPlayer.chips);
        bbPlayer.chips -= bbAmount;
        bbPlayer.currentBet = bbAmount;
        this.pot += bbAmount;
        if (bbPlayer.chips === 0) bbPlayer.allIn = true;

        this.currentBet = this.bigBlind;
        this.minRaise = this.bigBlind;

        // Action starts left of big blind (or small blind heads up)
        this.currentPlayerIndex = (bbIndex + 1) % this.players.length;
    }

    // Get available actions for current player
    getAvailableActions(): { action: PokerAction; minAmount?: number; maxAmount?: number }[] {
        const player = this.getCurrentPlayer();
        if (!player || player.folded || player.allIn) return [];

        const actions: { action: PokerAction; minAmount?: number; maxAmount?: number }[] = [];
        const toCall = this.currentBet - player.currentBet;

        // Can always fold
        actions.push({ action: 'fold' });

        // Check if can check (no bet to match)
        if (toCall <= 0) {
            actions.push({ action: 'check' });
        }

        // Call if there's a bet to match
        if (toCall > 0 && player.chips >= toCall) {
            actions.push({ action: 'call' });
        }

        // Raise if has enough chips
        const minRaiseAmount = this.currentBet + this.minRaise;
        if (player.chips > toCall && player.chips + player.currentBet > minRaiseAmount) {
            actions.push({
                action: 'raise',
                minAmount: minRaiseAmount,
                maxAmount: player.chips + player.currentBet,
            });
        }

        // All-in is always available
        if (player.chips > 0) {
            actions.push({ action: 'allIn' });
        }

        return actions;
    }

    // Execute player action
    doAction(playerId: string, action: PokerAction, raiseAmount?: number): { success: boolean; message?: string } {
        const player = this.getCurrentPlayer();

        if (!player || player.id !== playerId) {
            return { success: false, message: 'Not your turn' };
        }

        if (player.folded || player.allIn) {
            return { success: false, message: 'Cannot act' };
        }

        const toCall = this.currentBet - player.currentBet;

        switch (action) {
            case 'fold':
                player.folded = true;
                break;

            case 'check':
                if (toCall > 0) {
                    return { success: false, message: 'Cannot check, must call or fold' };
                }
                break;

            case 'call':
                if (toCall <= 0) {
                    return { success: false, message: 'Nothing to call' };
                }
                const callAmount = Math.min(toCall, player.chips);
                player.chips -= callAmount;
                player.currentBet += callAmount;
                this.pot += callAmount;
                if (player.chips === 0) player.allIn = true;
                break;

            case 'raise':
                if (!raiseAmount || raiseAmount < this.currentBet + this.minRaise) {
                    return { success: false, message: `Minimum raise is ${this.currentBet + this.minRaise}` };
                }
                const raiseToAdd = raiseAmount - player.currentBet;
                if (raiseToAdd > player.chips) {
                    return { success: false, message: 'Not enough chips' };
                }
                this.minRaise = raiseAmount - this.currentBet;
                this.currentBet = raiseAmount;
                player.chips -= raiseToAdd;
                player.currentBet = raiseAmount;
                this.pot += raiseToAdd;
                if (player.chips === 0) player.allIn = true;
                // Reset hasActed for all other players
                for (const p of this.players) {
                    if (p.id !== playerId && !p.folded && !p.allIn) {
                        p.hasActed = false;
                    }
                }
                break;

            case 'allIn':
                const allInAmount = player.chips;
                player.currentBet += allInAmount;
                this.pot += allInAmount;
                player.chips = 0;
                player.allIn = true;
                if (player.currentBet > this.currentBet) {
                    this.minRaise = player.currentBet - this.currentBet;
                    this.currentBet = player.currentBet;
                    // Reset hasActed for all other players
                    for (const p of this.players) {
                        if (p.id !== playerId && !p.folded && !p.allIn) {
                            p.hasActed = false;
                        }
                    }
                }
                break;
        }

        player.hasActed = true;
        this.lastAction = { playerId, action, amount: raiseAmount };
        this.actionsThisRound++;

        // Check if hand is over (only one player left)
        const activePlayers = this.players.filter(p => !p.folded);
        if (activePlayers.length === 1) {
            this.endHand([activePlayers[0].id]);
            return { success: true };
        }

        // Check if betting round is complete
        if (this.isBettingRoundComplete()) {
            this.advancePhase();
        } else {
            this.moveToNextPlayer();
        }

        return { success: true };
    }

    private isBettingRoundComplete(): boolean {
        const activePlayers = this.players.filter(p => !p.folded && !p.allIn);

        if (activePlayers.length === 0) {
            return true;
        }

        // All active players must have acted and matched the current bet
        for (const player of activePlayers) {
            if (!player.hasActed || player.currentBet < this.currentBet) {
                return false;
            }
        }

        return true;
    }

    private moveToNextPlayer(): void {
        let attempts = 0;
        do {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
            attempts++;
        } while (
            attempts < this.players.length &&
            (this.players[this.currentPlayerIndex].folded ||
                this.players[this.currentPlayerIndex].allIn)
        );
    }

    private advancePhase(): void {
        // Reset betting for new round
        for (const player of this.players) {
            player.currentBet = 0;
            player.hasActed = false;
        }
        this.currentBet = 0;
        this.minRaise = this.bigBlind;
        this.actionsThisRound = 0;

        // Set action to first active player after dealer
        this.currentPlayerIndex = (this.dealerIndex + 1) % this.players.length;
        while (this.players[this.currentPlayerIndex].folded || this.players[this.currentPlayerIndex].allIn) {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        }

        // Check if only one non-folded player
        const activePlayers = this.players.filter(p => !p.folded);
        if (activePlayers.length === 1) {
            this.endHand([activePlayers[0].id]);
            return;
        }

        // Check if all remaining players are all-in
        const canActPlayers = this.players.filter(p => !p.folded && !p.allIn);
        if (canActPlayers.length <= 1) {
            // Deal remaining community cards and go to showdown
            this.dealRemainingCards();
            this.goToShowdown();
            return;
        }

        switch (this.phase) {
            case 'preflop':
                this.phase = 'flop';
                this.communityCards.push(this.deck.pop()!, this.deck.pop()!, this.deck.pop()!);
                break;
            case 'flop':
                this.phase = 'turn';
                this.communityCards.push(this.deck.pop()!);
                break;
            case 'turn':
                this.phase = 'river';
                this.communityCards.push(this.deck.pop()!);
                break;
            case 'river':
                this.goToShowdown();
                break;
        }
    }

    private dealRemainingCards(): void {
        while (this.communityCards.length < 5) {
            this.communityCards.push(this.deck.pop()!);
        }
    }

    private goToShowdown(): void {
        this.phase = 'showdown';

        // Evaluate all hands
        const activePlayers = this.players.filter(p => !p.folded);

        for (const player of activePlayers) {
            player.handResult = findBestHand(player.holeCards, this.communityCards);
        }

        // Find winner(s)
        let bestScore = -1;
        const winnerIds: string[] = [];

        for (const player of activePlayers) {
            if (player.handResult!.score > bestScore) {
                bestScore = player.handResult!.score;
                winnerIds.length = 0;
                winnerIds.push(player.id);
            } else if (player.handResult!.score === bestScore) {
                winnerIds.push(player.id);
            }
        }

        this.endHand(winnerIds);
    }

    private endHand(winnerIds: string[]): void {
        this.phase = 'ended';
        this.winners = winnerIds;

        // Distribute pot
        const winAmount = Math.floor(this.pot / winnerIds.length);
        for (const winnerId of winnerIds) {
            const winner = this.players.find(p => p.id === winnerId);
            if (winner) {
                winner.chips += winAmount;
            }
        }

        // Handle remainder
        const remainder = this.pot - (winAmount * winnerIds.length);
        if (remainder > 0 && winnerIds.length > 0) {
            const firstWinner = this.players.find(p => p.id === winnerIds[0]);
            if (firstWinner) {
                firstWinner.chips += remainder;
            }
        }
    }

    // Get current player
    getCurrentPlayer(): PokerPlayer | null {
        if (this.phase === 'waiting' || this.phase === 'showdown' || this.phase === 'ended') {
            return null;
        }
        return this.players[this.currentPlayerIndex] || null;
    }

    // Get game state for a specific player (hide opponents' hole cards)
    getStateForPlayer(playerId: string): PokerState {
        return {
            phase: this.phase,
            players: this.players.map(p => ({
                ...p,
                holeCards: (p.id === playerId || this.phase === 'showdown' || this.phase === 'ended')
                    ? p.holeCards
                    : p.holeCards.map(() => ({ id: 'hidden', suit: 'hearts', rank: 2 } as Card)),
            })),
            communityCards: this.communityCards,
            pot: this.pot,
            currentBet: this.currentBet,
            currentPlayerIndex: this.currentPlayerIndex,
            dealerIndex: this.dealerIndex,
            smallBlind: this.smallBlind,
            bigBlind: this.bigBlind,
            minRaise: this.minRaise,
            winners: this.winners,
            lastAction: this.lastAction,
        };
    }

    // Get full state (for server)
    getFullState(): PokerState {
        return {
            phase: this.phase,
            players: this.players,
            communityCards: this.communityCards,
            pot: this.pot,
            currentBet: this.currentBet,
            currentPlayerIndex: this.currentPlayerIndex,
            dealerIndex: this.dealerIndex,
            smallBlind: this.smallBlind,
            bigBlind: this.bigBlind,
            minRaise: this.minRaise,
            winners: this.winners,
            lastAction: this.lastAction,
        };
    }

    // Check if game can continue
    canContinue(): boolean {
        return this.players.filter(p => p.chips > 0).length >= 2;
    }
}
