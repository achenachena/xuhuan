# Xuhuan (虚环)

A turn-based combat mini-game built as a Telegram Web App with persistent player progression.

## Overview

Xuhuan is a lightweight, browser-based tactical RPG where players engage in turn-based battles against procedurally-scaled enemies, earn rewards (experience and in-game currency), and track their progression through Telegram integration. The name "虚环" (Xuhuan) means "void ring" or "virtual circle" in Chinese, reflecting its sci-fi game theme.

## Features

- **Turn-Based Combat System** - Strategic battles with three action types (Attack, Charged Attack, Defend)
- **Deterministic Game Logic** - Seeded RNG ensures battles can be validated server-side
- **Player Progression** - Experience, levels, credits, and energy system
- **Telegram Integration** - Seamless authentication and theming via Telegram Web App SDK
- **Persistent Backend** - PostgreSQL database with Prisma ORM
- **Real-time Combat Log** - Detailed battle event tracking
- **Reward System** - Experience, credits, and item drops based on enemy difficulty

## Tech Stack

### Frontend (Mini App)
- **Next.js 14** - React framework with App Router
- **React 18** - UI library
- **TailwindCSS** - Utility-first styling
- **SWR** - Data fetching with automatic caching
- **Telegram Web App SDK** - Telegram integration
- **TypeScript** - Type safety

### Backend (API)
- **Fastify 4** - High-performance Node.js web framework
- **Prisma 5** - ORM for PostgreSQL
- **Zod** - Schema validation
- **PostgreSQL** - Database
- **TypeScript** - Type safety

### Shared
- **game-types** - Shared TypeScript type definitions

## Project Structure

```
xuhuan/
├── apps/
│   ├── backend/          # Fastify REST API
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── routes/
│   │   │   │   ├── battle.ts
│   │   │   │   └── player.ts
│   │   │   ├── services/
│   │   │   │   ├── battle-service.ts
│   │   │   │   └── player-service.ts
│   │   │   └── plugins/
│   │   │       └── telegram-auth.ts
│   │   └── prisma/
│   │       ├── schema.prisma
│   │       └── seed.ts
│   └── miniapp/          # Next.js frontend
│       └── src/
│           ├── app/
│           │   └── page.tsx
│           ├── components/
│           │   ├── game-scene.tsx
│           │   ├── combat-log.tsx
│           │   └── reward-modal.tsx
│           ├── lib/
│           │   └── game-loop.ts
│           └── hooks/
│               └── use-player.ts
└── packages/
    └── game-types/       # Shared TypeScript types
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd xuhuan
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:

**Backend** (`apps/backend/.env`):
```env
DATABASE_URL="postgresql://user:password@localhost:5432/xuhuan"
TELEGRAM_BOT_TOKEN="your_bot_token_here"
TELEGRAM_ALLOWED_ORIGINS="https://web.telegram.org,https://telegram.org"
NODE_ENV="development"
```

**Frontend** (`apps/miniapp/.env.local`):
```env
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

4. Set up the database:
```bash
# Generate Prisma client
npm run db:generate --workspace apps/backend

# Push schema to database
npm run db:push --workspace apps/backend

# Seed the database
npm run db:seed --workspace apps/backend
```

### Development

Run both apps in development mode:

**Backend:**
```bash
npm run dev --workspace apps/backend
```

**Frontend:**
```bash
npm run dev --workspace apps/miniapp
```

The backend will run on `http://localhost:3001` and the frontend on `http://localhost:3000`.

### Building for Production

```bash
# Build all packages
npm run build --workspaces

# Or build individually
npm run build --workspace packages/game-types
npm run build --workspace apps/backend
npm run build --workspace apps/miniapp
```

## Deployment

### Backend (Railway)

