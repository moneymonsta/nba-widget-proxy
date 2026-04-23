# NBA Widget Proxy Server

Lightweight Node.js proxy that sits between your widget and NBA.com's public CDN. It solves two problems:

1. **CORS** — NBA.com blocks direct browser requests
2. **Rate limiting** — caches responses so we don't hammer NBA.com and get throttled

## Endpoints

| Endpoint | What it returns |
|----------|----------------|
| `GET /api/health` | Status check |
| `GET /api/players/search?q=lebron` | Player search for the config screen |
| `GET /api/scoreboard` | Today's games |
| `GET /api/player-stats?playerId=2544` | Live stats for a specific player |

## Cache strategy

- Scoreboard & box scores: **15 seconds** (live games refresh fast)
- Player roster: **24 hours** (rarely changes)

## Run locally

```bash
npm install
npm start
```

Server starts on port **3000** by default.

Test it:
```bash
curl http://localhost:3000/api/health
curl "http://localhost:3000/api/players/search?q=lebron"
curl http://localhost:3000/api/scoreboard
curl "http://localhost:3000/api/player-stats?playerId=2544"
```

## Deploy free

### Railway (recommended — easiest)
1. Push this folder to a GitHub repo
2. Go to [railway.app](https://railway.app), connect your repo
3. Railway auto-detects Node.js and deploys
4. Copy the public URL — that's your proxy endpoint

### Render
1. Push to GitHub
2. Create a new Web Service on [render.com](https://render.com)
3. Build command: `npm install` · Start command: `npm start`

### Fly.io
1. Install flyctl: `brew install flyctl`
2. `fly launch` in this folder
3. `fly deploy`

## Environment variables

None required. Optionally set `PORT` if your host needs it.
