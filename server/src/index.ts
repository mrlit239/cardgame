import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { config } from './config';
import { connectDatabase } from './config/database';
import { setupSocketHandlers } from './socket';

async function main() {
    // Connect to database
    await connectDatabase();

    // Create Express app
    const app = express();

    // Middleware
    app.use(cors({
        origin: config.clientUrl,
        credentials: true,
    }));
    app.use(express.json());

    // Health check endpoint
    app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Create HTTP server
    const httpServer = createServer(app);

    // Create Socket.IO server
    const io = new Server(httpServer, {
        cors: {
            origin: config.clientUrl,
            methods: ['GET', 'POST'],
            credentials: true,
        },
    });

    // Setup socket handlers
    setupSocketHandlers(io);

    // Start server
    httpServer.listen(config.port, () => {
        console.log(`
🎮 Card Game Server Started!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Server:    http://localhost:${config.port}
🔌 WebSocket: ws://localhost:${config.port}
🗄️  Database:  ${config.mongodbUri}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
    });
}

main().catch(console.error);
