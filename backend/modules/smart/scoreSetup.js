'use strict';

/**
 * smart/scoreSetup.js — the "smart" layer.
 * -----------------------------------------------------------------------------
 * Ranks candidate setups across the universe each scan and sizes by conviction.
 * Pure: takes an already-evaluated signal result + microstructure context and
 * returns a composite score in 0..1. The loop enters only the best few setups
 * (>= MIN_SCORE), sized by score.
 */

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

/**
 * @param {object} p
 * @param {object} p.signal  a successful signal result ({ confidence, projectedBps, volatilityBps })
 * @param {number} [p.spreadBps]  current spread (cost headwind)
 * @param {object} p.config
 * @returns {{ score:number, rewardRisk:number, parts:object }}
 */
function scoreSetup({ signal, spreadBps = 0, config }) {
  const confidence = clamp01(signal.confidence ?? 0);
  const projected = Math.max(0, signal.projectedBps ?? 0);
  const stop = Math.max(1, config.stopLossBps);

  // Reward:risk vs the configured stop, normalized so ~2R => 1.0.
  const rewardRisk = projected / stop;
  const rrScore = clamp01(rewardRisk / 2);

  // Projected move normalized (100 bps => ~1.0).
  const moveScore = clamp01(projected / 100);

  // Spread is a cost headwind: full credit at 0, zero at the configured cap.
  const spreadPenalty = clamp01(1 - spreadBps / Math.max(1, config.maxSpreadBps));

  const score = clamp01(0.45 * confidence + 0.25 * moveScore + 0.15 * rrScore + 0.15 * spreadPenalty);
  return {
    score,
    rewardRisk: +rewardRisk.toFixed(3),
    parts: { confidence, moveScore, rrScore, spreadPenalty },
  };
}

/** Rank scored candidates desc and keep the top `maxOpen`. */
function rankCandidates(candidates, maxOpen) {
  return [...candidates].sort((a, b) => b.score - a.score).slice(0, maxOpen);
}

module.exports = { scoreSetup, rankCandidates, clamp01 };
