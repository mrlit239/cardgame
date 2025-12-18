import mongoose from 'mongoose';
import { config } from './index';

let isConnected = false;

export async function connectDatabase(): Promise<void> {
    try {
        await mongoose.connect(config.mongodbUri, {
            serverSelectionTimeoutMS: 5000, // 5 second timeout
        });
        isConnected = true;
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.warn('⚠️ MongoDB not available - running in demo mode (no data persistence)');
        console.warn('   To use full features, install MongoDB or use MongoDB Atlas');
        isConnected = false;
        // Don't exit - allow server to run without DB for demo
    }
}

export function isDatabaseConnected(): boolean {
    return isConnected;
}

mongoose.connection.on('disconnected', () => {
    console.log('⚠️ MongoDB disconnected');
    isConnected = false;
});

mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB error:', err);
});

