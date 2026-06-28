'use strict';

/**
 * scripts/preflight.js — pre-deploy gate. Verifies (offline):
 *  1. config wiring: defaults + dummy creds validate cleanly;
 *  2. paper-safety: validateEnv refuses paper mode pointed at a live URL, and
 *     refuses to boot without creds;
 *  3. env audit: no dead documented config;
 *  4. required files exist.
 * Exits non-zero on any failure.
 */

const fs = require('fs');
const path = require('path');
const { bootstrapLiveEnv } = require('../config/bootstrapLiveEnv');
const { validateEnv } = require('../config/validateEnv');
const { auditEnv } = require('./env_audit');

const ROOT = path.join(__dirname, '..');
const REPO = path.join(ROOT, '..');
let failures = 0;
const fail = (m) => {
  console.error('  ✗ ' + m);
  failures++;
};
const ok = (m) => console.log('  ✓ ' + m);

// 1) config validates with defaults + dummy creds
try {
  const env = { APCA_API_KEY_ID: 'PREFLIGHT', APCA_API_SECRET_KEY: 'PREFLIGHT' };
  bootstrapLiveEnv(env);
  const cfg = validateEnv(env);
  if (cfg.isPaper && cfg.tradingMode === 'paper') ok('config validates (paper mode, defaults)');
  else fail('expected paper defaults');
} catch (e) {
  fail('validateEnv threw on good config: ' + e.message);
}

// 2a) refuses to boot without creds
try {
  const env = {};
  bootstrapLiveEnv(env);
  env.APCA_API_KEY_ID = '';
  env.APCA_API_SECRET_KEY = '';
  validateEnv(env);
  fail('validateEnv accepted missing creds');
} catch (e) {
  ok('blocks boot without Alpaca creds');
}

// 2b) refuses paper mode on a live URL
try {
  const env = { APCA_API_KEY_ID: 'x', APCA_API_SECRET_KEY: 'y', ALPACA_TRADING_BASE_URL: 'https://api.alpaca.markets' };
  bootstrapLiveEnv(env);
  env.TRADING_MODE = 'paper';
  env.ALPACA_TRADING_BASE_URL = 'https://api.alpaca.markets';
  validateEnv(env);
  fail('validateEnv accepted paper mode on a live URL');
} catch (e) {
  ok('paper mode requires the paper base URL');
}

// 3) env audit
const audit = auditEnv();
if (audit.unused.length === 0) ok(`env audit clean (${audit.total} vars)`);
else fail('dead config: ' + audit.unused.join(', '));

// 4) required files
const required = [
  'index.js',
  'trade.js',
  'auth.js',
  'config/liveDefaults.js',
  'config/validateEnv.js',
  'config/bootstrapLiveEnv.js',
  'Dockerfile',
  'modules/execution/index.js',
];
for (const rel of required) {
  if (fs.existsSync(path.join(ROOT, rel))) ok(`exists: ${rel}`);
  else fail(`missing: ${rel}`);
}
// repo-level files
for (const rel of ['README.md', '.git-hooks/pre-commit']) {
  if (fs.existsSync(path.join(REPO, rel))) ok(`exists: ${rel}`);
  else fail(`missing: ${rel}`);
}

if (failures) {
  console.error(`\nPREFLIGHT FAILED (${failures} problem(s))`);
  process.exit(1);
}
console.log('\nPREFLIGHT OK');
