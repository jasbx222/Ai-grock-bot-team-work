// Agents are DATA: they are loaded from agents.json (see public/agents.json).
// Any agent listed there - or any unknown id that shows up in status.json -
// automatically gets a character, a desk, a name label, a chat panel and a
// status entry. No code change needed.
import { CONFIG, isLive, api } from './config.js';

export const STATUS_LABELS = { working: 'يشتغل', waiting: 'ينتظر', problem: 'عنده مشكلة', done: 'خلّص', offline: 'غير متصل' };

// Built-in fallback (used only if agents.json cannot be loaded)
export const FALLBACK_AGENTS = [
  { id: 'dev', agentName: 'dev', person: 'سيمبا', role: 'مبرمج فول ستاك' },
  { id: 'qa', agentName: 'QA', person: 'مشمش', role: 'فاحص جودة' },
  { id: 'uiux', agentName: 'UIUX', person: 'لولو', role: 'تصميم واجهات' },
  { id: 'pr-rev', agentName: 'PR-Rev', person: 'جون', role: 'مراجع طلبات الدمج' },
  { id: 'search', agentName: 'search', person: 'بسكت', role: 'باحث' },
  { id: 'support', agentName: 'الدعم الفني', person: 'زعتر', role: 'الدعم الفني' },
  { id: 'db-sync', agentName: 'dev-database sync app project', person: 'كراميل', role: 'تطبيق مزامنة قاعدة البيانات' },
];

// which illustrated character each agent id uses
export const ID_ART = { dev: 'dev01b', qa: 'planbot', uiux: 'marketing', 'pr-rev': 'messaging', search: 'dawrli', support: 'generic1', 'db-sync': 'generic2' };

// Illustrated characters shipped in public/art. Each key has 4 files:
//   sit_<key>.webp (at the desk), idle_<key>.webp (standing with tea),
//   walk4_<key>.webp (4-frame walk cycle, facing right), face_<key>.jpg (round avatar)
export const ART_KEYS = ['dev01b', 'planbot', 'dawrli', 'marketing', 'messaging', 'generic1', 'generic2'];
// characters handed out automatically to new agents that have no "art"
export const GENERIC_ART = ['generic1', 'generic2'];

export function hashId(id) { // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (const ch of String(id)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export function artPaths(art) {
  if (art && typeof art === 'object') return art; // custom paths { sit, idle, walk4 (4 frames, facing right) or walk, face }
  return { key: art, sit: `art/sit_${art}.webp`, idle: `art/idle_${art}.webp`, walk4: `art/walk4_${art}.webp`, face: `art/face_${art}.jpg` };
}

// Default character for an id: its own art if it exists, else a generic one
// picked deterministically from the id hash (same id -> same person, always).
// the owner (the human player) - not an agent, never part of agents.json
export const OWNER = { name: 'جاسم', art: { key: 'owner', idle: 'art/idle_owner.webp', walk4: 'art/walk4_owner.webp' } };

export function defaultArt(id) {
  if (ID_ART[id]) return ID_ART[id];
  if (ART_KEYS.includes(id)) return id;
  return GENERIC_ART[hashId(id) % GENERIC_ART.length];
}

export function normalizeAgent(raw) {
  const id = String(raw.id);
  const art = artPaths(raw.art || defaultArt(id));
  return {
    id,
    agentName: raw.agentName || id,
    person: raw.person || raw.agentName || id,
    role: raw.role || 'عضو بالفريق',
    art,
    face: art.face,
  };
}

export async function loadAgents() {
  if (isLive()) {
    try {
      const data = await api('/agents');
      return { url: `${CONFIG.apiBaseUrl}/api/agents`, agents: data.agents.map(normalizeAgent), source: 'api' };
    } catch (e) {
      console.info('agents from API not available, using agents.json', e.message);
    }
  }
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
