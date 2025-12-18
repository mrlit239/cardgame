import dotenv from 'dotenv';

dotenv.config();

export const config = {
    port: parseInt(process.env.PORT || '3001', 10),
    mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/cardgame',
    jwtSecret: process.env.JWT_SECRET || 'default-secret',
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
};
