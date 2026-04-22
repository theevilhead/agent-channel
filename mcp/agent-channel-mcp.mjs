#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const DEFAULT_AGENT_CHANNEL_URL = "http://127.0.0.1:8765";
const agentChannelUrl = (process.env.AGENT_CHANNEL_URL || DEFAULT_AGENT_CHANNEL_URL).replace(/\/$/, "");

const server = new Server(
  {
    name: "agent-channel",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

const tools = [
  {
    name: "agent_channel_send_message",
    description:
      "Send a message into the Agent Channel desktop app. Use this when the user asks Hermes to message Agent Channel or send a desktop chat update.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description:
            "Thread/agent identifier in Agent Channel. Use 'hermes' for Hermes' direct thread unless the user specifies another agent.",
          default: "hermes",
        },
        text: {
          type: "string",
          description: "Message text to deliver into the Agent Channel thread.",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "agent_channel_status",
    description: "Check whether the Agent Channel desktop app local gateway is reachable.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

function asText(content) {
  return {
    content: [
      {
        type: "text",
        text: typeof content === "string" ? content : JSON.stringify(content, null, 2),
      },
    ],
  };
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  if (name === "agent_channel_status") {
    try {
      const response = await fetch(`${agentChannelUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      const body = await readResponse(response);
      if (!response.ok) {
        return asText({
          ok: false,
          status: response.status,
          agent_channel_url: agentChannelUrl,
          response: body,
        });
      }
      return asText({
        ok: true,
        agent_channel_url: agentChannelUrl,
        response: body,
      });
    } catch (error) {
      return asText({
        ok: false,
        agent_channel_url: agentChannelUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (name === "agent_channel_send_message") {
    const agentId = String(args.agent_id || "hermes").trim();
    const text = String(args.text || "").trim();

    if (!agentId) {
      throw new Error("agent_id cannot be empty");
    }
    if (!text) {
      throw new Error("text is required");
    }

    const response = await fetch(`${agentChannelUrl}/agents/${encodeURIComponent(agentId)}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        source: "hermes-mcp",
      }),
      signal: AbortSignal.timeout(10000),
    });
    const body = await readResponse(response);
    if (!response.ok) {
      throw new Error(`Agent Channel returned HTTP ${response.status}: ${JSON.stringify(body)}`);
    }

    return asText({
      ok: true,
      agent_id: agentId,
      delivered_to: `${agentChannelUrl}/agents/${agentId}/messages`,
      response: body,
    });
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
