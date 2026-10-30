// Agents are DATA: they are loaded from agents.json (see public/agents.json).
// Any agent listed there - or any unknown id that shows up in status.json -
// automatically gets a character, a seat at the shared family table, a name
// label, a chat panel and a status entry. No code change needed.
import { CONFIG } from './config.js';

export const STATUS_LABELS = { working: 'يشتغل', waiting: 'ينتظر', problem: 'عنده مشكلة', done: 'خلّص', offline: 'غير متصل' };

// Built-in fallback (used only if agents.json cannot be loaded)
export const FALLBACK_AGENTS = [
  { id: 'dev01b', agentName: 'dev 01 b', person: 'يوسف', role: 'مبرمج فول ستاك ومصمم' },
  { id: 'planbot', agentName: 'plan bot', person: 'سارة', role: 'تخطيط وتطوير' },
  { id: 'dawrli', agentName: 'dawrli dev', person: 'علي', role: 'مبرمج تطبيقات' },
  { id: 'marketing', agentName: 'Marketing and Advertising', person: 'ليلى', role: 'قسم التسويق' },
  { id: 'messaging', agentName: 'المراسلات رفيور', person: 'جون', role: 'مطور ورفيور مراسلات' },
];

// ---------------------------------------------------------------------------
// Default look generator (documented): deterministic from the agent id.
// hash = FNV-1a 32-bit of the id; each trait reads different bits of the hash,
// so the same id always produces the same person. Any field given in
// agents.json "look" overrides the generated value.
// ---------------------------------------------------------------------------
const SKIN = [0xf1c8a8, 0xe8bfa0, 0xe0b392, 0xd9a07c, 0xc68e6a, 0xb98060, 0xa8734f, 0x8d5a3b, 0x6e4430];
const HAIR = [0x0f0c0a, 0x1d1410, 0x2a1a12, 0x4a2a17, 0x6b4226, 0x8a5a32, 0xb07a45, 0x3a3a3a, 0x7a2a1a];
const STYLES_M = ['short', 'curly', 'short'];
const STYLES_F = ['bob', 'long', 'hijab', 'long'];
const SHIRTS = [0x2f5d8a, 0x9b3d4a, 0x3f6b4a, 0xd88a3a, 0x37707f, 0x7a4a8a, 0xb5653f, 0x5a6b3a, 0x8a5a3c, 0x4f8a8b];
const PANTS = [0x2b2f3a, 0x30343f, 0x3a3229, 0x283044, 0x2a2a30, 0x4a3a2a];
const SHOES = [0x2a1d14, 0x1c1c1c, 0x3b2a1e, 0x5a2b1f];
const BLANKETS = [0xc8693f, 0xe9dcc4, 0x4f8a8b, 0xd9a441, 0x8a5a3c, 0xa65d3f, 0x6b8f6a];
const HIJAB = [0x6b4a8a, 0x8a3b3b, 0x37707f, 0xc8a165, 0x3a4a6a];

export function hashId(id) {
  let h = 0x811c9dc5;
  for (const ch of String(id)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export function defaultLook(id) {
  const h = hashId(id);
  const bits = (shift, n) => (h >>> shift) % n;
  const female = ((h >>> 1) & 1) === 1;
  const hairStyle = female ? STYLES_F[bits(3, STYLES_F.length)] : STYLES_M[bits(3, STYLES_M.length)];
  return {
    female,
    skin: SKIN[bits(6, SKIN.length)],
    hair: hairStyle === 'hijab' ? HIJAB[bits(10, HIJAB.length)] : HAIR[bits(10, HAIR.length)],
    hairStyle,
    beard: !female && ((h >>> 14) & 3) !== 0,
    glasses: ((h >>> 17) & 3) === 0,
    shirt: SHIRTS[bits(19, SHIRTS.length)],
    pants: PANTS[bits(23, PANTS.length)],
    shoes: SHOES[bits(26, SHOES.length)],
  };
}

const parseColor = v => (typeof v === 'string' ? parseInt(v.replace('#', ''), 16) : v);

// Fill in everything an agent needs from whatever agents.json provides.
export function normalizeAgent(raw) {
  const id = String(raw.id);
  const gen = defaultLook(id);
  const look = { ...gen };
  for (const [k, v] of Object.entries(raw.look || {})) look[k] = /skin|hair$|shirt|pants|shoes/.test(k) && k !== 'hairStyle' ? parseColor(v) : v;
  if (raw.look && raw.look.hairStyle && raw.look.female === undefined) look.female = ['bob', 'long', 'hijab'].includes(raw.look.hairStyle);
  const h = hashId(id);
  return {
    id,
    agentName: raw.agentName || id,
    person: raw.person || raw.agentName || id,
    role: raw.role || 'عضو بالفريق',
    look,
    props: raw.props || ['monitor', 'tea', ...(h & 4 ? ['laptop'] : [])],
    blanket: raw.blanket !== undefined ? parseColor(raw.blanket) : BLANKETS[h % BLANKETS.length],
  };
}

export async function loadAgents() {
  const url = new URLSearchParams(location.search).get('agents') || CONFIG.agentsUrl;
  try {
    const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    const list = Array.isArray(data) ? data : data.agents;
    return { url, agents: list.map(normalizeAgent), source: 'file' };
  } catch (e) {
    console.info('agents.json not available, using built-in list', e.message);
    return { url, agents: FALLBACK_AGENTS.map(normalizeAgent), source: 'fallback' };
  }
}
