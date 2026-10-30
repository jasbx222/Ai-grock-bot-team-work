import { sendMessage, sendLive, fetchLive, isDemoMode, DEMO_LABEL, NOT_LINKED } from './chatAdapter.js';
import { STATUS_LABELS } from './agents.js';
import { CONFIG } from './config.js';

// demo history lives in localStorage; live history comes from the backend
const KEY = id => `agentOffice.chat.${id}`;
const load = id => { try { return JSON.parse(localStorage.getItem(KEY(id))) || []; } catch { return []; } };
const save = (id, list) => { try { localStorage.setItem(KEY(id), JSON.stringify(list.slice(-200))); } catch {} };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const time = ts => new Date(ts).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });

export function createChatPanel({ getAgent, getStatus, onOpen, onClose }) {
  const panel = document.getElementById('chat');
  const list = panel.querySelector('.messages');
  const form = panel.querySelector('form');
  const input = form.querySelector('textarea');
  const live = !isDemoMode();
  const cache = new Map(); // live: id -> { msgs, last, local: [] }
  let current = null, pollTimer = null;

  panel.querySelector('.close').addEventListener('click', close);
  panel.querySelector('.clear').addEventListener('click', () => {
    if (!current) return;
    if (live) { const c = cache.get(current); if (c) { c.hiddenBefore = c.last; c.local = []; } } else save(current, []);
    render();
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const text = input.value.trim(); if (!text || !current) return;
    const id = current; input.value = '';
    if (live) return sendLiveMsg(id, text);
    const msgs = load(id); msgs.push({ from: 'me', text, ts: Date.now() }); save(id, msgs); render();
    showTyping(true);
    try {
      const r = await sendMessage(id, text, { agent: getAgent(id), status: getStatus(id) });
      const m2 = load(id); m2.push({ from: 'agent', text: r.text, demo: r.demo, ts: Date.now() }); save(id, m2);
    } catch (err) {
      const m2 = load(id); m2.push({ from: 'system', text: `تعذّر الإرسال: ${err.message}`, ts: Date.now() }); save(id, m2);
    }
    showTyping(false);
    if (current === id) render();
  });

  // ---------- live mode
  const entry = id => { if (!cache.has(id)) cache.set(id, { msgs: [], last: 0, local: [], loaded: false, connected: null, hiddenBefore: 0 }); return cache.get(id); };
  const toView = m => ({ id: m.id, from: m.from, text: m.text, ts: Date.parse(m.createdAt) || Date.now(), delivered: m.delivered, error: m.deliveryError });
  function merge(c, arr) {
    for (const m of arr) {
      const i = c.msgs.findIndex(x => x.id === m.id);
      if (i >= 0) c.msgs[i] = toView(m); else c.msgs.push(toView(m));
      c.last = Math.max(c.last, m.id);
    }
    c.msgs.sort((a, b) => a.id - b.id);
  }
  async function pull(id) {
    const c = entry(id);
    try {
      const r = await fetchLive(id, c.loaded ? c.last : null);
      c.connected = r.agent?.connected ?? c.connected;
      merge(c, r.messages || []); c.loaded = true; c.error = null;
      // refresh delivery state of my pending messages
      if (c.msgs.some(m => m.from === 'me' && !m.delivered && !m.error && c.connected)) {
        const recent = await fetchLive(id, null); merge(c, recent.messages || []);
      }
    } catch (err) { c.error = err.message; }
    if (current === id) render();
  }
  async function sendLiveMsg(id, text) {
    const c = entry(id);
    try {
      const r = await sendLive(id, text);
      c.connected = r.connected;
      merge(c, [r.message]);
      if (!r.connected) c.local.push({ afterId: r.message.id, from: 'system', text: `${NOT_LINKED}: الرسالة انحفظت وتوصل للوكيل أول ما ينربط.`, ts: Date.now() });
    } catch (err) {
      c.local.push({ afterId: c.last, from: 'system', text: `تعذّر الإرسال: ${err.message}`, ts: Date.now() });
    }
    if (current === id) render();
  }
  function liveMessages(id) {
    const c = entry(id), out = [];
    for (const m of c.msgs) {
      if (m.id <= c.hiddenBefore) continue;
      out.push(m);
      for (const l of c.local) if (l.afterId === m.id) out.push(l);
    }
    for (const l of c.local) if (!c.msgs.some(m => m.id === l.afterId) && l.afterId > c.hiddenBefore) out.push(l);
    if (c.error) out.push({ from: 'system', text: `تعذّر الاتصال بالسيرفر: ${c.error}`, ts: Date.now() });
    return out;
  }

  function showTyping(on) { panel.querySelector('.typing').hidden = !on; if (on) list.scrollTop = list.scrollHeight; }

  function header() {
    const a = getAgent(current), s = getStatus(current) || {};
    panel.querySelector('.avatar').style.backgroundImage = `url(${a.face})`;
    panel.querySelector('.who').textContent = `${a.person} · ${a.agentName}`;
    panel.querySelector('.role').textContent = a.role;
    const st = panel.querySelector('.st');
    st.className = `st pill ${s.status || 'offline'}`; st.textContent = STATUS_LABELS[s.status] || STATUS_LABELS.offline;
    let task = s.status === 'problem' ? `المشكلة: ${s.reason || '—'}` : (s.task || '');
    if (live && (s.connected === false || entry(current).connected === false)) task = `${NOT_LINKED} — ${task}`;
    panel.querySelector('.task').textContent = task;
  }

  function meta(m) {
    let t = time(m.ts);
    if (live && m.from === 'me') t += m.delivered ? ' · ✓ وصلت' : m.error ? ' · ⚠ ما وصلت' : entry(current).connected === false ? ` · ${NOT_LINKED}` : ' · …';
    return t;
  }

  function render() {
    if (!current) return;
    header();
    const msgs = live ? liveMessages(current) : load(current);
    list.innerHTML = msgs.length ? msgs.map(m => `
      <div class="msg ${m.from}">
        ${m.demo ? `<span class="demo-tag">${DEMO_LABEL}</span>` : ''}
        <div class="bubble">${esc(m.text).replace(/\n/g, '<br>')}</div>
        <div class="meta">${meta(m)}</div>
      </div>`).join('') : `<div class="empty">ابدأ المحادثة مع ${esc(getAgent(current).person)}…</div>`;
    if (live) {
      const real = msgs.filter(m => m.from !== 'system'), lastM = real[real.length - 1];
      showTyping(!!lastM && lastM.from === 'me' && entry(current).connected !== false && Date.now() - lastM.ts < 10 * 60 * 1000);
    }
    list.scrollTop = list.scrollHeight;
  }

  function open(id) {
    current = id; panel.classList.add('open');
    panel.querySelector('.demo-banner').hidden = live;
    render(); onOpen?.(id);
    if (live) { clearInterval(pollTimer); pull(id); pollTimer = setInterval(() => current && pull(current), CONFIG.chatPollMs); }
    if (matchMedia('(pointer:fine)').matches) input.focus();
  }
  function close() { clearInterval(pollTimer); pollTimer = null; panel.classList.remove('open'); const id = current; current = null; showTyping(false); onClose?.(id); }
  return { open, close, refresh: () => current && header(), get current() { return current; } };
}
