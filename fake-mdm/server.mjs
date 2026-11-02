// Fake MDM: a small stand-in for a NinjaOne-style RMM/MDM provider.
// Zero dependencies. Run with `node fake-mdm/server.mjs` or via docker compose.
// Behaviour is documented in FAKE_MDM.md. Treat this file as the provider's
// black box: you should not need to read it to do the exercise.

import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 4010);
const CLIENT_ID = process.env.FAKE_MDM_CLIENT_ID ?? 'take-home-client';
const CLIENT_SECRET = process.env.FAKE_MDM_CLIENT_SECRET ?? 'take-home-secret';
const CHAOS = (process.env.FAKE_MDM_CHAOS ?? '1') !== '0';
const TOKEN_TTL_S = Number(process.env.FAKE_MDM_TOKEN_TTL ?? 300);
const SPEED = Number(process.env.FAKE_MDM_SPEED ?? 1); // >1 = faster timings (for your tests)

// ---------- deterministic-ish RNG (seedable) ----------
let seed = Number(process.env.FAKE_MDM_SEED ?? Date.now()) >>> 0;
function rand() {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a, b) => a + rand() * (b - a);
const nowS = () => Date.now() / 1000; // epoch seconds, float (like the real provider)
const later = (ms, fn) => setTimeout(fn, ms / SPEED);

// ---------- state ----------
const UID_WIN_REBOOT = '6f1c2d0e-0b7a-4c43-9a3e-2b1f0d6c9e11';
const UID_WIN_SAFE = '9a8b7c6d-1e2f-4a3b-8c9d-0e1f2a3b4c5d';
const UID_MAC_REBOOT = 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f';
const UID_SHUTDOWN = '11112222-3333-4444-8555-666677778888';

let devices, activities, dispatches, tokens, nextActivityId;

function reset() {
  const t = nowS();
  devices = new Map([
    [1001, { id: 1001, systemName: 'ACME-LT-01', nodeClass: 'WINDOWS_WORKSTATION', organizationId: 7, offline: false, lastContact: t - 20, behaviour: 'ok' }],
    [1002, { id: 1002, systemName: 'ACME-MB-02', nodeClass: 'MAC', organizationId: 7, offline: false, lastContact: t - 45, behaviour: 'ok' }],
    [1003, { id: 1003, systemName: 'ACME-LT-03', nodeClass: 'WINDOWS_WORKSTATION', organizationId: 7, offline: true, lastContact: t - 3 * 3600, behaviour: 'ok' }],
    [1004, { id: 1004, systemName: 'ACME-LT-04', nodeClass: 'WINDOWS_WORKSTATION', organizationId: 7, offline: false, lastContact: t - 10, behaviour: 'fails' }],
    [1005, { id: 1005, systemName: 'ACME-MB-05', nodeClass: 'MAC', organizationId: 7, offline: false, lastContact: t - 30, behaviour: 'silent' }],
  ]);
  activities = [];
  dispatches = [];
  tokens = new Map();
  nextActivityId = 880000 + Math.floor(rand() * 1000);
  // History: every device already has an old, successful reboot in its feed.
  for (const d of devices.values()) {
    const uid = d.nodeClass === 'MAC' ? UID_MAC_REBOOT : UID_WIN_REBOOT;
    const series = randomUUID();
    const base = t - between(3600, 86400);
    push({ deviceId: d.id, activityTime: base, activityType: 'ACTION', status: 'STARTED', statusCode: 'agent_action_started', activityResult: null, sourceConfigUid: uid, sourceName: 'Reboot', seriesUid: series, user: 'tech@acme.example' });
    push({ deviceId: d.id, activityTime: base + 40, activityType: 'SYSTEM', status: 'SYSTEM_REBOOTED', statusCode: 'SYSTEM_REBOOTED', activityResult: null, sourceConfigUid: null, sourceName: 'Monitor', seriesUid: null });
    push({ deviceId: d.id, activityTime: base + 75, activityType: 'ACTION', status: 'COMPLETED', statusCode: 'agent_action_completed', activityResult: 'SUCCESS', sourceConfigUid: uid, sourceName: 'Reboot', seriesUid: series, user: 'tech@acme.example' });
  }
}

function push(row) {
  const a = { id: nextActivityId++, ...row };
  activities.push(a);
  return a;
}

