# Deployment Guide

## Vercel (Frontend)

1. Create a new Vercel project and select this repository.
2. Set the root directory to `apps/miniapp`.
3. Configure environment variables:
   - `NEXT_PUBLIC_API_URL` – URL of the Fastify API (e.g. `https://<railway-app>.up.railway.app`).
4. Add the following build command: `npm run build --workspace packages/game-types && npm run build --workspace apps/miniapp`.
5. Use `npm install` as the install command and `npm run dev --workspace apps/miniapp` for previews if needed.

## Railway (Backend)

1. Create a new Railway service and connect this repository.
2. Set the root directory to the repository root so workspaces are available.
3. Railway will read `apps/backend/railway.json` to build and start the service.
4. Configure environment variables:
   - `NODE_ENV=production`
   - `DATABASE_URL` – Neon connection string.
   - `TELEGRAM_BOT_TOKEN` – Bot token from BotFather.
   - `TELEGRAM_ALLOWED_ORIGINS` – Comma-separated list of allowed origins.
5. After deploy, verify `/health` responds with `status: ok`.

