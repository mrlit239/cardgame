import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

// Preset emoji avatars users can choose from
export const PRESET_AVATARS = [
    '😀', '😎', '🤠', '🥳', '😈', '👻', '🤖', '👽',
    '🦊', '🐱', '🐶', '🐼', '🦁', '🐯', '🐸', '🦄',
    '🔥', '⚡', '🌟', '💎', '🎯', '🎲', '🃏', '♠️'
];

export interface IUser extends Document {
    username: string;
    password: string;
    avatar: string;
    credits: number;
    stats: {
        gamesPlayed: number;
        gamesWon: number;
        phomWins: number;
        pokerWins: number;
        durakWins: number;
        durakCount: number; // Times being durak (loser)
        tienlenWins: number;
        bacayWins: number;
    };
    createdAt: Date;
    updatedAt: Date;
    comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
    {
        username: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            minlength: 3,
            maxlength: 20,
        },
        password: {
            type: String,
            required: true,
            minlength: 6,
        },
        avatar: {
            type: String,
            default: '😀',
        },
        credits: {
            type: Number,
            default: 1000,
        },
        stats: {
            gamesPlayed: { type: Number, default: 0 },
            gamesWon: { type: Number, default: 0 },
            phomWins: { type: Number, default: 0 },
            pokerWins: { type: Number, default: 0 },
            durakWins: { type: Number, default: 0 },
            durakCount: { type: Number, default: 0 },
            tienlenWins: { type: Number, default: 0 },
            bacayWins: { type: Number, default: 0 },
        },
    },
    {
        timestamps: true,
    }
);

// Hash password before saving
userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});


// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
    return bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.model<IUser>('User', userSchema);
