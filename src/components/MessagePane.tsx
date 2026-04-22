import { FormEvent, useMemo, useRef } from "react";
import type { AgentThread, ChatMessage } from "../lib/types";
import { BellIcon, SendIcon } from "./Icons";

type Props = {
  agent: AgentThread;
  messages: ChatMessage[];
  composer: string;
  busy: boolean;
  onComposerChange: (value: string) => void;
  onSend: () => void;
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function MessagePane({ agent, messages, composer, busy, onComposerChange, onSend }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const visibleMessages = useMemo(() => messages.filter((message) => message.agentId === agent.id), [agent.id, messages]);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSend();
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  return (
    <main className="thread-shell">
      <header className="thread-header">
        <div>
          <div className="thread-kicker">One-to-one agent thread</div>
          <h2>{agent.name}</h2>
          <p>{agent.description}</p>
        </div>
        <div className="thread-state">
          <span className={`status-dot is-${agent.status}`} />
          <span>{agent.status}</span>
        </div>
      </header>

      <section className="message-stream" aria-live="polite">
        {visibleMessages.map((message) => (
          <article key={message.id} className={`message-bubble from-${message.role}`}>
            <div className="message-meta">
              <span>{message.role === "user" ? "You" : message.role === "agent" ? agent.name : "System"}</span>
              <time>{formatTime(message.createdAt)}</time>
              <span>{message.status}</span>
            </div>
            <div className="message-body">{message.body}</div>
            {message.error && <div className="message-error">{message.error}</div>}
          </article>
        ))}
        {busy && (
          <article className="message-bubble from-agent is-working">
            <div className="message-meta">
              <span>{agent.name}</span>
              <span>working</span>
            </div>
            <div className="typing-bars" aria-label={`${agent.name} is responding`}>
              <span />
              <span />
              <span />
            </div>
          </article>
        )}
      </section>

      <form className="composer" onSubmit={submit}>
        <div className="notification-note">
          <BellIcon />
          <span>Agent replies raise desktop notifications and update unread counts when this thread is not active.</span>
        </div>
        <div className="composer-row">
          <textarea
            ref={textareaRef}
            value={composer}
            onChange={(event) => onComposerChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
            placeholder={`Message ${agent.name}`}
            rows={2}
          />
          <button type="submit" disabled={busy || composer.trim().length === 0} title="Send message">
            <SendIcon />
          </button>
        </div>
      </form>
    </main>
  );
}
