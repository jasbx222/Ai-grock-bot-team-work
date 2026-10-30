// The ONLY place that talks to agents.
// Live mode (CONFIG.apiBaseUrl set): office-relay backend
//   POST /api/agents/{id}/messages {text}      -> stored + forwarded to the agent's webhook
//   GET  /api/agents/{id}/messages?after=ID    -> real replies posted by the agent
// Demo mode (no apiBaseUrl): local replies, always labelled «ردّ تجريبي».
import { isLive, api } from './config.js';

export const DEMO_LABEL = 'ردّ تجريبي';
export const NOT_LINKED = 'لم يُربط بعد';

export function isDemoMode() { return !isLive(); }

/** Live: send a message. Returns { message, connected, notice } */
export async function sendLive(agentId, text) {
  return api(`/agents/${encodeURIComponent(agentId)}/messages`, { method: 'POST', body: JSON.stringify({ text }) });
}

/** Live: fetch messages (after = last seen id, or null for the latest history). */
export async function fetchLive(agentId, after) {
  const q = after ? `?after=${after}` : '';
  return api(`/agents/${encodeURIComponent(agentId)}/messages${q}`);
}

/** Demo mode only. */
export async function sendMessage(agentId, text, ctx = {}) {
  return demoReply(agentId, text, ctx);
}

// ---- demo replies: generated locally, always labelled, never pretend to be real
async function demoReply(agentId, text, { agent, status } = {}) {
  const name = agent ? agent.person : agentId;
  const st = status?.status;
  const task = status?.task;
  let body;
  if (/شلون|كيف|اخبار|أخبار/.test(text)) body = `هلا! أني ${name}. الحمد لله بخير.`;
  else if (/شنو|شتسوي|ديشتغل|تشتغل/.test(text) && task) body = `حالياً: «${task}».`;
  else if (st === 'problem') body = `عندي مشكلة: ${status.reason || 'غير محددة'}. أحتاج قرارك.`;
  else if (st === 'done') body = `خلّصت «${task || 'المهمة'}»${status.result ? ' — ' + status.result : ''}.`;
  else if (st === 'working') body = `وصلت رسالتك. دأشتغل على «${task || 'مهمة'}» وأرجعلك.`;
  else body = 'وصلت رسالتك، أني بالانتظار.';
  const delay = 600 + Math.random() * 700;
  await new Promise(r => setTimeout(r, delay));
  return { text: `${body}\n(هذا ردّ تجريبي محلي، مو من الوكيل الحقيقي)`, demo: true };
}
