// NBA Widget Proxy Server
// Solves two problems: (1) NBA.com CORS blocks browser requests,
// (2) caches responses so we don't get rate-limited.
// Deploy to Railway, Render, Fly.io, or any Node host.

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ─── Cache ────────────────────────────────────────────────────────────
const cache = new Map();

const TTL = {
  scoreboard: 15 * 1000,                     // 15 seconds during live games
  boxscore:   15 * 1000,                     // 15 seconds for live stats
  players:    24 * 60 * 60 * 1000,           // 24 hours (rosters rarely change)
};

function cacheGet(key) {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data;
  return null;
}

function cacheSet(key, data, ttl) {
  cache.set(key, { data, expiresAt: Date.now() + ttl });
}

// ─── NBA.com CDN helper ───────────────────────────────────────────────
async function nbaFetch(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; NBAWidget/1.0)',
      'Accept': 'application/json',
      'Referer': 'https://www.nba.com/',
    },
  });
  if (!res.ok) throw new Error(`NBA.com responded ${res.status}`);
  return await res.json();
}

// ─── Player roster loader ─────────────────────────────────────────────
// Uses the nba.com stats players index (updated daily on backend)
async function loadAllPlayers() {
  const cached = cacheGet('all_players');
  if (cached) return cached;

  const url = 'https://stats.nba.com/stats/playerindex?Historical=0&LeagueID=00&Season=2024-25&Active=1';
  try {
    const data = await nbaFetch(url);
    const headers = data.resultSets[0].headers;
    const rows = data.resultSets[0].rowSet;
    const idx = (name) => headers.indexOf(name);

    const players = rows.map(r => ({
      id:        r[idx('PERSON_ID')],
      firstName: r[idx('PLAYER_FIRST_NAME')],
      lastName:  r[idx('PLAYER_LAST_NAME')],
      fullName:  `${r[idx('PLAYER_FIRST_NAME')]} ${r[idx('PLAYER_LAST_NAME')]}`,
      teamId:    r[idx('TEAM_ID')],
      tricode:   r[idx('TEAM_ABBREVIATION')],
      teamName:  r[idx('TEAM_NAME')],
      jersey:    r[idx('JERSEY_NUMBER')],
      position:  r[idx('POSITION')],
    }));

    cacheSet('all_players', players, TTL.players);
    return players;
  } catch (e) {
    console.error('Player index failed:', e.message);
    return [];
  }
}

// ─── Endpoints ────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, cacheSize: cache.size, uptime: process.uptime() });
});

// Player search — used by the config screen
app.get('/api/players/search', async (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q) return res.json({ players: [] });

  const all = await loadAllPlayers();
  const matches = all
    .filter(p => p.fullName.toLowerCase().includes(q))
    .slice(0, 15);

  res.json({ players: matches });
});

// Today's scoreboard
app.get('/api/scoreboard', async (req, res) => {
  const cached = cacheGet('scoreboard');
  if (cached) return res.json({ ...cached, cached: true });

  try {
    const data = await nbaFetch('https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json');
    const games = data.scoreboard.games.map(g => ({
      gameId:     g.gameId,
      status:     g.gameStatus,            // 1=upcoming 2=live 3=final
      statusText: g.gameStatusText,
      period:     g.period,
      clock:      g.gameClock,
      home: {
        teamId:   g.homeTeam.teamId,
        tricode:  g.homeTeam.teamTricode,
        name:     g.homeTeam.teamName,
        score:    g.homeTeam.score,
      },
      away: {
        teamId:   g.awayTeam.teamId,
        tricode:  g.awayTeam.teamTricode,
        name:     g.awayTeam.teamName,
        score:    g.awayTeam.score,
      },
    }));
    const payload = { games, updatedAt: new Date().toISOString() };
    cacheSet('scoreboard', payload, TTL.scoreboard);
    res.json({ ...payload, cached: false });
  } catch (e) {
    res.status(502).json({ error: 'NBA.com unreachable', message: e.message });
  }
});

