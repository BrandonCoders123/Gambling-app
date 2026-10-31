import { fetchNFLverse } from '../server/provider.js';
import fs from 'node:fs/promises';
const data = await fetchNFLverse(Number(process.argv[2] || 2024));
const previous = JSON.parse(
  await fs.readFile('data/nfl-snapshot.json', 'utf8').catch(() => '{"players":[],"games":[]}'),
);
const selected = data.players[0]?.season;
data.players = [...previous.players.filter((p: any) => p.season !== selected), ...data.players];
const games = new Map(previous.games.map((g: any) => [g.id, g]));
for (const g of data.games) games.set(g.id, g);
data.games = [...games.values()] as typeof data.games;
await fs.writeFile('data/nfl-snapshot.json', JSON.stringify(data));
console.log(
  `Saved ${data.teams.length} teams, ${data.players.length} player seasons and ${data.games.length} games. Run npm run db:import to apply.`,
);
