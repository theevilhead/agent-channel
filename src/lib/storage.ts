import type { ChannelState } from "./types";

const STORAGE_KEY = "agent-channel:v1";

export const initialState: ChannelState = {
  gatewayPort: 8765,
  activeAgentId: "hermes",
  agents: [
    {
      id: "hermes",
      name: "Hermes",
      provider: "hermes",
      description: "Nous Hermes Agent through the local Hermes API gateway.",
      endpoint: "http://127.0.0.1:8642",
      status: "offline",
      unread: 0,
    },
  ],
  messages: [
    {
      id: "welcome-hermes",
      agentId: "hermes",
      role: "system",
      body:
        "Hermes is configured for http://127.0.0.1:8642. Start Hermes with `API_SERVER_ENABLED=true API_SERVER_CORS_ORIGINS=http://127.0.0.1:1420 hermes gateway run --replace` before sending.",
      createdAt: new Date().toISOString(),
      status: "received",
    },
  ],
};

export function loadState(): ChannelState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as ChannelState;
    return {
      ...initialState,
      ...parsed,
      agents: parsed.agents?.length ? parsed.agents : initialState.agents,
      messages: parsed.messages ?? initialState.messages,
    };
  } catch {
    return initialState;
  }
}

export function saveState(state: ChannelState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}
