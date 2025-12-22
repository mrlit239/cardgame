import { User, IUser } from '../models/User';

// Game types for stats tracking
export type GameTypeForStats = 'phom' | 'poker' | 'durak' | 'tienlen' | 'bacay';

// Stats field mapping
const GAME_WIN_FIELDS: Record<GameTypeForStats, keyof IUser['stats']> = {
    phom: 'phomWins',
    poker: 'pokerWins',
    durak: 'durakWins',
    tienlen: 'tienlenWins',
    bacay: 'bacayWins',
};

/**
 * Update user credits in database after a game
 * @param userId - User's MongoDB _id or unique id
 * @param creditChange - Amount to add (positive) or subtract (negative)
 * @param gameType - Type of game for stats
 * @param isWin - Whether this was a win
 * @returns Updated user or null if not found
 */
export async function updateUserCredits(
    userId: string,
    creditChange: number,
    gameType: GameTypeForStats,
    isWin: boolean
): Promise<IUser | null> {
    try {
        // Find user by either MongoDB _id or username-based ID
        let user = await User.findById(userId);

        // If not found by _id, try finding by username (for demo users)
        if (!user) {
            // Demo users might have format like "demo_username"
            user = await User.findOne({ username: userId.replace('demo_', '') });
        }

        if (!user) {
            console.log(`⚠️ User not found for credit update: ${userId}`);
            return null;
        }

        // Update credits (ensure non-negative)
        user.credits = Math.max(0, user.credits + creditChange);

        // Update stats
        user.stats.gamesPlayed += 1;
        if (isWin) {
            user.stats.gamesWon += 1;
            // Update game-specific win count
            const winField = GAME_WIN_FIELDS[gameType];
            if (winField && typeof user.stats[winField] === 'number') {
                (user.stats[winField] as number) += 1;
            }
        }

        // Special case for durak loser
        if (gameType === 'durak' && !isWin) {
            user.stats.durakCount += 1;
        }

        await user.save();

        console.log(`💰 Updated credits for ${user.username}: ${creditChange >= 0 ? '+' : ''}${creditChange} (new total: ${user.credits})`);

        return user;
    } catch (error) {
        console.error('Error updating user credits:', error);
        return null;
    }
}

/**
 * Get user's current credits from database
 * @param userId - User's MongoDB _id or unique id
 * @returns Credits amount or default 1000 if not found
 */
export async function getUserCredits(userId: string): Promise<number> {
    try {
        let user = await User.findById(userId);

        if (!user) {
            user = await User.findOne({ username: userId.replace('demo_', '') });
        }

        return user?.credits ?? 1000;
    } catch (error) {
        console.error('Error getting user credits:', error);
        return 1000;
    }
}

/**
 * Batch update credits for multiple users
 * Used after game ends with multiple winners/losers
 * @returns Map of userId to new credits balance
 */
export async function batchUpdateCredits(
    updates: Array<{
        userId: string;
        creditChange: number;
        gameType: GameTypeForStats;
        isWin: boolean;
    }>
): Promise<Map<string, number>> {
    const results = new Map<string, number>();

    await Promise.all(
        updates.map(async update => {
            const user = await updateUserCredits(
                update.userId,
                update.creditChange,
                update.gameType,
                update.isWin
            );
            if (user) {
                results.set(update.userId, user.credits);
            }
        })
    );

    return results;
}
