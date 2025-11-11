# Railway Deployment Setup

## Initial Setup

### 1. Configure Environment Variables in Railway

Set these environment variables in your Railway project settings:

```bash
# Required
DATABASE_URL=postgresql://... # Your Neon database URL
TELEGRAM_BOT_TOKEN=123456789:YOUR_BOT_TOKEN

# Optional but recommended
CHARACTER_ADMIN_TOKEN=<generate-with: openssl rand -hex 32>
NODE_ENV=production
```

### 2. Deploy to Railway

Push your code to GitHub. Railway will automatically:
- Build the project
- Run migrations
- Start the server

### 3. Sync Characters to Production

After Railway deployment is live, sync your characters using the admin API:

```bash
cd apps/backend

# Set your Railway API URL and admin token
export API_URL="https://your-app.railway.app"
export ADMIN_TOKEN="your_admin_token_from_railway_env"

# Run the sync script
npm run sync:characters
```

**Output:**
```
🌟 Loading characters from: ./config/character-roster.json
📋 Found 7 characters to upload
🎯 Target API: https://your-app.railway.app

✅ Uploaded: 七海Nana7mi
✅ Uploaded: 星瞳
✅ Uploaded: 嘉然
✅ Uploaded: 贝拉
✅ Uploaded: lulu
✅ Uploaded: 向晚
✅ Uploaded: 奶绿

✨ Sync complete: 7 succeeded, 0 failed
```

## Updating Characters

To update character data in production:

1. Update `apps/backend/config/character-roster.json` locally
2. Run the sync script again:
   ```bash
   API_URL="https://your-app.railway.app" ADMIN_TOKEN="your_token" npm run sync:characters
   ```

## Troubleshooting

### "Admin endpoints are not configured"
Make sure `CHARACTER_ADMIN_TOKEN` is set in Railway environment variables.

### "Unauthorized: Invalid admin token"
Double-check your `ADMIN_TOKEN` matches the `CHARACTER_ADMIN_TOKEN` in Railway.

### "Failed to fetch characters"
Verify your `API_URL` is correct and the Railway deployment is running.

## Security Notes

- **Never commit** `config/character-roster.json` to the repository (it's gitignored)
- **Never commit** your actual `CHARACTER_ADMIN_TOKEN`
- Keep your admin token secure and rotate it periodically
- The admin API is protected and requires the token for all operations
