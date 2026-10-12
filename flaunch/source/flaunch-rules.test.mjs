import assert from 'node:assert/strict';
import test from 'node:test';
import { Round } from '@flayerlabs/gamemode-spec/round';
import { GAME_CONFIG, rules } from './flaunch-rules.mjs';

const window = { opensAt: 1_000, closesAt: 301_000 };
const player = '0x1234';

function start() {
  const round = Round.start(rules, GAME_CONFIG, 7, window);
  round.send({ kind: 'join', player, at: window.opensAt });
  return round;
}

test('awards points only after server-measured movement crosses a checkpoint', () => {
  const round = start();
  for (let at = 1_500; at <= 11_000; at += 500) {
    round.send({
      kind: 'action',
      player,
      action: { moveX: 1, moveZ: 0 },
      at,
    });
  }
  assert.equal(round.pointsFor(player), GAME_CONFIG.pointsPerCheckpoint);
  assert.equal(round.playerView(player).points, GAME_CONFIG.pointsPerCheckpoint);
});

test('stationary inputs earn no points', () => {
  const round = start();
  for (let at = 1_500; at <= 11_000; at += 500) {
    round.send({
      kind: 'action',
      player,
      action: { moveX: 0, moveZ: 0 },
      at,
    });
  }
  assert.equal(round.pointsFor(player), 0);
});

test('rejects forged score fields, unbounded input, and rapid duplicate actions', () => {
  assert.equal(rules.parseAction({ moveX: 1, moveZ: 0, points: 999_999 }), null);
  assert.equal(rules.parseAction({ moveX: 20, moveZ: 0 }), null);
  assert.equal(rules.parseAction({ moveX: Number.NaN, moveZ: 0 }), null);

  const round = start();
  const result = round.send({
    kind: 'action',
    player,
    action: { moveX: 1, moveZ: 0 },
    at: 1_100,
  });
  assert.deepEqual(result, { refuse: 'riftera.input_rate' });
});

test('replaying the same commands produces the same state and score ceiling is declared', () => {
  const play = () => {
    const round = start();
    for (let at = 1_500; at <= 21_000; at += 500) {
      round.send({
        kind: 'action',
        player,
        action: { moveX: 0, moveZ: 1 },
        at,
      });
    }
    return round;
  };
  const first = play();
  const second = play();
  assert.deepEqual(first.snapshot(), second.snapshot());
  assert.equal(first.pointsFor(player), 2 * GAME_CONFIG.pointsPerCheckpoint);
  assert.deepEqual(rules.rewardBounds(GAME_CONFIG), { maxPointsPerPlayer: 300 });
});
