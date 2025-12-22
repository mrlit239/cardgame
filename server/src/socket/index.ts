import { Server } from 'socket.io';
import { setupAuthHandlers, AuthenticatedSocket } from './handlers/authHandler';
import { setupLobbyHandlers } from './handlers/lobbyHandler';
import { setupGameHandlers } from './handlers/gameHandler';
import { setupTicTacToeHandlers } from './handlers/tictactoeHandler';
import { setupPokerHandlers } from './handlers/pokerHandler';
import { setupTienLenHandlers } from './handlers/tienlenHandler';
import { setupDurakHandlers } from './handlers/durakHandler';
import { setupBaCayHandler } from './handlers/bacayHandler';

export function setupSocketHandlers(io: Server) {
    io.on('connection', (socket: AuthenticatedSocket) => {
        console.log(`🔌 New connection: ${socket.id}`);

        // Setup all handlers
        setupAuthHandlers(io, socket);
        setupLobbyHandlers(io, socket);
        setupGameHandlers(io, socket);
        setupTicTacToeHandlers(io, socket);
        setupPokerHandlers(io, socket);
        setupTienLenHandlers(io, socket);
        setupDurakHandlers(io, socket);
        setupBaCayHandler(io, socket);

        // Handle disconnection
        socket.on('disconnect', (reason) => {
            console.log(`🔌 Disconnected: ${socket.id} - ${reason}`);
        });
    });

    console.log('✅ Socket handlers initialized');
}

export { AuthenticatedSocket };
