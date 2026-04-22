import type { AgentThread } from "../lib/types";
import { PlugIcon, PulseIcon } from "./Icons";

type Props = {
  agents: AgentThread[];
  activeAgentId: string;
  gatewayPort: number;
  onSelect: (agentId: string) => void;
  onEndpointChange: (agentId: string, endpoint: string) => void;
  onStartGateway: () => void;
};

export function AgentList({ agents, activeAgentId, gatewayPort, onSelect, onEndpointChange, onStartGateway }: Props) {
  return (
    <aside className="agent-rail">
      <div className="brand-block">
        <div className="brand-mark">AC</div>
        <div>
          <h1>Agent Channel</h1>
          <p>Local desktop gateway</p>
        </div>
      </div>

      <button className="gateway-button" onClick={onStartGateway} title="Start the local inbound agent gateway">
        <PulseIcon />
        <span>Gateway :{gatewayPort}</span>
      </button>

      <div className="rail-section-label">Direct Threads</div>
      <div className="agent-list">
        {agents.map((agent) => (
          <button
            key={agent.id}
            className={`agent-row ${agent.id === activeAgentId ? "is-active" : ""}`}
            onClick={() => onSelect(agent.id)}
          >
            <span className={`status-dot is-${agent.status}`} />
            <span className="agent-row-copy">
              <strong>{agent.name}</strong>
              <small>{agent.provider}</small>
            </span>
            {agent.unread > 0 && <span className="unread-badge">{agent.unread}</span>}
          </button>
        ))}
      </div>

      <div className="endpoint-editor">
        <label htmlFor="hermes-endpoint">
          <PlugIcon />
          Hermes endpoint
        </label>
        <input
          id="hermes-endpoint"
          value={agents.find((agent) => agent.id === "hermes")?.endpoint ?? ""}
          onChange={(event) => onEndpointChange("hermes", event.target.value)}
          spellCheck={false}
        />
      </div>
    </aside>
  );
}
