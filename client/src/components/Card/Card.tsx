import type { Card as CardType } from '../../../../shared/types/card';
import { RANK_NAMES, SUIT_SYMBOLS } from '../../../../shared/types/card';
import './Card.css';

interface CardProps {
    card?: CardType;
    faceDown?: boolean;
    selected?: boolean;
    disabled?: boolean;
    onClick?: () => void;
    size?: 'small' | 'medium' | 'large';
}

export function Card({
    card,
    faceDown = false,
    selected = false,
    disabled = false,
    onClick,
    size = 'medium'
}: CardProps) {
    const isRed = card && (card.suit === 'hearts' || card.suit === 'diamonds');

    const handleClick = () => {
        if (!disabled && onClick) {
            onClick();
        }
    };

    if (faceDown || !card) {
        return (
            <div
                className={`playing-card card-back ${size} ${disabled ? 'disabled' : ''}`}
                onClick={handleClick}
            >
                <div className="card-pattern">
                    <span>🎴</span>
                </div>
            </div>
        );
    }

    return (
        <div
            className={`playing-card ${size} ${isRed ? 'red' : 'black'} ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
            onClick={handleClick}
        >
            <div className="card-corner top-left">
                <span className="card-rank">{RANK_NAMES[card.rank]}</span>
                <span className="card-suit">{SUIT_SYMBOLS[card.suit]}</span>
            </div>
            <div className="card-center">
                <span className="card-suit-large">{SUIT_SYMBOLS[card.suit]}</span>
            </div>
            <div className="card-corner bottom-right">
                <span className="card-rank">{RANK_NAMES[card.rank]}</span>
                <span className="card-suit">{SUIT_SYMBOLS[card.suit]}</span>
            </div>
        </div>
    );
}
