import './style.css';
import { CONFIG, isLive } from './config.js';
import { STATUS_LABELS, loadAgents, normalizeAgent, artPaths, GENERIC_ART } from './agents.js';
import { createScene } from './scene2d.js';
import { createChatPanel } from './chatPanel.js';
import { startStatusFeed, fetchStatus } from './statusFeed.js';

const qs = new URLSearchParams(location.search);
if (qs.get('status')) CONFIG.statusUrl = qs.get('status');
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ICON = { working: '•••', waiting: '☕', problem: '!', done: '✓', offline: '' };

async function boot() {
  // agents = agents.json + any unknown id seen in status.json
  const { agents } = await loadAgents();
  let firstStatus = null;
  try { firstStatus = await fetchStatus(); } catch {}
  for (const s of firstStatus?.agents || []) if (!agents.some(a => a.id === s.id)) agents.push(normalizeAgent({ id: s.id, agentName: s.agentName || s.id, person: s.person, role: s.role }));
  const byId = new Map(agents.map(a => [a.id, a]));
  const statuses = new Map();

  let ready = false;
  const scene = await createScene($('scene'), {
    onPick: id => openChat(id),
    onRoom: r => { if (scene.S.view === 'room' && scene.S.roomId === r.id) scene.fit('house'); else scene.focusRoom(r.id); },
    onFrame: S => ready && onFrame(S),
  });
  await scene.setAgents(agents);
  const usedArt = new Set(agents.map(a => a.art.key));
  await scene.setAvatar(artPaths(GENERIC_ART.find(k => !usedArt.has(k)) || 'generic2'));

  // ---------- layout: insets so the camera frames the house in the free area
  const mqSide = matchMedia('(min-width: 900px) and (min-height: 561px)'), mqLand = matchMedia('(orientation: landscape) and (max-height: 560px)');
  function insets() {
    const top = $('topbar').getBoundingClientRect().bottom + 6, ctl = $('controls').getBoundingClientRect();
    if (mqSide.matches) scene.setInsets({ top, bottom: innerHeight - ctl.top + 8, left: 0, right: 364 });
    else if (mqLand.matches) scene.setInsets({ top, bottom: innerHeight - ctl.top + 6, left: 0, right: 0 });
    else scene.setInsets({ top, bottom: innerHeight - ctl.top + 8, left: 0, right: 0 });
  }
  function refit(snap) { const S = scene.S; scene.fit(S.walk ? 'walk' : S.view === 'room' ? 'room' : 'house', snap); }
  insets(); scene.resize(); scene.fit('house', true);
  addEventListener('resize', () => { scene.resize(); insets(); refit(); });
  $('teamHead').addEventListener('click', () => { if (mqSide.matches) return; const on = document.body.classList.toggle('sheet-open'); $('teamHead').setAttribute('aria-expanded', on); });

  // ---------- room labels
  const roomTags = scene.rooms.map(r => {
    const el = document.createElement('div'); el.className = `roomtag ${r.kind}`;
    el.textContent = r.kind === 'private' ? (r.owner ? `🛏 غرفة ${r.owner.person}` : '🛏 غرفة فارغة') : r.name;
    const at = { kitchen: [178, 556], hall: [600, 598], meeting: [868, 556], hallway: [512, 852] }[r.id] || [(r.rect[0] + r.rect[2]) / 2, r.floor[0][3] - 4];
    $('labels').appendChild(el); return { el, at };
  });

  // ---------- team list
  const people = $('people');
  function renderList() {
    people.innerHTML = agents.map(a => `<li data-id="${esc(a.id)}"><div class="av" style="background-image:url(${a.face})"><i></i></div>
      <div class="txt"><b>${esc(a.person)}</b><em>${esc(a.agentName)} · ${esc(a.role)}</em><div><span class="st"></span> <span class="tk"></span></div></div>
      <button class="chatb" title="محادثة">💬</button></li>`).join('');
    $('teamCount').textContent = `${agents.length} قطط · اضغط للتفاصيل`;
    $('peek').innerHTML = agents.slice(0, 6).map(a => `<i data-id="${esc(a.id)}" style="background-image:url(${a.face})"></i>`).join('');
  }
  renderList();
  people.addEventListener('click', e => {
    const li = e.target.closest('li'); if (!li) return; const id = li.dataset.id;
    if (e.target.closest('.chatb')) return openChat(id);
    if (scene.S.walk) scene.walkTo(id); else { scene.focus(id); }
    if (!mqSide.matches) { document.body.classList.remove('sheet-open'); $('teamHead').setAttribute('aria-expanded', false); }
    people.querySelectorAll('li').forEach(x => x.classList.toggle('active', x === li));
  });

  // ---------- floating labels
  const labels = $('labels'), tags = new Map();
  for (const a of agents) {
    const el = document.createElement('div'); el.className = 'tag offline';
    el.innerHTML = `<div class="bubble" hidden></div><div class="card"><b>${esc(a.person)}<span class="an"> · ${esc(a.agentName)}</span></b><small><i></i><span></span></small><span class="badge"></span></div>`;
    el.addEventListener('click', () => openChat(a.id)); labels.appendChild(el); tags.set(a.id, el);
  }
  const youTag = document.createElement('div'); youTag.className = 'tag you small'; youTag.innerHTML = '<div class="card"><b>أنت</b></div>'; youTag.hidden = true; labels.appendChild(youTag);

  function applyStatus(id) {
    const s = statuses.get(id) || { status: 'offline' }, st = STATUS_LABELS[s.status] ? s.status : 'offline', el = tags.get(id), c = `var(--${st})`;
    scene.setStatus(id, { ...s, status: st });
    el.className = `tag ${st}`; el.style.setProperty('--c', c);
    el.querySelector('small span').textContent = STATUS_LABELS[st];
    el.querySelector('.badge').textContent = ICON[st]; el.querySelector('.badge').hidden = !ICON[st];
    const b = el.querySelector('.bubble');
    b.className = `bubble ${st === 'problem' ? 'problem' : ''}`;
    b.textContent = st === 'problem' ? `⚠ ${s.reason || 'مشكلة'}` : st === 'working' ? `⌨ ${s.task || ''}` : st === 'waiting' ? `☕ ${s.task || 'ينتظر'}` : st === 'done' ? `✓ ${s.result || s.task || 'خلّص'}` : '';
    b.hidden = !b.textContent;
    const li = people.querySelector(`[data-id="${CSS.escape(id)}"]`);
    $('peek').querySelector(`[data-id="${CSS.escape(id)}"]`)?.style.setProperty('--c', c);
    li.style.setProperty('--c', c); li.querySelector('.st').textContent = STATUS_LABELS[st];
    li.querySelector('.tk').textContent = st === 'problem' ? `— ${s.reason || ''}` : s.task ? `— ${s.task}` : '';
  }
  const a = id => byId.get(id);

  // ---------- status feed + paper messages
  const seen = new Set(); let first = true;
  function onStatus(data, ok) {
    $('feedDot').className = `dot ${ok ? 'ok' : 'bad'}`;
    $('feedText').textContent = ok ? `آخر تحديث ${new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : (isLive() ? 'تعذّر الاتصال بالسيرفر' : 'تعذّر قراءة status.json');
    if (!ok) return;
    $('sampleBadge').hidden = !data.sample;
    for (const s of data.agents || []) if (byId.has(s.id)) statuses.set(s.id, s);
    for (const ag of agents) applyStatus(ag.id);
    let i = 0;
    for (const m of data.messages || []) { if (seen.has(m.id)) continue; seen.add(m.id); scene.sendPaper(m.from, m.to, (first ? 1.2 : 0) + i++ * 1.3); }
    first = false; chat.refresh();
  }

  const chat = createChatPanel({ getAgent: a, getStatus: id => statuses.get(id), onOpen: id => scene.focus(id), onClose: () => {} });
  function openChat(id) { chat.open(id); }

  // ---------- per-frame label placement
  let fpsT = 0;
  function onFrame(S) {
    const z = S.cam.z;
    for (const { el, at } of roomTags) { const p = scene.toScreen(at[0], at[1]); el.classList.toggle('tiny', z < 0.6); el.style.visibility = scene.S.gathered && el.classList.contains('private') ? 'hidden' : ''; el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -50%)`; }
    for (const ag of agents) {
      const el = tags.get(ag.id), hp = scene.headPoint(ag.id); if (!hp) continue;
      const p = scene.toScreen(hp.x, hp.y - 6), box = scene.spriteBox(S.agents.get(ag.id));
      const big = box.h * z > 88 || S.focusId === ag.id;
      el.classList.toggle('small', !big);
      el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -100%)`;
    }
    youTag.hidden = !S.walk;
    if (S.walk && S.avatar) {
      const av = S.avatar, bx = scene.spriteBox(av);
      const p = scene.toScreen(av.pos.x, bx.y - 4); youTag.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) translate(-50%, -100%)`;
      let near = null, nd = 1e9; for (const ag of S.agents.values()) { const d = Math.hypot(ag.seat.x - av.pos.x, ag.seat.y - av.pos.y); if (d < nd) { nd = d; near = ag; } }
      const tp = $('talkPrompt'); if (near && nd < 80) { tp.hidden = false; tp.textContent = `💬 احجي ويا ${near.agent.person}`; tp.dataset.id = near.id; } else tp.hidden = true;
    } else $('talkPrompt').hidden = true;
    if ((fpsT += 1) % 30 === 0) $('fps').textContent = `${Math.round(S.fps)} fps`;
    window.__office = { fps: S.fps, agents: S.agents.size, walk: S.walk, gathered: S.gathered, view: S.view, zoom: +z.toFixed(3) };
  }
  $('talkPrompt').addEventListener('click', e => openChat(e.currentTarget.dataset.id));
  addEventListener('keydown', e => { if (e.key.toLowerCase() === 'e' && !$('talkPrompt').hidden && !e.target.closest('textarea')) openChat($('talkPrompt').dataset.id); });

  // ---------- buttons
  $('modeBtn').addEventListener('click', () => setWalk(!scene.S.walk));
  let helpT = 0;
  function setWalk(on) {
    scene.setWalk(on); $('modeBtn').classList.toggle('on', on); $('modeBtn').title = on ? 'إيقاف المشي' : 'وضع المشي';
    $('modeBtn').innerHTML = on ? '✋<span class="lbl"> إيقاف</span>' : '🚶<span class="lbl"> مشي</span>';
    $('joystick').hidden = !on; showHelp(on);
  }
  function showHelp(on) {
    const h = $('walkHelp'); clearTimeout(helpT); h.classList.remove('fade'); h.hidden = !on || localStorage.getItem('walkHelpDismissed') === '1';
    if (!h.hidden) helpT = setTimeout(() => { h.classList.add('fade'); helpT = setTimeout(() => { h.hidden = true; }, 450); }, 5000);
  }
  $('walkHelp').querySelector('button').addEventListener('click', () => { localStorage.setItem('walkHelpDismissed', '1'); $('walkHelp').hidden = true; });
  function setGather(on) {
    if (scene.S.gathered !== on) scene.gather(on);
    $('gatherBtn').classList.toggle('on', on); $('roomsBtn').classList.toggle('on', !on);
    $('gatherBtn').setAttribute('aria-pressed', on); $('roomsBtn').setAttribute('aria-pressed', !on);
    if (!scene.S.walk) { scene.fit('house'); if (on && scene.S.camT.z < 0.6) scene.focusRoom('hall'); } // small screens: zoom into the family hall
  }
  $('roomsBtn').addEventListener('click', () => setGather(false));
  $('gatherBtn').addEventListener('click', () => setGather(true));
  $('resetBtn').addEventListener('click', () => { if (scene.S.walk) setWalk(false); scene.fit('house'); });

  // joystick
  const joy = $('joystick'), knob = joy.querySelector('.knob'); let jid = null;
  joy.addEventListener('pointerdown', e => { jid = e.pointerId; joy.setPointerCapture(jid); moveJoy(e); });
  joy.addEventListener('pointermove', e => { if (e.pointerId === jid) moveJoy(e); });
  const endJoy = () => { jid = null; scene.S.joy = { x: 0, y: 0 }; knob.style.transform = ''; };
  joy.addEventListener('pointerup', endJoy); joy.addEventListener('pointercancel', endJoy);
  function moveJoy(e) { const r = joy.getBoundingClientRect(); let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2); const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; } scene.S.joy = { x, y }; knob.style.transform = `translate(${x * 34}px, ${y * 34}px)`; }

  // header clock / greeting
  const tick = () => { const d = new Date(), h = d.getHours(); $('greet').textContent = h < 5 ? 'مساء الخير 🌙' : h < 12 ? 'صباح الخير ☀' : h < 18 ? 'مساء الخير' : 'مساء الخير 🌙'; $('clock').textContent = d.toLocaleString('ar-IQ', { weekday: 'long', hour: '2-digit', minute: '2-digit' }); };
  tick(); setInterval(tick, 30000);

  ready = true;
  startStatusFeed(onStatus);
  if (qs.get('walk') === '1') setWalk(true);
  if (qs.get('gather') === '1' || qs.get('mode') === 'gather') setGather(true);
  if (qs.get('room')) scene.focusRoom(qs.get('room'));
  if (qs.get('sheet') === '1') $('teamHead').click();
  if (qs.get('chat')) setTimeout(() => openChat(qs.get('chat')), 300);
  setTimeout(() => $('loading').classList.add('hide'), 150);
}
if ('serviceWorker' in navigator && isSecureContext && !qs.has('nosw')) addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
boot().catch(e => { console.error(e); $('loading').textContent = 'صار خطأ بالتحميل: ' + e.message; });
