// The ONLY place that sends chat messages. Swap the implementation here (or set
// CONFIG.chatEndpoint) to connect the office to real agents later.
//
// Contract used when CONFIG.chatEndpoint is set (this is a placeholder contract
// that you implement on your own server; no real API is assumed):
//   POST <chatEndpoint>   body: { agentId, text }
//   200 -> { reply: string }
import { CONFIG } from './config.js';

export const DEMO_LABEL = 'ردّ تجريبي';

export function isDemoMode() { return !CONFIG.chatEndpoint; }

/**
 * @param {string} agentId
 * @param {string} text
 * @param {{ agent?: object, status?: object }} [ctx] optional context for the demo replies
 * @returns {Promise<{ text: string, demo: boolean }>}
 */
export async function sendMessage(agentId, text, ctx = {}) {
  if (CONFIG.chatEndpoint) {
    const res = await fetch(CONFIG.chatEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...CONFIG.chatHeaders },
      body: JSON.stringify({ agentId, text }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { text: String(data.reply ?? ''), demo: false };
  }
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
