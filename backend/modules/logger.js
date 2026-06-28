'use strict';

/** Tiny in-memory ring-buffer logger for the /debug/logs tail. */
function createLogBuffer(size = 300) {
  const lines = [];
  return {
    log(message, level = 'info') {
      const entry = { ts: Date.now(), level, message: String(message) };
      lines.push(entry);
      while (lines.length > size) lines.shift();
      return entry;
    },
    tail(n) {
      return n ? lines.slice(-n) : lines.slice();
    },
    size() {
      return lines.length;
    },
  };
}

module.exports = { createLogBuffer };
