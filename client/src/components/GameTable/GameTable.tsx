import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { PlayerSeat } from './PlayerSeat';
import type { PlayerData } from './PlayerSeat';
import './GameTable.css';

export interface GameTableProps {
    players: PlayerData[];
    currentPlayerId: string | null;
    myId: string;
    centerContent?: React.ReactNode;
    actions?: React.ReactNode;
    gameInfo?: {
        gameName: string;
        pot?: number;
        round?: string;
    };
    onPlayerClick?: (playerId: string) => void;
}

export function GameTable({
    players,
    currentPlayerId,
    myId,
    centerContent,
    actions,
    gameInfo,
    onPlayerClick
}: GameTableProps) {
    const { theme } = useTheme();

    // Calculate player positions around the table
    const getPlayerPosition = (index: number, total: number): string => {
        // Position players in a circle around the table
        // Starting from bottom (me) going clockwise
        const positions: { [key: number]: string[] } = {
            2: ['bottom', 'top'],
            3: ['bottom', 'top-left', 'top-right'],
            4: ['bottom', 'left', 'top', 'right'],
            5: ['bottom', 'bottom-left', 'top-left', 'top-right', 'bottom-right'],
            6: ['bottom', 'bottom-left', 'top-left', 'top', 'top-right', 'bottom-right'],
            8: ['bottom', 'bottom-left', 'left', 'top-left', 'top', 'top-right', 'right', 'bottom-right'],
            12: ['bottom', 'bottom-left-1', 'bottom-left-2', 'left', 'top-left-2', 'top-left-1',
                'top', 'top-right-1', 'top-right-2', 'right', 'bottom-right-2', 'bottom-right-1']
        };

        const posArray = positions[total] || positions[4];
        return posArray[index % posArray.length];
    };

    // Reorder players so current user is at bottom
    const reorderPlayers = () => {
        const myIndex = players.findIndex(p => p.id === myId);
        if (myIndex === -1) return players;

        const before = players.slice(0, myIndex);
        const after = players.slice(myIndex);
        return [...after, ...before];
    };

    const orderedPlayers = reorderPlayers();

    return (
        <div className={`game-table ${theme === 'stealth' ? 'stealth-mode' : 'normal-mode'}`}>
            {/* Table felt */}
            <div className="table-felt">
                {/* Game info at top */}
                {gameInfo && (
                    <div className="table-info">
                        <span className="game-name">{gameInfo.gameName}</span>
                        {gameInfo.pot !== undefined && (
                            <span className="pot-amount">💰 Pot: {gameInfo.pot}</span>
                        )}
                        {gameInfo.round && (
                            <span className="round-info">{gameInfo.round}</span>
                        )}
                    </div>
                )}

                {/* Center content (cards, etc) */}
                <div className="table-center">
                    {centerContent}
                </div>

                {/* Player seats */}
                <div className="player-seats">
                    {orderedPlayers.map((player, index) => (
                        <PlayerSeat
                            key={player.id}
                            player={player}
                            position={getPlayerPosition(index, orderedPlayers.length)}
                            isCurrentTurn={player.id === currentPlayerId}
                            isMe={player.id === myId}
                            onClick={() => onPlayerClick?.(player.id)}
                        />
                    ))}
                </div>
            </div>

            {/* Action buttons */}
            {actions && (
                <div className="table-actions">
                    {actions}
                </div>
            )}
        </div>
    );
}

export type { PlayerData } from './PlayerSeat';
