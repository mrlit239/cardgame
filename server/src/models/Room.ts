import mongoose, { Schema, Document } from 'mongoose';

export type GameType = 'phom' | 'poker' | 'durak';
export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface IRoomPlayer {
    userId: string;
    username: string;
    isReady: boolean;
    isConnected: boolean;
    socketId?: string;
}


export interface IRoom extends Document {
    name: string;
    gameType: GameType;
    hostId: string;
    players: IRoomPlayer[];
    maxPlayers: number;
    status: RoomStatus;
    gameState?: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

const roomPlayerSchema = new Schema<IRoomPlayer>(
    {
        userId: { type: String, required: true },
        username: { type: String, required: true },
        isReady: { type: Boolean, default: false },
        isConnected: { type: Boolean, default: true },
        socketId: { type: String },
    },
    { _id: false }
);

const roomSchema = new Schema<IRoom>(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 30,
        },
        gameType: {
            type: String,
            enum: ['phom', 'poker', 'durak', 'tictactoe'],
            required: true,
        },
        hostId: {
            type: String,
            required: true,
        },
        players: {
            type: [roomPlayerSchema],
            default: [],
        },
        maxPlayers: {
            type: Number,
            required: true,
            min: 2,
            max: 9,
        },
        status: {
            type: String,
            enum: ['waiting', 'playing', 'finished'],
            default: 'waiting',
        },
        gameState: {
            type: Schema.Types.Mixed,
        },
    },
    {
        timestamps: true,
    }
);

// Index for finding available rooms
roomSchema.index({ status: 1, gameType: 1 });

export const Room = mongoose.model<IRoom>('Room', roomSchema);
