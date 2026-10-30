// Runtime configuration. Can be overridden before the app loads by defining
// window.AGENT_OFFICE_CONFIG = { chatEndpoint: '...', statusUrl: '...' }
// (the Flutter app does this through a small inline script if needed).
const defaults = {
  // URL of the status file polled every 5 s. Relative so it works from any folder.
  statusUrl: 'status.json',
  // List of agents (characters are generated from it). Override per page with ?agents=file.json
  agentsUrl: 'agents.json',
  statusPollMs: 5000,
  // Chat backend. null = demo mode (clearly labelled demo replies, nothing leaves the page).
  // To plug a real backend later, set an URL here; see chatAdapter.js for the expected contract.
  chatEndpoint: null,
  chatHeaders: {},
};
export const CONFIG = Object.assign({}, defaults, (typeof window !== 'undefined' && window.AGENT_OFFICE_CONFIG) || {});
