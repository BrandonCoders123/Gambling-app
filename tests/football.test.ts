import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameState, teamResult, scheduleWeeks } from '../server/football.js';
test('final W/L/T, upcoming and unavailable games never infer a missing score', () => {
  const g = {
    season: 2026,
    week: 1,
    type: 'REG',
    home_id: 'KC',
    away_id: 'BUF',
    home_score: 0,
    away_score: 0,
    starts_at: '2026-09-01T00:00:00Z',
  };
  assert.equal(teamResult(g, 'KC'), 'T');
  assert.equal(teamResult({ ...g, home_score: 7 }, 'KC'), 'W');
  assert.equal(teamResult({ ...g, home_score: 7 }, 'BUF'), 'L');
  assert.equal(
    gameState({ ...g, home_score: null, away_score: null }, Date.parse('2026-08-01')),
    'upcoming',
  );
  assert.equal(
    gameState({ ...g, home_score: null, away_score: null }, Date.parse('2026-10-01')),
    'unavailable',
  );
  assert.equal(teamResult({ ...g, home_score: null, away_score: null }, 'KC'), null);
  assert.equal(scheduleWeeks([], 'KC', 2026)[0].status, 'unavailable');
  const schedule = Array.from({ length: 17 }, (_, i) => ({ ...g, week: i + 1 }));
  assert.equal(scheduleWeeks(schedule, 'KC', 2026).find((g) => g.week === 18)?.status, 'bye');
});
