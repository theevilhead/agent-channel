export type AgentStatus = "online" | "offline" | "connecting" | "error";

export type AgentProvider = "hermes" | "local";

export type ChatMessage = {
  id: string;
  agentId: string;
  role: "user" | "agent" | "system";
  body: string;
  createdAt: string;
  status: "sending" | "sent" | "received" | "failed";
  error?: string;
};

export type AgentThread = {
  id: string;
  name: string;
  provider: AgentProvider;
  description: string;
  endpoint: string;
  status: AgentStatus;
  unread: number;
  lastSeenAt?: string;
  lastMessageAt?: string;
};

export type ChannelState = {
  agents: AgentThread[];
  messages: ChatMessage[];
  activeAgentId: string;
  gatewayPort: number;
};

export type HermesRequestMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type HermesChatRequest = {
  endpoint: string;
  apiKey?: string;
  sessionId: string;
  messages: HermesRequestMessage[];
};

export type HermesChatResponse = {
  text: string;
  raw?: unknown;
};
