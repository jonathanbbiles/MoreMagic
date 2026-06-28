'use strict';

/**
 * marketHours.js  (the timeOfDayFilter seed, day-trader edition)
 * -----------------------------------------------------------------------------
 * Pure session/time gating for US equities (regular 09:30–16:00 ET, weekdays,
 * minus a holiday set). Crypto is 24/7 with an optional configurable session
 * boundary used only for the EOD-flatten concept. Deterministic: every function
 * takes an explicit `now` (Date | epoch ms) so there is no hidden clock.
 */

// Full-day US market holidays (observed). Early-close days are treated as normal
// here; tighten ENTRY_CUTOFF_ET / EOD_FLATTEN_ET around them if needed.
const US_MARKET_HOLIDAYS = new Set([
  // 2025
  '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26',
  '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
  // 2026
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
]);

function hhmmToMinutes(s) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(s || '').trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Convert an instant to America/New_York calendar parts (DST-correct). */
function toEtParts(now) {
  const d = now instanceof Date ? now : new Date(now);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  let hour = Number(parts.hour) % 24; // some engines emit '24' for midnight
  const minute = Number(parts.minute);
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dateStr,
    weekday: weekdayMap[parts.weekday],
    hour,
    minute,
    minutesOfDay: hour * 60 + minute,
  };
}

function isWeekend(parts) {
  return parts.weekday === 0 || parts.weekday === 6;
}
function isHoliday(parts) {
  return US_MARKET_HOLIDAYS.has(parts.dateStr);
}

/**
 * Compute the market/session state for the active asset class.
 * @returns {{ open:boolean, canEnter:boolean, shouldFlatten:boolean, reason:string, etTime:string }}
 */
function marketState(now, cfg) {
  const parts = toEtParts(now);
  const etTime = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')} ET`;

  if (cfg.assetClass === 'crypto') {
    // 24/7. Optional session boundary only drives flatten timing.
    const boundary = hhmmToMinutes(cfg.cryptoSessionBoundaryEt);
    const shouldFlatten = boundary != null && parts.minutesOfDay >= boundary;
    return { open: true, canEnter: !shouldFlatten, shouldFlatten, reason: 'crypto_24_7', etTime };
  }

  // Equities
  if (isWeekend(parts)) return { open: false, canEnter: false, shouldFlatten: false, reason: 'weekend', etTime };
  if (isHoliday(parts)) return { open: false, canEnter: false, shouldFlatten: false, reason: 'holiday', etTime };

  const open = hhmmToMinutes(cfg.marketOpenEt);
  const close = hhmmToMinutes(cfg.marketCloseEt);
  const eod = hhmmToMinutes(cfg.eodFlattenEt);
  const cutoff = hhmmToMinutes(cfg.entryCutoffEt);
  const t = parts.minutesOfDay;

  const isOpen = t >= open && t < close;
  if (!isOpen) {
    return {
      open: false,
      canEnter: false,
      shouldFlatten: false,
      reason: t < open ? 'pre_market' : 'after_hours',
      etTime,
    };
  }
  const shouldFlatten = t >= eod;
  const canEnter = t < cutoff && !shouldFlatten;
  return {
    open: true,
    canEnter,
    shouldFlatten,
    reason: shouldFlatten ? 'eod_flatten_window' : canEnter ? 'session_open' : 'entry_cutoff_passed',
    etTime,
  };
}

module.exports = { marketState, toEtParts, hhmmToMinutes, isWeekend, isHoliday, US_MARKET_HOLIDAYS };
