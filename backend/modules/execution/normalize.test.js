'use strict';

const test = require('node:test');
const assert = require('node:assert');
const N = require('./normalize');

test('normalizeOrder captures real fill data (price/qty/time) for exact P&L', () => {
  const o = N.normalizeOrder({
    id: 'o1',
    symbol: 'AAPL',
    side: 'buy',
    type: 'market',
    qty: '10',
    filled_qty: '10',
    filled_avg_price: '190.25',
    filled_at: '2025-06-25T18:00:05Z',
    status: 'filled',
    submitted_at: '2025-06-25T18:00:00Z',
  });
  assert.strictEqual(o.filledQty, 10);
  assert.strictEqual(o.filledAvgPrice, 190.25);
  assert.strictEqual(o.filledAtMs, Date.parse('2025-06-25T18:00:05Z'));
  assert.strictEqual(o.status, 'filled');
});

test('normalizeOrder tolerates missing fill fields (null, not fake 0-price)', () => {
  const o = N.normalizeOrder({ id: 'o2', symbol: 'MSFT', side: 'buy', status: 'accepted' });
  assert.strictEqual(o.filledAvgPrice, null);
  assert.strictEqual(o.filledAtMs, null);
});

test('normalizeActivity canonicalizes fill and fee records', () => {
  const fill = N.normalizeActivity({ id: 'a1', activity_type: 'FILL', symbol: 'AAPL', side: 'sell', qty: '10', price: '191.0', transaction_time: '2025-06-25T18:30:00Z' });
  assert.strictEqual(fill.type, 'FILL');
  assert.strictEqual(fill.price, 191);
  assert.strictEqual(fill.tsMs, Date.parse('2025-06-25T18:30:00Z'));

  const fee = N.normalizeActivity({ id: 'a2', activity_type: 'REG', net_amount: '-0.03', date: '2025-06-25' });
  assert.strictEqual(fee.type, 'REG');
  assert.strictEqual(fee.netAmount, -0.03);
});

test('sumFeesUsd totals only fee-type activities as a positive cost', () => {
  const activities = [
    { activity_type: 'FILL', net_amount: '1910.00' }, // not a fee
    { activity_type: 'REG', net_amount: '-0.03' }, // SEC
    { activity_type: 'TAF', net_amount: '-0.01' }, // FINRA TAF
    { activity_type: 'CFEE', net_amount: '-4.75' }, // crypto fee
  ];
  assert.strictEqual(N.sumFeesUsd(activities), 4.79);
  assert.strictEqual(N.sumFeesUsd([]), 0);
  assert.ok(N.FEE_ACTIVITY_TYPES.includes('CFEE'));
});
