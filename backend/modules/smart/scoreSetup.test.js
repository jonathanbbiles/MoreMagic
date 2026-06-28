'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { scoreSetup, rankCandidates } = require('./scoreSetup');

const cfg = { stopLossBps: 80, maxSpreadBps: 20 };

test('scoreSetup returns a 0..1 score and rewards conviction', () => {
  const strong = scoreSetup({ signal: { confidence: 0.9, projectedBps: 160 }, spreadBps: 2, config: cfg });
  const weak = scoreSetup({ signal: { confidence: 0.2, projectedBps: 20 }, spreadBps: 18, config: cfg });
  assert.ok(strong.score > weak.score);
  assert.ok(strong.score >= 0 && strong.score <= 1);
});

test('rankCandidates keeps the best N by score', () => {
  const cands = [
    { symbol: 'A', score: 0.4 },
    { symbol: 'B', score: 0.9 },
    { symbol: 'C', score: 0.7 },
  ];
  const top = rankCandidates(cands, 2).map((c) => c.symbol);
  assert.deepStrictEqual(top, ['B', 'C']);
});
