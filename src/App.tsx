import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { AgentList } from "./components/AgentList";
import { MessagePane } from "./components/MessagePane";
import { initialState, loadState, makeId, saveState } from "./lib/storage";
import { isTauriRuntime, notifyAgentMessage, sendHermesChat, startGateway } from "./lib/tauri";
import type { ChannelState, ChatMessage } from "./lib/types";
import "./styles/app.css";

type InboundAgentMessage = {
  agent_id: string;
  text: string;
};

function explainHermesFailure(error: unknown, endpoint: string) {
  const raw = error instanceof Error ? error.message : "Hermes request failed.";
  const setupCommand =
    "API_SERVER_ENABLED=true API_SERVER_CORS_ORIGINS=http://127.0.0.1:1420 hermes gateway run --replace";

  if (
    raw.includes("Failed to fetch") ||
    raw.includes("Could not reach Hermes") ||
    raw.includes("Connection refused") ||
    raw.includes("Couldn't connect") ||
    raw.includes("error trying to connect")
  ) {
    return {
      body: `Hermes gateway is running, but the API server is not reachable at ${endpoint}.`,
      error: `Restart Hermes with: ${setupCommand}`,
    };
  }

  if (raw.includes("403") || raw.toLowerCase().includes("cors")) {
    return {
      body: "Hermes rejected the browser request. This usually means CORS is not enabled for the dev server.",
      error: `Restart Hermes with: ${setupCommand}`,
    };
  }

  return {
    body: "Hermes did not respond.",
    error: raw,
  };
}

export default function App() {
  const [state, setState] = useState<ChannelState>(() => loadState());
  const [composer, setComposer] = useState("");
  const [busyAgentId, setBusyAgentId] = useState<string | null>(null);
  const gatewayStartedRef = useRef(false);

  const activeAgent = useMemo(
    () => state.agents.find((agent) => agent.id === state.activeAgentId) ?? state.agents[0] ?? initialState.agents[0],
    [state.activeAgentId, state.agents],
  );

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    if (!isTauriRuntime || gatewayStartedRef.current) return;
    gatewayStartedRef.current = true;
    startGateway(state.gatewayPort)
      .then((port) => {
        if (!port) return;
        patchState((current) => ({
          ...current,
          gatewayPort: port,
        }));
      })
      .catch((error) => {
        addSystemMessage(
          "hermes",
          error instanceof Error ? error.message : "Could not start the local Agent Channel gateway.",
        );
      });
  }, []);

  useEffect(() => {
    if (!isTauriRuntime) return;
    const unlisten = listen<InboundAgentMessage>("agent-message", (event) => {
      const payload = event.payload;
      receiveAgentMessage(payload.agent_id, payload.text);
    });
    return () => {
      unlisten.then((dispose) => dispose());
    };
  }, [state.activeAgentId]);

  function patchState(updater: (current: ChannelState) => ChannelState) {
    setState((current) => updater(current));
  }

  function setActiveAgent(agentId: string) {
    patchState((current) => ({
      ...current,
      activeAgentId: agentId,
      agents: current.agents.map((agent) => (agent.id === agentId ? { ...agent, unread: 0, lastSeenAt: new Date().toISOString() } : agent)),
    }));
  }

  function updateEndpoint(agentId: string, endpoint: string) {
    patchState((current) => ({
      ...current,
      agents: current.agents.map((agent) => (agent.id === agentId ? { ...agent, endpoint } : agent)),
    }));
  }

  async function handleStartGateway() {
    try {
      const port = await startGateway(state.gatewayPort);
      patchState((current) => ({
        ...current,
        gatewayPort: port ?? current.gatewayPort,
      }));
    } catch (error) {
      addSystemMessage(activeAgent.id, error instanceof Error ? error.message : "Could not start the local gateway.");
    }
  }

  function addMessage(message: ChatMessage) {
    patchState((current) => ({
      ...current,
      messages: [...current.messages, message],
      agents: current.agents.map((agent) =>
        agent.id === message.agentId
          ? {
              ...agent,
              lastMessageAt: message.createdAt,
              status: message.role === "agent" ? "online" : agent.status,
            }
          : agent,
      ),
    }));
  }

  function addSystemMessage(agentId: string, body: string) {
    addMessage({
      id: makeId("system"),
      agentId,
      role: "system",
      body,
      createdAt: new Date().toISOString(),
      status: "received",
    });
  }

  async function receiveAgentMessage(agentId: string, body: string) {
    const createdAt = new Date().toISOString();
    const agent = state.agents.find((item) => item.id === agentId);
    const agentName = agent?.name ?? agentId;
    patchState((current) => ({
      ...current,
      messages: [
        ...current.messages,
        {
          id: makeId("agent"),
          agentId,
          role: "agent",
          body,
          createdAt,
          status: "received",
        },
      ],
      agents: current.agents.map((item) =>
        item.id === agentId
          ? {
              ...item,
              status: "online",
              lastMessageAt: createdAt,
              unread: current.activeAgentId === agentId ? item.unread : item.unread + 1,
            }
          : item,
      ),
    }));
    await notifyAgentMessage(agentName, body.slice(0, 160));
  }

  async function sendMessage() {
    const text = composer.trim();
    if (!text || busyAgentId) return;
    setComposer("");
    const agent = activeAgent;
    const outgoingId = makeId("user");
    const createdAt = new Date().toISOString();

    addMessage({
      id: outgoingId,
      agentId: agent.id,
      role: "user",
      body: text,
      createdAt,
      status: "sent",
    });

    if (agent.provider !== "hermes") {
      addSystemMessage(agent.id, "This provider is not wired yet.");
      return;
    }

    setBusyAgentId(agent.id);
    patchState((current) => ({
      ...current,
      agents: current.agents.map((item) => (item.id === agent.id ? { ...item, status: "connecting" } : item)),
    }));

    try {
      const history = state.messages
        .filter((message) => message.agentId === agent.id && (message.role === "user" || message.role === "agent"))
        .slice(-12)
        .map((message) => ({
          role: message.role === "agent" ? ("assistant" as const) : ("user" as const),
          content: message.body,
        }));

      const result = await sendHermesChat({
        endpoint: agent.endpoint,
        sessionId: `agent-channel-${agent.id}`,
        messages: [...history, { role: "user", content: text }],
      });

      await receiveAgentMessage(agent.id, result.text || "Hermes returned an empty response.");
    } catch (error) {
      const message = explainHermesFailure(error, agent.endpoint);
      addMessage({
        id: makeId("error"),
        agentId: agent.id,
        role: "system",
        body: message.body,
        createdAt: new Date().toISOString(),
        status: "failed",
        error: message.error,
      });
      patchState((current) => ({
        ...current,
        agents: current.agents.map((item) => (item.id === agent.id ? { ...item, status: "error" } : item)),
      }));
    } finally {
      setBusyAgentId(null);
    }
  }

  return (
    <div className="app-frame">
      <AgentList
        agents={state.agents}
        activeAgentId={state.activeAgentId}
        gatewayPort={state.gatewayPort}
        onSelect={setActiveAgent}
        onEndpointChange={updateEndpoint}
        onStartGateway={handleStartGateway}
      />
      <MessagePane
        agent={activeAgent}
        messages={state.messages}
        composer={composer}
        busy={busyAgentId === activeAgent.id}
        onComposerChange={setComposer}
        onSend={sendMessage}
      />
    </div>
  );
}
