'use strict';

/** scripts/install_git_hooks.js — symlink/copy the pre-commit secret blocker. */
const fs = require('fs');
const path = require('path');

function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

try {
  const repo = findRepoRoot(path.join(__dirname, '..'));
  if (!repo) {
    console.log('install-git-hooks: no .git found, skipping');
    process.exit(0);
  }
  const src = path.join(repo, '.git-hooks', 'pre-commit');
  const hooksDir = path.join(repo, '.git', 'hooks');
  if (!fs.existsSync(src)) {
    console.log('install-git-hooks: .git-hooks/pre-commit not found, skipping');
    process.exit(0);
  }
  if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });
  const dest = path.join(hooksDir, 'pre-commit');
  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o755);
  console.log('install-git-hooks: pre-commit hook installed');
} catch (e) {
  console.log('install-git-hooks: skipped (' + e.message + ')');
}
