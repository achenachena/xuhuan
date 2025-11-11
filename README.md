# Xuhuan

A Street Fighter-style VTuber fighting game built as a Telegram Web App.

## Features

- **Character Selection** - Choose from multiple unique VTuber characters with different archetypes
- **Street Fighter-Style Combat** - Side-scrolling battle arena with animated character sprites
- **Fighting Moves** - 4 unique moves per character with combos and special attacks
- **Game Phases** - Character select → Battle → Reward loop
- **Telegram Integration** - Seamless authentication via Telegram Web App SDK
- **Persistent Backend** - PostgreSQL database with Prisma ORM

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

```text
xuhuan/
├── apps/
│   ├── backend/          # Fastify REST API
│   └── miniapp/          # Next.js Telegram Web App
└── packages/
    └── game-types/       # Shared TypeScript types
```