// Live stats for a single player (the widget's main endpoint)
app.get('/api/player-stats', async (req, res) => {
  const playerId = parseInt(req.query.playerId);
  if (!playerId) return res.status(400).json({ error: 'playerId required' });

  try {
    // Get scoreboard (cached)
    let sb = cacheGet('scoreboard');
    if (!sb) {
      const data = await nbaFetch('https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json');
      sb = {
        games: data.scoreboard.games.map(g => ({
          gameId: g.gameId, status: g.gameStatus, period: g.period,
          clock: g.gameClock, statusText: g.gameStatusText,
          home: { teamId: g.homeTeam.teamId, tricode: g.homeTeam.teamTricode, name: g.homeTeam.teamName, score: g.homeTeam.score },
          away: { teamId: g.awayTeam.teamId, tricode: g.awayTeam.teamTricode, name: g.awayTeam.teamName, score: g.awayTeam.score },
        })),
      };
      cacheSet('scoreboard', sb, TTL.scoreboard);
    }

    // Look player up in today's games
    for (const g of sb.games) {
      if (g.status === 1) continue; // not started
      let box = cacheGet(`box:${g.gameId}`);
      if (!box) {
        const data = await nbaFetch(`https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${g.gameId}.json`);
        box = data.game;
        cacheSet(`box:${g.gameId}`, box, TTL.boxscore);
      }

      const homePlayer = (box.homeTeam?.players || []).find(p => p.personId === playerId);
      const awayPlayer = (box.awayTeam?.players || []).find(p => p.personId === playerId);
      const player = homePlayer || awayPlayer;
      if (!player) continue;

      const team = homePlayer ? box.homeTeam : box.awayTeam;
      const opp  = homePlayer ? box.awayTeam : box.homeTeam;
      const s = player.statistics || {};

      return res.json({
        found: true,
        gameStatus: g.status,          // 2=live 3=final
        gameStatusText: g.statusText,
        period: g.period,
        clock: g.clock,
        score: {
          team: team.score,
          opponent: opp.score,
        },
        team: {
          id: team.teamId,
          tricode: team.teamTricode,
          name: team.teamName,
        },
        opponent: {
          id: opp.teamId,
          tricode: opp.teamTricode,
        },
        player: {
          id: player.personId,
          name: player.name,
          firstName: player.firstName,
          lastName: player.familyName,
          jersey: player.jerseyNum,
          position: player.position,
          played: player.played === '1',
          onCourt: player.oncourt === '1',
        },
        stats: {
          minutes: s.minutes || 'PT00M',
          points: s.points ?? 0,
          rebounds: s.reboundsTotal ?? 0,
          assists: s.assists ?? 0,
          steals: s.steals ?? 0,
          blocks: s.blocks ?? 0,
          fgMade: s.fieldGoalsMade ?? 0,
          fgAttempted: s.fieldGoalsAttempted ?? 0,
          fgPct: Math.round((s.fieldGoalsPercentage ?? 0) * 1000) / 10,
          fg3Made: s.threePointersMade ?? 0,
          fg3Attempted: s.threePointersAttempted ?? 0,
          fg3Pct: Math.round((s.threePointersPercentage ?? 0) * 1000) / 10,
          ftMade: s.freeThrowsMade ?? 0,
          ftAttempted: s.freeThrowsAttempted ?? 0,
          ftPct: Math.round((s.freeThrowsPercentage ?? 0) * 1000) / 10,
        },
        updatedAt: new Date().toISOString(),
      });
    }

    // Player's team isn't playing today, OR game hasn't started
    const playerIndex = await loadAllPlayers();
    const info = playerIndex.find(p => p.id === playerId);
    return res.json({
      found: false,
      reason: 'No active game for this player today',
      player: info || null,
    });

  } catch (e) {
    res.status(502).json({ error: 'Lookup failed', message: e.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`NBA widget proxy listening on :${PORT}`);
});
