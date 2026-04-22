import { invoke } from "@tauri-apps/api/core";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import type { HermesChatRequest, HermesChatResponse } from "./types";

export const isTauriRuntime = "__TAURI_INTERNALS__" in window;

export async function sendHermesChat(request: HermesChatRequest): Promise<HermesChatResponse> {
  if (isTauriRuntime) {
    return invoke<HermesChatResponse>("send_hermes_chat", { request });
  }

  const response = await fetch(`${request.endpoint.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(request.apiKey ? { Authorization: `Bearer ${request.apiKey}` } : {}),
      ...(request.apiKey ? { "X-Hermes-Session-Id": request.sessionId } : {}),
    },
    body: JSON.stringify({
      model: "hermes-agent",
      stream: false,
      messages: request.messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`Hermes returned ${response.status}`);
  }

  const data = await response.json();
  return {
    text: data?.choices?.[0]?.message?.content ?? "",
    raw: data,
  };
}

export async function startGateway(port: number): Promise<number | null> {
  if (!isTauriRuntime) return null;
  return invoke<number>("start_local_gateway", { port });
}

export async function notifyAgentMessage(title: string, body: string) {
  if (isTauriRuntime) {
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === "granted";
    }
    if (granted) {
      sendNotification({ title, body });
    }
    return;
  }

  if ("Notification" in window) {
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission === "granted") {
      new Notification(title, { body });
    }
  }
}
