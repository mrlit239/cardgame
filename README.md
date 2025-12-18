# 🎴 Online Card Game Platform

A real-time multiplayer card game platform featuring **Phom** (Vietnamese Rummy), **Poker** (Texas Hold'em), and **Durak** (Russian card game).

## Features

- 🎮 **Three Popular Card Games** - Phom, Poker, and Durak
- 🌐 **Real-time Multiplayer** - Play with friends online via WebSocket
- 🎨 **Modern UI** - Minimalist dark theme with smooth animations
- 🔐 **User Authentication** - Register, login, and track your stats
- 🏠 **Lobby System** - Create and join game rooms

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React + TypeScript + Vite |
| Styling | CSS with custom design system |
| Real-time | Socket.io |
| Backend | Node.js + Express + TypeScript |
| Database | MongoDB + Mongoose |
| Auth | JWT + bcrypt |

## Project Structure

```
├── client/          # React frontend
│   ├── src/
│   │   ├── components/
│   │   ├── contexts/
│   │   ├── services/
│   │   └── ...
├── server/          # Node.js backend
│   ├── src/
│   │   ├── config/
│   │   ├── models/
│   │   ├── socket/
│   │   └── ...
└── shared/          # Shared types
    └── types/
```

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)

### Installation

1. **Clone the repository**

2. **Install dependencies**

```bash
# Install client dependencies
cd client
npm install

# Install server dependencies
cd ../server
npm install
```

3. **Configure environment**

```bash
# In server directory, create .env file
cp .env.example .env
# Edit .env with your MongoDB connection string
```

4. **Start the development servers**

```bash
# Terminal 1 - Start the backend
cd server
npm run dev

# Terminal 2 - Start the frontend
cd client
npm run dev
```

5. **Open your browser**

Navigate to `http://localhost:5173`

## Game Rules

### Phom (Vietnamese Rummy)
- 2-4 players
- Each player gets 9 cards (dealer gets 10)
- Form "phom" (sets of 3+ same rank or consecutive runs)
- Goal: Minimize deadwood cards

### Poker (Texas Hold'em)
- 2-9 players
- 2 hole cards + 5 community cards
- Make the best 5-card hand
- Betting rounds: Preflop, Flop, Turn, River

### Durak
- 2-6 players
- 36-card deck (6 and higher)
- Attack and defend with cards
- Goal: Be first to empty your hand

## Development Status

- [x] Project setup
- [x] Authentication system
- [x] Lobby system
- [x] Card components
- [ ] Phom game engine
- [ ] Poker game engine
- [ ] Durak game engine
- [ ] AI opponents
- [ ] Deployment

## License

MIT
