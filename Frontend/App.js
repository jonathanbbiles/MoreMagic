/**
 * MoreMagic — read-only Expo dashboard.
 * Polls GET /dashboard every ~20s and renders the bot's observational state.
 *
 * Design law: every figure shown is a real /dashboard field. If a field is
 * missing/null we render "—", never a fake 0.
 *
 * Backend URL resolution order:
 *   EXPO_PUBLIC_BACKEND_URL -> app.json expo.extra.backendUrl
 *   -> (web) window.location.origin -> hardcoded Render default.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { SafeAreaView, ScrollView, View, Text, StyleSheet, RefreshControl, Platform } from 'react-native';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';

const HARDCODED_DEFAULT = 'https://moremagic.onrender.com';

function resolveBackendUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (fromEnv) return fromEnv;
  const fromExtra = Constants?.expoConfig?.extra?.backendUrl;
  if (fromExtra) return fromExtra;
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return HARDCODED_DEFAULT;
}

const API_TOKEN = process.env.EXPO_PUBLIC_API_TOKEN || '';
const POLL_MS = 20000;

const dash = (v, suffix = '') => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${v}${suffix}`);
const money = (v) => (v === null || v === undefined ? '—' : `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
const pct = (v) => (v === null || v === undefined ? '—' : `${(Number(v) * 100).toFixed(2)}%`);

async function fetchDashboard(url) {
  const headers = {};
  if (API_TOKEN) {
    headers.Authorization = `Bearer ${API_TOKEN}`;
    headers['x-api-key'] = API_TOKEN;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${url}/dashboard`, { headers, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function statusOf(data, error) {
  if (error || !data) return { label: 'OFFLINE', color: '#6b7280' };
  if (data.meta?.safety?.brakeActive) return { label: 'BLOCKED', color: '#ef4444' };
  if (data.enabled === false || data.meta?.lastScan?.canEnter === false) return { label: 'PAUSED', color: '#f59e0b' };
  return { label: 'RUNNING', color: '#22c55e' };
}

export default function App() {
  const [url] = useState(resolveBackendUrl());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await fetchDashboard(url);
      setData(d);
      setError(null);
    } catch (e) {
      setError(e.message || 'network error');
    }
  }, [url]);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const status = statusOf(data, error);
  const acct = data?.account || null;
  const meta = data?.meta || {};
  const sc = meta.scorecard || {};
  const positions = data?.positions || [];
  const dayPnl = acct && acct.equity != null && acct.lastEquity != null ? acct.equity - acct.lastEquity : null;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9ca3af" />}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>MoreMagic</Text>
          <View style={[styles.badge, { backgroundColor: status.color }]}>
            <Text style={styles.badgeText}>{status.label}</Text>
          </View>
        </View>
        <Text style={styles.subtle}>
          {dash(data?.mode)} · {dash(data?.assetClass)} · {data?.paper ? 'paper' : 'LIVE'} · v{dash(data?.version)}
        </Text>
        {error ? <Text style={styles.error}>backend unreachable: {error}</Text> : null}

        {/* Equity */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>EQUITY</Text>
          <Text style={styles.bigNum}>{money(acct?.equity)}</Text>
          <View style={styles.row}>
            <Stat label="Day P&L" value={dayPnl == null ? '—' : money(dayPnl)} good={dayPnl} />
            <Stat label="Cash" value={money(acct?.cash)} />
            <Stat label="Buying Pwr" value={money(acct?.buyingPower)} />
          </View>
        </View>

        {/* Engine + Safety */}
        <View style={styles.row}>
          <View style={[styles.card, styles.half]}>
            <Text style={styles.cardLabel}>ENGINE</Text>
            <Text style={styles.kv}>Trading: {data?.enabled ? 'on' : 'off'}</Text>
            <Text style={styles.kv}>Broker: {data?.brokerOk ? 'connected' : '—'}</Text>
            <Text style={styles.kv}>Market: {dash(meta.lastScan?.marketReason)}</Text>
            <Text style={styles.kv}>Day trades: {dash(acct?.daytradeCount)}</Text>
          </View>
          <View style={[styles.card, styles.half]}>
            <Text style={styles.cardLabel}>SAFETY BRAKE</Text>
            <Text style={[styles.kv, { color: meta.safety?.brakeActive ? '#ef4444' : '#22c55e' }]}>
              {meta.safety?.brakeActive ? 'ACTIVE' : 'clear'}
            </Text>
            {(meta.safety?.reasons || []).map((r) => (
              <Text key={r} style={styles.kvSmall}>· {r}</Text>
            ))}
          </View>
        </View>

        {/* Scorecard */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>CLOSED-TRADE SCORECARD</Text>
          <View style={styles.row}>
            <Stat label="Trades" value={dash(sc.closedTrades)} />
            <Stat label="Win rate" value={sc.winRate == null ? '—' : pct(sc.winRate)} />
            <Stat label="Avg" value={sc.avgPnlBps == null ? '—' : `${sc.avgPnlBps} bps`} good={sc.avgPnlBps} />
            <Stat label="Total" value={sc.totalPnlBps == null ? '—' : `${sc.totalPnlBps} bps`} good={sc.totalPnlBps} />
          </View>
        </View>

        {/* Positions */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>POSITIONS ({positions.length})</Text>
          {positions.length === 0 ? (
            <Text style={styles.kvSmall}>flat</Text>
          ) : (
            positions.map((p) => (
              <View key={p.symbol} style={styles.posRow}>
                <Text style={styles.posSym}>{p.symbol}</Text>
                <Text style={styles.kvSmall}>{dash(p.qty)} @ {money(p.avgEntryPrice)}</Text>
                <Text style={[styles.kvSmall, { color: (p.unrealizedPl || 0) >= 0 ? '#22c55e' : '#ef4444' }]}>
                  {p.unrealizedPl == null ? '—' : money(p.unrealizedPl)} ({pct(p.unrealizedPlpc)})
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Skip reasons */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>SKIP REASONS</Text>
          {Object.keys(meta.skipReasons || {}).length === 0 ? (
            <Text style={styles.kvSmall}>—</Text>
          ) : (
            Object.entries(meta.skipReasons)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 12)
              .map(([k, v]) => (
                <Text key={k} style={styles.kvSmall}>
                  {k}: {v}
                </Text>
              ))
          )}
        </View>

        <Text style={styles.footer}>backend: {url}</Text>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, good }) {
  const color = good === undefined || good === null ? '#e5e7eb' : good >= 0 ? '#22c55e' : '#ef4444';
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0f17' },
  container: { padding: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#f9fafb', fontSize: 28, fontWeight: '800', letterSpacing: 0.5 },
  badge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  badgeText: { color: '#0b0f17', fontWeight: '800', fontSize: 12 },
  subtle: { color: '#9ca3af', marginTop: 4, marginBottom: 8 },
  error: { color: '#f59e0b', marginBottom: 8 },
  card: { backgroundColor: '#111827', borderRadius: 14, padding: 16, marginTop: 12, borderWidth: 1, borderColor: '#1f2937' },
  half: { flex: 1 },
  cardLabel: { color: '#9ca3af', fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  bigNum: { color: '#f9fafb', fontSize: 34, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 12, marginTop: 10, flexWrap: 'wrap' },
  stat: { marginRight: 16, marginBottom: 4 },
  statLabel: { color: '#6b7280', fontSize: 11 },
  statValue: { color: '#e5e7eb', fontSize: 16, fontWeight: '700' },
  kv: { color: '#e5e7eb', fontSize: 14, marginTop: 2 },
  kvSmall: { color: '#9ca3af', fontSize: 13, marginTop: 2 },
  posRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#1f2937' },
  posSym: { color: '#f9fafb', fontSize: 15, fontWeight: '700' },
  footer: { color: '#374151', fontSize: 11, marginTop: 16, textAlign: 'center' },
});
