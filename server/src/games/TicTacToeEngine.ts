// Tic-Tac-Toe Game Engine

export type TicTacToeSymbol = 'X' | 'O' | null;
export type TicTacToeBoard = TicTacToeSymbol[];

export interface TicTacToePlayer {
    id: string;
    username: string;
    symbol: 'X' | 'O';
}

export interface TicTacToeState {
    board: TicTacToeBoard;
    players: TicTacToePlayer[];
    currentPlayerIndex: number;
    winner: string | null;
    isDraw: boolean;
    isGameOver: boolean;
    winningLine: number[] | null;
}

export class TicTacToeEngine {
    private board: TicTacToeBoard;
    private players: TicTacToePlayer[];
    private currentPlayerIndex: number;
    private winner: string | null;
    private isDraw: boolean;
    private winningLine: number[] | null;

    constructor(playerIds: { id: string; username: string }[]) {
        if (playerIds.length !== 2) {
            throw new Error('Tic-Tac-Toe requires exactly 2 players');
        }

        this.board = Array(9).fill(null);
        this.players = [
            { ...playerIds[0], symbol: 'X' },
            { ...playerIds[1], symbol: 'O' },
        ];
        this.currentPlayerIndex = 0; // X goes first
        this.winner = null;
        this.isDraw = false;
        this.winningLine = null;
    }

    getState(): TicTacToeState {
        return {
            board: [...this.board],
            players: this.players,
            currentPlayerIndex: this.currentPlayerIndex,
            winner: this.winner,
            isDraw: this.isDraw,
            isGameOver: this.winner !== null || this.isDraw,
            winningLine: this.winningLine,
        };
    }

    getCurrentPlayerId(): string {
        return this.players[this.currentPlayerIndex].id;
    }

    makeMove(playerId: string, position: number): { success: boolean; message?: string } {
        // Validate game is not over
        if (this.winner || this.isDraw) {
            return { success: false, message: 'Game is already over' };
        }

        // Validate it's this player's turn
        if (this.getCurrentPlayerId() !== playerId) {
            return { success: false, message: 'Not your turn' };
        }

        // Validate position
        if (position < 0 || position > 8) {
            return { success: false, message: 'Invalid position' };
        }

        // Validate position is empty
        if (this.board[position] !== null) {
            return { success: false, message: 'Position already taken' };
        }

        // Make the move
        const currentPlayer = this.players[this.currentPlayerIndex];
        this.board[position] = currentPlayer.symbol;

        // Check for win
        const winResult = this.checkWin();
        if (winResult) {
            this.winner = currentPlayer.id;
            this.winningLine = winResult;
            return { success: true };
        }

        // Check for draw
        if (!this.board.includes(null)) {
            this.isDraw = true;
            return { success: true };
        }

        // Switch turns
        this.currentPlayerIndex = this.currentPlayerIndex === 0 ? 1 : 0;
        return { success: true };
    }

    private checkWin(): number[] | null {
        const winPatterns = [
            [0, 1, 2], // Top row
            [3, 4, 5], // Middle row
            [6, 7, 8], // Bottom row
            [0, 3, 6], // Left column
            [1, 4, 7], // Middle column
            [2, 5, 8], // Right column
            [0, 4, 8], // Diagonal top-left to bottom-right
            [2, 4, 6], // Diagonal top-right to bottom-left
        ];

        for (const pattern of winPatterns) {
            const [a, b, c] = pattern;
            if (
                this.board[a] !== null &&
                this.board[a] === this.board[b] &&
                this.board[a] === this.board[c]
            ) {
                return pattern;
            }
        }

        return null;
    }

    reset(): void {
        this.board = Array(9).fill(null);
        this.currentPlayerIndex = 0;
        this.winner = null;
        this.isDraw = false;
        this.winningLine = null;
    }
}
