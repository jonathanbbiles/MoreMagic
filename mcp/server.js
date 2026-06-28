'use strict';

/**
 * mcp/server.js — zero-dependency MCP diagnostics server (stdio, JSON-RPC).
 * -----------------------------------------------------------------------------
 * Lets a Claude session pull live MoreMagic state. No npm deps — uses only Node
 * built-ins. Point MM_BACKEND_URL at the deployed backend (Render). Optional
 * MM_API_TOKEN is sent as Bearer + x-api-key for protected endpoints.
 *
 * Tools: get_health, get_dashboard, get_logs.
 */

const http = require('http');
const https = require('https');
const readline = require('readline');

const BACKEND = (process.env.MM_BACKEND_URL || 'https://moremagic-backend.onrender.com').replace(/\/+$/, '');
const TOKEN = process.env.MM_API_TOKEN || '';
const PROTOCOL_VERSION = '2024-11-05';

function fetchJson(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(BACKEND + path);
    const lib = url.protocol === 'https:' ? https : http;
    const headers = { Accept: 'application/json' };
    if (TOKEN) {
      headers.Authorization = `Bearer ${TOKEN}`;
      headers['x-api-key'] = TOKEN;
    }
    const req = lib.get(url, { headers, timeout: 8000 }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve({ ok: false, error: 'non-json response', status: res.statusCode, body: body.slice(0, 300) });
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
  });
}

const TOOLS = [
  { name: 'get_health', description: 'Liveness + mode/venue of the MoreMagic backend.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_dashboard', description: 'Full observational snapshot: account, positions, and diagnostics meta.', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'get_logs',
    description: 'Recent backend log tail.',
    inputSchema: { type: 'object', properties: { n: { type: 'number', description: 'how many lines (default 50)' } } },
  },
];

async function callTool(name, args) {
  if (name === 'get_health') return fetchJson('/health');
  if (name === 'get_dashboard') return fetchJson('/dashboard');
  if (name === 'get_logs') return fetchJson(`/debug/logs?n=${Number(args?.n) || 50}`);
  throw new Error(`unknown tool: ${name}`);
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'moremagic-diagnostics', version: '0.1.0' },
      },
    });
  }
  if (method === 'notifications/initialized' || method === 'initialized') return; // notification, no reply
  if (method === 'tools/list') {
    return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  }
  if (method === 'tools/call') {
    try {
      const data = await callTool(params?.name, params?.arguments);
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] } });
    } catch (e) {
      return send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: e.message }] } });
    }
  }
  if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } });
}

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const t = line.trim();
  if (!t) return;
  let msg;
  try {
    msg = JSON.parse(t);
  } catch {
    return;
  }
  handle(msg).catch(() => {});
});
