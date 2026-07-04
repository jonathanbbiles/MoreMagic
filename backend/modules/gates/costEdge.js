'use strict';

/**
 * gates/costEdge.js — cost-aware ENTRY gate.
 * -----------------------------------------------------------------------------
 * Pushes the shared cost model into the live entry decision. Until now costs
 * (fees + spread + slippage) only shaped the backtest expectancy and the
 * circuit-breaker ledger AFTER trades closed — the live loop still entered on
 * confidence + score alone. With the whole-market crypto scan and the loosened
 * score/spread floors, that let the loop take setups whose projected move was
 * smaller than their own round-trip cost (crypto taker fees alone are ~50 bps
 * round trip). This gate rejects those up front.
 *
 * Pure: given the signal's projected move, the live spread, and config, it
 * returns whether the setup clears its modeled round-trip cost by at least
 * MIN_NET_EDGE_BPS. Uses the REAL quoted spread when available so a wide book is
 * penalised precisely.
 */

const { roundTripCostBps } = require('../costs/costModel');

/**
 * @param {object} p
 * @param {number} p.projectedBps  the signal's projected move (bps, >=0)
 * @param {number} [p.spreadBps]   live quoted spread (bps); falls back to modeled
 * @param {object} p.config        typed config (cost fields + minNetEdgeBps)
 * @returns {{ ok:boolean, reason?:string, netEdgeBps:number, costBps:number, requiredBps:number }}
 */
function costEdgeGate({ projectedBps, spreadBps = null, config }) {
  const costBps = roundTripCostBps({ config, spreadBps }).totalBps;
  const projected = Number.isFinite(projectedBps) ? projectedBps : 0;
  const netEdgeBps = +(projected - costBps).toFixed(2);
  const requiredBps = Number.isFinite(config.minNetEdgeBps) ? config.minNetEdgeBps : 0;
  if (!(netEdgeBps >= requiredBps)) {
    return { ok: false, reason: 'below_cost_hurdle', netEdgeBps, costBps, requiredBps };
  }
  return { ok: true, netEdgeBps, costBps, requiredBps };
}

module.exports = { costEdgeGate };
