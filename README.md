# Agent Channel

Agent Channel is a chat workspace for connecting to your agents and carrying on direct conversations with them. It starts as a Tauri desktop app, with the goal of becoming available across platforms.

Most chat apps are built for human-to-human messaging. Agent Channel is built for agent conversations: direct agent threads, local gateways, desktop notifications, MCP integration, and eventually richer workflows that go beyond basic chat apps.

This is an experimental scratch project being built in public. It is intended for local development and exploration, not production use. The local gateway currently trusts loopback callers, message history is stored in desktop web storage, and hardening work such as gateway auth, endpoint validation, SQLite persistence, and encryption at rest is still planned.

This repository is GitHub-only for now and is not published as an npm package.

## Why

Agents need a different kind of chat surface than WhatsApp, Telegram, or other human-first messengers. A useful agent channel should understand agent identity, local tooling, async status updates, agent-to-app messages, per-agent capabilities, and workflows that may start as chat but turn into actions.

V1 keeps that idea small: one desktop app, one direct thread per agent, Hermes support first, and a local inbound gateway so agents can push updates back into the conversation.

## V1 Scope

- One direct thread per agent.
- Hermes connector through Hermes' OpenAI-compatible API gateway.
- Local message history in desktop storage.
- Unread counts per agent thread.
- Desktop notifications for agent replies.
- Local inbound gateway for agents that want to push messages into the app.

## Hermes Setup

Start Hermes with its messaging gateway and API server enabled. Hermes documents the API server as an OpenAI-compatible platform on `http://localhost:8642/v1`.

```bash
API_SERVER_ENABLED=true API_SERVER_CORS_ORIGINS=http://127.0.0.1:1420 hermes gateway run --replace
```

The CORS origin is only needed when testing Agent Channel in a browser with `npm run dev`. The packaged Tauri app sends Hermes traffic through the Rust backend and does not need browser CORS.

The desktop app defaults to:

```text
http://127.0.0.1:8642
```

If your Hermes API server uses a different port, edit the endpoint in the left sidebar.

## Local Agent Gateway

Click the `Gateway :8765` control in the app to start the local inbound gateway.

Agents can then push a message into their direct thread:

```bash
curl -X POST http://127.0.0.1:8765/agents/hermes/messages \
  -H "Content-Type: application/json" \
  -d '{"text":"Background task finished."}'
```

The app emits that message into the matching thread, increments unread count when another thread is active, and raises a desktop notification.

## Hermes MCP Tool

Agent Channel also ships a stdio MCP server so Hermes can call a tool to send
messages into the desktop app without patching Hermes as a first-class gateway.

The server exposes:

- `agent_channel_send_message`: deliver text to an Agent Channel thread.
- `agent_channel_status`: check whether the desktop gateway is reachable.

Register it with Hermes:

```bash
hermes mcp add agent-channel \
  --command node \
  --args /absolute/path/to/agent-channel/mcp/agent-channel-mcp.mjs
```

When prompted, enable the tools. Start Agent Channel, click `Gateway :8765`,
then ask Hermes to send a message to Agent Channel.

The equivalent persistent Hermes config entry is:

```yaml
mcp_servers:
  agent-channel:
    command: node
    args:
      - /absolute/path/to/agent-channel/mcp/agent-channel-mcp.mjs
    enabled: true
    tools:
      include:
        - agent_channel_send_message
        - agent_channel_status
```

## Development

Prerequisites:

- Node.js 22+
- Rust toolchain with Cargo
- Tauri system dependencies for your OS

Install and run:

```bash
npm install
npm run tauri dev
```

Frontend-only development:

```bash
npm install
npm run dev
```

The browser fallback can call Hermes directly, but CORS must be allowed by Hermes. The Tauri app uses the Rust backend as a local proxy, which avoids browser CORS problems.

## Architecture

- `src/` contains the React desktop UI and local persistence.
- `src/lib/tauri.ts` is the runtime boundary between browser fallback and Tauri commands.
- `src-tauri/src/lib.rs` contains native commands:
  - `send_hermes_chat` proxies messages to Hermes.
  - `start_local_gateway` opens a loopback HTTP endpoint for inbound agent messages.

## Next Phase

- Add auth for the local inbound gateway.
- Validate and constrain agent endpoint configuration.
- Move message persistence from localStorage to native SQLite.
- Add encryption at rest.
- Add agent registration and per-agent credentials.
- Add shared channels after the direct-thread model is stable.

## License

MIT
