use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    net::SocketAddr,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use tauri::{AppHandle, Emitter, Manager};
use tokio::net::TcpListener;

#[derive(Default)]
struct GatewayState {
    running: AtomicBool,
}

#[derive(Debug, Deserialize, Serialize)]
struct HermesMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HermesChatRequest {
    endpoint: String,
    api_key: Option<String>,
    session_id: String,
    messages: Vec<HermesMessage>,
}

#[derive(Debug, Serialize)]
struct HermesChatResponse {
    text: String,
    raw: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct InboundAgentMessage {
    text: String,
    source: Option<String>,
    reply_to: Option<String>,
    metadata: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Clone)]
struct AgentMessageEvent {
    agent_id: String,
    text: String,
}

#[tauri::command]
async fn send_hermes_chat(request: HermesChatRequest) -> Result<HermesChatResponse, String> {
    let endpoint = request.endpoint.trim_end_matches('/');
    let url = format!("{endpoint}/v1/chat/completions");

    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    if let Some(api_key) = request.api_key.as_deref().filter(|value| !value.is_empty()) {
        let token = format!("Bearer {api_key}");
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&token).map_err(|error| format!("Invalid Hermes API key header: {error}"))?,
        );
        headers.insert(
            "X-Hermes-Session-Id",
            HeaderValue::from_str(&request.session_id).map_err(|error| format!("Invalid Hermes session id: {error}"))?,
        );
    }

    let body = json!({
        "model": "hermes-agent",
        "stream": false,
        "messages": request.messages,
    });

    let response = reqwest::Client::new()
        .post(url)
        .headers(headers)
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("Could not reach Hermes: {error}"))?;

    let status = response.status();
    let raw: serde_json::Value = response
        .json()
        .await
        .map_err(|error| format!("Hermes returned an unreadable response: {error}"))?;

    if !status.is_success() {
        return Err(format!("Hermes returned {status}: {raw}"));
    }

    let text = raw
        .pointer("/choices/0/message/content")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();

    Ok(HermesChatResponse { text, raw })
}

#[tauri::command]
async fn start_local_gateway(app: AppHandle, port: u16) -> Result<u16, String> {
    let state = app.state::<Arc<GatewayState>>();
    if state.running.swap(true, Ordering::SeqCst) {
        return Ok(port);
    }

    let listener = TcpListener::bind(("127.0.0.1", port))
        .await
        .map_err(|error| {
            state.running.store(false, Ordering::SeqCst);
            format!("Could not bind local gateway on 127.0.0.1:{port}: {error}")
        })?;
    let local_addr = listener
        .local_addr()
        .map_err(|error| format!("Could not read local gateway address: {error}"))?;
    let actual_port = local_addr.port();

    let router = Router::new()
        .route("/health", get(health))
        .route("/agents/{agent_id}/messages", post(inbound_agent_message))
        .with_state(app.clone());

    tauri::async_runtime::spawn(async move {
        if let Err(error) = axum::serve(listener, router.into_make_service_with_connect_info::<SocketAddr>()).await {
            let _ = app.emit(
                "agent-message",
                AgentMessageEvent {
                    agent_id: "hermes".to_string(),
                    text: format!("Agent Channel gateway stopped: {error}"),
                },
            );
        }
    });

    Ok(actual_port)
}

async fn health() -> impl IntoResponse {
    Json(json!({
        "status": "ok",
        "service": "agent-channel",
        "mode": "local-gateway"
    }))
}

async fn inbound_agent_message(
    State(app): State<AppHandle>,
    Path(agent_id): Path<String>,
    Json(payload): Json<InboundAgentMessage>,
) -> impl IntoResponse {
    let _metadata = (&payload.source, &payload.reply_to, &payload.metadata);
    let text = payload.text.trim();
    if text.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "text is required" })));
    }

    match app.emit(
        "agent-message",
        AgentMessageEvent {
            agent_id,
            text: text.to_string(),
        },
    ) {
        Ok(_) => (StatusCode::ACCEPTED, Json(json!({ "ok": true }))),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("emit failed: {error}") })),
        ),
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(Arc::new(GatewayState::default()))
        .invoke_handler(tauri::generate_handler![send_hermes_chat, start_local_gateway])
        .run(tauri::generate_context!())
        .expect("error while running Agent Channel");
}
