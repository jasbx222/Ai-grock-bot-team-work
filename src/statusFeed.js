import { CONFIG, isLive, api } from './config.js';

// Normalises the backend shape to what the office expects (reason/result for problem/done).
function fromApi(data) {
  return {
    sample: false,
    live: true,
    updatedAt: data.updatedAt,
    agents: (data.agents || []).map(a => ({
      ...a,
      reason: a.status === 'problem' ? a.task : undefined,
      result: a.status === 'done' ? a.task : undefined,
      task: a.status === 'offline' ? (a.connected ? 'ما حدّث حالته مؤخراً' : 'لم يُربط بعد') : a.task,
    })),
    messages: data.messages || [],
  };
}

export async function fetchStatus() {
  if (isLive()) return fromApi(await api('/agents'));
  const res = await fetch(`${CONFIG.statusUrl}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

// Polls the backend (/api/agents) or status.json and calls onUpdate(data, ok)
export function startStatusFeed(onUpdate) {
  async function tick() {
    try { onUpdate(await fetchStatus(), true); } catch (e) { onUpdate(null, false); }
  }
  tick();
  return setInterval(tick, CONFIG.statusPollMs);
}
