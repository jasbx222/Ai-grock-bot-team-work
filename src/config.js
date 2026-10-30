// Runtime configuration. Override before the app loads with
//   window.AGENT_OFFICE_CONFIG = { apiBaseUrl: 'https://relay.example', appToken: '...' }
// - Web: put it in public/config.js (loaded by index.html, not committed with real values).
// - Flutter: generated from --dart-define=API_BASE_URL / APP_TOKEN (served as /config.js).
const defaults = {
  // office-relay backend. Empty = demo mode (status.json + clearly labelled local demo replies).
  apiBaseUrl: '',
  appToken: '',
  // demo-mode files
  statusUrl: 'status.json',
  agentsUrl: 'agents.json',
  statusPollMs: 5000,
  chatPollMs: 3000,
};
export const CONFIG = Object.assign({}, defaults, (typeof window !== 'undefined' && window.AGENT_OFFICE_CONFIG) || {});
CONFIG.apiBaseUrl = String(CONFIG.apiBaseUrl || '').replace(/\/+$/, '');

export const isLive = () => !!CONFIG.apiBaseUrl;

export async function api(path, opts = {}) {
  const res = await fetch(`${CONFIG.apiBaseUrl}/api${path}`, {
    ...opts,
    cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${CONFIG.appToken}`, ...(opts.headers || {}) },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); if (j.message) msg += ` — ${j.message}`; } catch {}
    throw new Error(msg);
  }
  return res.json();
}
