import { CONFIG } from './config.js';

// Polls status.json and calls onUpdate(data, ok)
export function startStatusFeed(onUpdate) {
  async function tick() {
    try {
      const res = await fetch(`${CONFIG.statusUrl}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      onUpdate(await res.json(), true);
    } catch (e) {
      onUpdate(null, false);
    }
  }
  tick();
  return setInterval(tick, CONFIG.statusPollMs);
}