function scriptingOptions(d) {
  const mac = d.nodeClass === 'MAC';
  const scripts = mac
    ? [
        { type: 'ACTION', uid: UID_MAC_REBOOT, name: 'Reboot', language: 'native' },
        { type: 'ACTION', uid: UID_SHUTDOWN, name: 'Shutdown', language: 'native' },
        { type: 'SCRIPT', id: 312, name: 'Clear DNS cache', language: 'shell' },
      ]
    : [
        { type: 'ACTION', uid: UID_WIN_SAFE, name: 'Reboot (Safe Mode)', language: 'native' },
        { type: 'ACTION', uid: UID_WIN_REBOOT, name: 'Reboot', language: 'native' },
        { type: 'ACTION', uid: UID_SHUTDOWN, name: 'Shutdown', language: 'native' },
        { type: 'SCRIPT', id: 207, name: 'Restart Print Spooler', language: 'powershell' },
      ];
  return { categories: [{ id: 1, name: 'Maintenance' }], credentials: { roles: [] }, scripts };
}

// ---------- the reboot lifecycle (what really happens on the machine) ----------
function runAction(d, uid) {
  const series = randomUUID();
  const action = scriptingOptions(d).scripts.find((s) => s.uid === uid);
  dispatches.push({ deviceId: d.id, uid, name: action.name, at: new Date().toISOString() });
  later(between(1000, 3000), () => {
    push({ deviceId: d.id, activityTime: nowS(), activityType: 'ACTION', status: 'STARTED', statusCode: 'agent_action_started', activityResult: null, sourceConfigUid: uid, sourceName: action.name, seriesUid: series, user: 'api' });
    if (d.behaviour === 'silent') return; // the machine never reports back
    const isReboot = action.name.startsWith('Reboot');
    const rebootAfter = between(5000, 12000);
    if (isReboot && d.behaviour !== 'fails') {
      later(rebootAfter, () => {
        d.lastContact = nowS();
        push({ deviceId: d.id, activityTime: nowS(), activityType: 'SYSTEM', status: 'SYSTEM_REBOOTED', statusCode: 'SYSTEM_REBOOTED', activityResult: null, sourceConfigUid: null, sourceName: 'Monitor', seriesUid: null });
      });
    }
    later(rebootAfter + between(3000, 8000), () => {
      const ok = d.behaviour !== 'fails';
      push({
        deviceId: d.id, activityTime: nowS(), activityType: 'ACTION', status: 'COMPLETED',
        statusCode: ok ? 'agent_action_completed' : 'agent_action_failed',
        activityResult: ok ? 'SUCCESS' : 'FAILURE', sourceConfigUid: uid, sourceName: action.name, seriesUid: series, user: 'api',
        message: ok ? undefined : 'Action failed on device: pending updates lock (0x80070020)',
      });
    });
  });
}

// ---------- background noise: other people and monitors also write to the feed ----------
function noise() {
  const list = [...devices.values()].filter((d) => !d.offline);
  const d = list[Math.floor(rand() * list.length)];
  const r = rand();
  if (r < 0.5) {
    push({ deviceId: d.id, activityTime: nowS(), activityType: 'CONDITION', status: 'TRIGGERED', statusCode: rand() < 0.5 ? 'CPU_USAGE_HIGH' : 'DISK_SPACE_LOW', activityResult: null, sourceConfigUid: randomUUID(), sourceName: 'Policy condition', seriesUid: null });
  } else if (r < 0.8) {
    push({ deviceId: d.id, activityTime: nowS(), activityType: 'ACTION', status: 'COMPLETED', statusCode: 'agent_action_completed', activityResult: 'SUCCESS', sourceConfigUid: randomUUID(), sourceName: 'Patch scan', seriesUid: randomUUID(), user: 'scheduler' });
  } else {
    // a machine restarted by its user (no action involved)
    push({ deviceId: d.id, activityTime: nowS(), activityType: 'SYSTEM', status: 'SYSTEM_REBOOTED', statusCode: 'SYSTEM_REBOOTED', activityResult: null, sourceConfigUid: null, sourceName: 'Monitor', seriesUid: null });
  }
  for (const x of devices.values()) if (!x.offline) x.lastContact = Math.max(x.lastContact, nowS() - between(5, 60));
  later(between(3000, 8000), noise);
}

