import { PhomEngine, PhomGameState } from './PhomEngine';

// Store active games in memory
const activeGames = new Map<string, PhomEngine>();

export function createPhomGame(roomId: string, players: { id: string; username: string }[]): PhomEngine {
    const engine = new PhomEngine(roomId, players);
    activeGames.set(roomId, engine);
    return engine;
}

export function getPhomGame(roomId: string): PhomEngine | undefined {
    return activeGames.get(roomId);
}

export function deletePhomGame(roomId: string): void {
    activeGames.delete(roomId);
}

export function startPhomGame(roomId: string): PhomGameState | null {
    const game = activeGames.get(roomId);
    if (!game) return null;
    return game.startGame();
}

export { PhomEngine, PhomGameState };
