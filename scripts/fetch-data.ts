import { fetchNFLverse } from '../server/provider.js';
import fs from 'node:fs/promises';
const data = await fetchNFLverse(
  Number(process.argv[2] || new Date().getUTCFullYear() - (new Date().getUTCMonth() < 2 ? 1 : 0)),
);
const previous = JSON.parse(
  await fs.readFile('data/nfl-snapshot.json', 'utf8').catch(() => '{"players":[],"games":[]}'),
);
const selected = Number(
  process.argv[2] || new Date().getUTCFullYear() - (new Date().getUTCMonth() < 2 ? 1 : 0),
);
for (const key of ['roster', 'weekly', 'teamWeekly'] as const)
  data[key] = [...(previous[key] || []).filter((r: any) => r.season !== selected), ...data[key]];
data.players = [...previous.players.filter((p: any) => p.season !== selected), ...data.players];
const games = new Map(previous.games.map((g: any) => [g.id, g]));
for (const g of data.games) games.set(g.id, g);
data.games = [...games.values()] as typeof data.games;
await fs.writeFile('data/nfl-snapshot.json', JSON.stringify(data));
console.log(
  `Saved ${data.teams.length} teams, ${data.players.length} player seasons and ${data.games.length} games. Run npm run db:import to apply.`,
);