// ---------- HTTP ----------
function send(res, status, body, headers = {}) {
  if (body === undefined) {
    res.writeHead(status, headers);
    return res.end();
  }
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

function authed(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
  if (!m) return false;
  const exp = tokens.get(m[1]);
  return exp !== undefined && exp > Date.now();
}

const publicDevice = (d) => ({ id: d.id, systemName: d.systemName, nodeClass: d.nodeClass, organizationId: d.organizationId, offline: d.offline, lastContact: d.lastContact });

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = url.pathname;

    // --- test helpers (not part of the provider API) ---
    if (p === '/__fake/dispatches' && req.method === 'GET') return send(res, 200, dispatches);
    if (p === '/__fake/reset' && req.method === 'POST') { reset(); return send(res, 204); }
    if (p === '/health') return send(res, 200, { ok: true });

    // --- auth ---
    if (p === '/ws/oauth/token' && req.method === 'POST') {
      const form = new URLSearchParams(await readBody(req));
      if (form.get('grant_type') !== 'client_credentials' || form.get('client_id') !== CLIENT_ID || form.get('client_secret') !== CLIENT_SECRET) {
        return send(res, 401, { error: 'invalid_client' });
      }
      const token = randomUUID();
      tokens.set(token, Date.now() + TOKEN_TTL_S * 1000);
      return send(res, 200, { access_token: token, token_type: 'Bearer', expires_in: TOKEN_TTL_S, scope: 'monitoring management control' });
    }
    if (!authed(req)) return send(res, 401, { error: 'not_authenticated', resultCode: 'Invalid credentials' });

    // --- devices ---
    if (p === '/v2/devices' && req.method === 'GET') return send(res, 200, [...devices.values()].map(publicDevice));
    let m = /^\/v2\/device\/(\d+)(\/.*)?$/.exec(p);
    if (!m) return send(res, 404, { error: 'not_found' });
    const d = devices.get(Number(m[1]));
    if (!d) return send(res, 404, { error: 'device_not_found' });
    const sub = m[2] ?? '';

    if (sub === '' && req.method === 'GET') return send(res, 200, publicDevice(d));

    if (sub === '/scripting/options' && req.method === 'GET') return send(res, 200, scriptingOptions(d));

    if (sub === '/activities' && req.method === 'GET') {
      const pageSize = Math.min(Number(url.searchParams.get('pageSize') ?? 20), 50);
      const olderThan = url.searchParams.get('olderThan');
      const newerThan = url.searchParams.get('newerThan');
      let rows = activities.filter((a) => a.deviceId === d.id);
      if (olderThan) rows = rows.filter((a) => a.id < Number(olderThan));
      if (newerThan) rows = rows.filter((a) => a.id > Number(newerThan));
      rows = rows.sort((a, b) => b.id - a.id).slice(0, pageSize); // newest first
      return send(res, 200, { lastActivityId: nextActivityId - 1, activities: rows });
    }

    if (sub === '/script/run' && req.method === 'POST') {
      let body;
      try { body = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: 'invalid_json' }); }
      if (body?.type !== 'ACTION' || typeof body.uid !== 'string') return send(res, 400, { error: 'type ACTION and uid are required' });
      if (!scriptingOptions(d).scripts.some((s) => s.type === 'ACTION' && s.uid === body.uid)) return send(res, 404, { error: 'action_not_available_for_device' });
      if (d.offline) return send(res, 409, { error: 'device_offline' });

      if (CHAOS) {
        const r = rand();
        if (r < 0.12) return send(res, 429, { error: 'rate_limited' }, { 'retry-after': '2' });
        if (r < 0.22) return send(res, 503, { error: 'service_unavailable' }); // nothing was sent
        if (r < 0.32) { runAction(d, body.uid); return later(between(200, 800), () => send(res, 502, { error: 'bad_gateway' })); } // it WAS sent
        if (r < 0.42) { runAction(d, body.uid); return later(12000, () => send(res, 204)); } // slow, but sent
      }
      runAction(d, body.uid);
      return send(res, 204);
    }

    return send(res, 404, { error: 'not_found' });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'internal' });
  }
});

reset();
later(2000, noise);
server.listen(PORT, () => console.log(`fake-mdm listening on :${PORT} (chaos ${CHAOS ? 'on' : 'off'}, speed x${SPEED})`));
