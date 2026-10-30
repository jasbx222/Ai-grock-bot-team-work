// Agents are DATA: they are loaded from agents.json (see public/agents.json).
// Any agent listed there - or any unknown id that shows up in status.json -
// automatically gets a character, a desk, a name label, a chat panel and a
// status entry. No code change needed.
import { CONFIG } from './config.js';

export const STATUS_LABELS = { working: 'يشتغل', waiting: 'ينتظر', problem: 'عنده مشكلة', done: 'خلّص', offline: 'غير متصل' };

// Built-in fallback (used only if agents.json cannot be loaded)
export const FALLBACK_AGENTS = [
  { id: 'dev01b', agentName: 'dev 01 b', person: 'سيمبا', role: 'مبرمج فول ستاك ومصمم', art: 'dev01b' },
  { id: 'planbot', agentName: 'plan bot', person: 'مشمش', role: 'تخطيط وتطوير', art: 'planbot' },
  { id: 'dawrli', agentName: 'dawrli dev', person: 'بسكت', role: 'مبرمج تطبيقات', art: 'dawrli' },
  { id: 'marketing', agentName: 'Marketing and Advertising', person: 'لولو', role: 'قسم التسويق', art: 'marketing' },
  { id: 'messaging', agentName: 'المراسلات رفيور', person: 'جون', role: 'مطور ورفيور مراسلات', art: 'messaging' },
];

// Illustrated characters shipped in public/art. Each key has 4 files:
//   sit_<key>.png (at the desk), idle_<key>.png (standing with tea),
//   walk_<key>.png (walking), face_<key>.jpg (round avatar)
export const ART_KEYS = ['dev01b', 'planbot', 'dawrli', 'marketing', 'messaging', 'generic1', 'generic2'];
// characters handed out automatically to new agents that have no "art"
export const GENERIC_ART = ['generic1', 'generic2'];

export function hashId(id) { // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (const ch of String(id)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export function artPaths(art) {
  if (art && typeof art === 'object') return art; // custom paths { sit, idle, walk, face }
  return { key: art, sit: `art/sit_${art}.png`, idle: `art/idle_${art}.png`, walk: `art/walk_${art}.png`, face: `art/face_${art}.jpg` };
}

// Default character for an id: its own art if it exists, else a generic one
// picked deterministically from the id hash (same id -> same person, always).
export function defaultArt(id) {
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