1. Create a new Railway project
2. Add PostgreSQL database
3. Set environment variables:
   - `DATABASE_URL` (auto-filled by Railway)
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_ALLOWED_ORIGINS`
   - `NODE_ENV=production`
4. Deploy from repository root (Railway uses `apps/backend/railway.json`)

### Frontend (Vercel)

1. Create a new Vercel project
2. Set root directory to `apps/miniapp`
3. Set build command:
   ```bash
   npm run build --workspace packages/game-types && npm run build --workspace apps/miniapp
   ```
4. Set environment variable:
   - `NEXT_PUBLIC_API_URL` (your Railway backend URL)
5. Deploy

## Game Mechanics

### Combat System

Players control a hero ("Wanderer") in turn-based battles against enemies ("Training Drone", etc.).

**Actions:**
- **Rapid Strike** - Standard damage attack (1.0x multiplier)
- **Resonant Burst** - Amplified attack with higher crit potential (1.35x multiplier)
- **Phase Guard** - Heal 8% max HP and absorb incoming damage

**Turn Resolution:**
1. Hero acts first
2. Enemy retaliates (if alive)
3. Damage is calculated using attack vs defense with variation
4. Critical hits apply bonus damage
5. Status effects tick down each turn
6. Battle ends on victory or defeat

**Damage Formula:**
```
baseAttack = attacker.attack × actionModifier - (defender.defense × 0.6)
variation = 0.85 + random(0 to 0.3)  [seeded RNG]
damage = baseAttack × variation
if criticalHit:
  damage = damage × (1.5 + attacker.critDamage)
finalDamage = max(1, round(damage))
```

### Rewards

Victory rewards are calculated based on enemy level:
- **Experience**: enemy level × 18
- **Credits**: enemy level × 12
- **Item Drops**: 15% base chance + 2% per enemy level
  - Rarity: Common (60%), Rare (30%), Epic (10%)

### Progression

- **Level**: Increases with experience
- **Experience**: Cumulative points for leveling
- **Credits**: In-game currency
- **Energy**: Resource system (0-180 cap)

## API Endpoints

### Player Routes
- `GET /player` - Fetch current player profile (auto-creates if new)
- `POST /player/progress` - Update player stats (internal use)

### Battle Routes
- `POST /battle/start` - Initiate a battle run
- `POST /battle/resolve` - Complete a battle and apply rewards

### Health Check
- `GET /health` - Server health status

## Database Schema

### Player
- `id` - Unique identifier
- `telegramId` - Telegram user ID
- `username` - Player username
- `level` - Current level
- `experience` - Total experience points
- `credits` - In-game currency
- `energy` - Current energy (0-180)

### Encounter
- `slug` - Unique identifier
- `name` - Enemy name
- `level` - Enemy level
- `attributes` - Stats (HP, attack, defense, etc.)

### Run
- `id` - Unique run identifier
- `playerId` - Associated player
- `encounterId` - Associated encounter
- `seed` - RNG seed for determinism
- `status` - ACTIVE, VICTORY, or DEFEAT
- `combatLog` - JSON battle events
- `rewards` - JSON reward data

## Security

- **Telegram Authentication**: HMAC-SHA256 signature verification
- **Run Ownership Validation**: Players can only resolve their own battles
- **Deterministic RNG**: Seeded randomness prevents cheating
- **CORS Whitelist**: Configurable allowed origins
- **Input Validation**: Zod schemas on all API endpoints
- **Timing-Safe Comparison**: Prevents timing attacks

## Scripts

### Backend
```bash
npm run dev --workspace apps/backend         # Development server
npm run build --workspace apps/backend       # Build for production
npm run db:generate --workspace apps/backend # Generate Prisma client
npm run db:push --workspace apps/backend     # Sync schema to database
npm run db:migrate --workspace apps/backend  # Run migrations
npm run db:seed --workspace apps/backend     # Seed database
```

### Frontend
```bash
npm run dev --workspace apps/miniapp    # Development server
npm run build --workspace apps/miniapp  # Build for production
npm run start --workspace apps/miniapp  # Start production server
npm run lint --workspace apps/miniapp   # Lint code
```

### Root
```bash
npm run dev                    # Run miniapp dev server
npm run lint --workspaces      # Lint all packages
npm run build --workspaces     # Build all packages
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Acknowledgments

- Built with [Fastify](https://www.fastify.io/)
- Frontend powered by [Next.js](https://nextjs.org/)
- Database ORM by [Prisma](https://www.prisma.io/)
- Telegram integration via [Telegram Web App SDK](https://core.telegram.org/bots/webapps)
