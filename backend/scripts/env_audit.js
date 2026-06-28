'use strict';

/**
 * scripts/env_audit.js — "every documented env var must be read in code".
 * Scans backend/*.js for each LIVE_DEFAULTS key; flags any default that is never
 * referenced outside its own definition file (dead config).
 */

const fs = require('fs');
const path = require('path');
const { LIVE_DEFAULTS } = require('../config/liveDefaults');

const ROOT = path.join(__dirname, '..');

function listJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsFiles(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function auditEnv() {
  const files = listJsFiles(ROOT).filter((f) => !f.endsWith(path.join('config', 'liveDefaults.js')));
  const blob = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const unused = [];
  for (const key of Object.keys(LIVE_DEFAULTS)) {
    if (!blob.includes(key)) unused.push(key);
  }
  return { total: Object.keys(LIVE_DEFAULTS).length, unused, scannedFiles: files.length };
}

if (require.main === module) {
  const { total, unused, scannedFiles } = auditEnv();
  console.log(`env audit: ${total} documented vars across ${scannedFiles} files`);
  if (unused.length) {
    console.error('DEAD CONFIG (never read in code):\n  - ' + unused.join('\n  - '));
    process.exit(1);
  }
  console.log('OK — every documented env var is read somewhere.');
}

module.exports = { auditEnv };
