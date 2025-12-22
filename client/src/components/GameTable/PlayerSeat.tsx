import React from 'react';

export interface PlayerData {
    id: string;
    username: string;
    avatar?: string;
    credits?: number;
    chips?: number;
    currentBet?: number;
    cards?: React.ReactNode;
    status?: 'waiting' | 'ready' | 'active' | 'folded' | 'out' | 'winner';
    statusText?: string;
    isDealer?: boolean;
    isHost?: boolean;
}

interface PlayerSeatProps {
    player: PlayerData;
    position: string;
    isCurrentTurn: boolean;
    isMe: boolean;
    onClick?: () => void;
}

export function PlayerSeat({
    player,
    position,
    isCurrentTurn,
    isMe,
    onClick
}: PlayerSeatProps) {
    const getStatusClass = () => {
        if (player.status === 'folded' || player.status === 'out') return 'inactive';
        if (player.status === 'winner') return 'winner';
        if (isCurrentTurn) return 'current-turn';
        return '';
    };

    const displayAmount = player.chips !== undefined ? player.chips : player.credits;

    return (
        <div
            className={`player-seat position-${position} ${getStatusClass()} ${isMe ? 'is-me' : ''}`}
            onClick={onClick}
        >
            {/* Dealer chip */}
            {player.isDealer && (
                <div className="dealer-chip">D</div>
            )}

            {/* Host crown */}
            {player.isHost && (
                <div className="host-badge">👑</div>
            )}

            {/* Avatar */}
            <div className="seat-avatar emoji-avatar">
                {player.avatar || player.username.charAt(0).toUpperCase()}
            </div>

            {/* Player info */}
            <div className="seat-info">
                <span className="seat-name">{isMe ? 'You' : player.username}</span>
                {displayAmount !== undefined && (
                    <span className="seat-credits">💰 {displayAmount.toLocaleString()}</span>
                )}
                {player.currentBet !== undefined && player.currentBet > 0 && (
                    <span className="seat-bet">Bet: {player.currentBet}</span>
                )}
            </div>

            {/* Status indicator */}
            {player.statusText && (
                <div className={`seat-status ${player.status || ''}`}>
                    {player.statusText}
                </div>
            )}

            {/* Cards (if provided) */}
            {player.cards && (
                <div className="seat-cards">
                    {player.cards}
                </div>
            )}

            {/* Turn indicator */}
            {isCurrentTurn && (
                <div className="turn-indicator">
                    <span className="pulse"></span>
                </div>
            )}
        </div>
    );
}
