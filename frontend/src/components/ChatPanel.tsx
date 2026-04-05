import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { API_BASE } from "../hooks/useApi";
import { useI18n } from "../i18n";
import { useChatBridge } from "../chatBridge";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface PendingConfirm {
  thread_id: string;
  tool_calls: Array<{ name: string; args: Record<string, unknown> }>;
}

interface Profile {
  preferred_strategies: string[];
  risk_tolerance: string;
  preferred_tickers: string[];
  typical_dte_range: string | null;
  delta_preference: string | null;
  position_sizing: string | null;
  notes: string[];
}

export default function ChatPanel() {
  const { t } = useI18n();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(() =>
    localStorage.getItem("chat_thread_id")
  );
  const [profile, setProfile] = useState<Profile | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [confirmData, setConfirmData] = useState<PendingConfirm | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { register } = useChatBridge();

  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 150) + "px";
  }, []);

  const sendRef = useRef<((directText?: string) => Promise<void>) | null>(null);

  useEffect(() => {
    register((text: string, autoSubmit?: boolean) => {
      setMinimized(false);
      if (autoSubmit) {
        sendRef.current?.(text);
        return;
      }
      setInput((prev) => {
        const sep = prev.trim() ? "\n" : "";
        return prev + sep + text;
      });
      setTimeout(() => {
        const el = inputRef.current;
        if (!el) return;
        autoResize();
        el.focus();
        el.scrollTop = el.scrollHeight;
        el.selectionStart = el.selectionEnd = el.value.length;
      }, 50);
    });
  }, [register, autoResize]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  useEffect(() => {
    if (!threadId || historyLoaded) return;
    fetch(`${API_BASE}/chat/history/${threadId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.messages?.length > 0) {
          setMessages(data.messages);
        }
      })
      .catch(() => {})
      .finally(() => setHistoryLoaded(true));
  }, [threadId, historyLoaded]);

  useEffect(() => {
    fetch(`${API_BASE}/profile`)
      .then((r) => r.json())
      .then((data) => setProfile(data.profile))
      .catch(() => {});
  }, []);

  const refreshProfile = useCallback(() => {
    fetch(`${API_BASE}/profile`)
      .then((r) => r.json())
      .then((data) => setProfile(data.profile))
      .catch(() => {});
  }, []);

  const consumeSSE = useCallback(async (response: Response) => {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    if (!reader) throw new Error("No response body");

    let currentEvent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          const raw = line.slice(6);
          try {
            const parsed = JSON.parse(raw);

            if (currentEvent === "thread_id" && parsed.thread_id) {
              setThreadId(parsed.thread_id);
              localStorage.setItem("chat_thread_id", parsed.thread_id);
            } else if (currentEvent === "token" && parsed.content) {
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    content: last.content + parsed.content,
                  };
                }
                return updated;
              });
            } else if (currentEvent === "confirm") {
              setConfirmData({
                thread_id: parsed.thread_id,
                tool_calls: parsed.tool_calls,
              });
            }
          } catch {
            // skip malformed SSE data
          }
          currentEvent = "";
        }
      }
    }
  }, []);

  const sendMessage = useCallback(async (directText?: string) => {
    const text = (directText ?? input).trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setLoading(true);

    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          thread_id: threadId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      await consumeSSE(response);
      refreshProfile();
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last.role === "assistant" && !last.content) {
          updated[updated.length - 1] = {
            ...last,
            content: `Error: ${err instanceof Error ? err.message : "Connection failed"}`,
          };
        }
        return updated;
      });
    } finally {
      setLoading(false);
    }
  }, [input, loading, threadId, refreshProfile, consumeSSE]);
  sendRef.current = sendMessage;

  const handleConfirm = useCallback(async (approved: boolean) => {
    if (!confirmData) return;
    const savedConfirm = confirmData;
    setConfirmData(null);
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/chat/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: savedConfirm.thread_id,
          approved,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      if (approved) {
        setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      }
      await consumeSSE(response);
      refreshProfile();
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last.role === "assistant") {
          updated[updated.length - 1] = {
            ...last,
            content: `Error: ${err instanceof Error ? err.message : "Connection failed"}`,
          };
        }
        return updated;
      });
    } finally {
      setLoading(false);
    }
  }, [confirmData, consumeSSE, refreshProfile]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startNewThread = () => {
    setMessages([]);
    setThreadId(null);
    setHistoryLoaded(false);
    localStorage.removeItem("chat_thread_id");
  };

  const profileTags = (() => {
    if (!profile) return [];
    const tags: string[] = [];
    if (profile.preferred_strategies.length > 0) {
      tags.push(...profile.preferred_strategies);
    }
    if (profile.risk_tolerance && profile.risk_tolerance !== "unknown") {
      tags.push(profile.risk_tolerance);
    }
    if (profile.preferred_tickers.length > 0) {
      tags.push(...profile.preferred_tickers);
    }
    return tags;
  })();

  return (
    <div className={`chat-panel${minimized ? " chat-panel-minimized" : ""}`}>
      <div className="chat-header">
        <div className="chat-header-left">
          <h3>{t("aiAssistant")}</h3>
          {!minimized && profileTags.length > 0 && (
            <button
              className="profile-toggle"
              onClick={() => setShowProfile(!showProfile)}
              title={t("tradingProfile")}
            >
              {profileTags.length}{t("preferences")}
            </button>
          )}
          {minimized && messages.length > 0 && (
            <span className="chat-minimized-badge">
              {messages.length}{t("messages")}
            </span>
          )}
        </div>
        <div className="chat-header-actions">
          <button
            className="chat-minimize-btn"
            onClick={() => setMinimized(!minimized)}
            title={minimized ? t("expand") : t("minimize")}
          >
            {minimized ? "+" : "\u2013"}
          </button>
          {!minimized && (
            <button className="new-thread-btn" onClick={startNewThread}>
              {t("newChat")}
            </button>
          )}
        </div>
      </div>

      {!minimized && (
        <>
          {showProfile && profile && (
            <div className="profile-card">
              <div className="profile-title">{t("tradingProfile")}</div>
              {profile.preferred_strategies.length > 0 && (
                <div className="profile-row">
                  <span className="profile-label">{t("strategyPref")}</span>
                  <span>{profile.preferred_strategies.join(", ")}</span>
                </div>
              )}
              {profile.risk_tolerance !== "unknown" && (
                <div className="profile-row">
                  <span className="profile-label">{t("riskPref")}</span>
                  <span>{profile.risk_tolerance}</span>
                </div>
              )}
              {profile.preferred_tickers.length > 0 && (
                <div className="profile-row">
                  <span className="profile-label">{t("tickers")}</span>
                  <span>{profile.preferred_tickers.join(", ")}</span>
                </div>
              )}
              {profile.typical_dte_range && (
                <div className="profile-row">
                  <span className="profile-label">{t("dtePref")}</span>
                  <span>{profile.typical_dte_range}</span>
                </div>
              )}
              {profile.delta_preference && (
                <div className="profile-row">
                  <span className="profile-label">{t("deltaPref")}</span>
                  <span>{profile.delta_preference}</span>
                </div>
              )}
              {profile.notes.length > 0 && (
                <div className="profile-row">
                  <span className="profile-label">{t("notes")}</span>
                  <span>{profile.notes.slice(-3).join("; ")}</span>
                </div>
              )}
            </div>
          )}

          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">
                <div className="chat-empty-icon">θ</div>
                <p>{t("chatWelcome")}</p>
                <p className="chat-empty-hint">
                  {t("chatHint")}
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`chat-msg chat-msg-${msg.role}`}>
                <div className="chat-msg-avatar">
                  {msg.role === "user" ? "You" : "AI"}
                </div>
                <div className="chat-msg-content">
                  {msg.content ? (
                    msg.role === "assistant" ? (
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    ) : (
                      msg.content
                    )
                  ) : (
                    loading && i === messages.length - 1 ? "..." : ""
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {confirmData && (
            <div className="chat-confirm-bar">
              <div className="chat-confirm-title">{t("confirmTitle")}</div>
              <div className="chat-confirm-details">
                {confirmData.tool_calls.map((tc, i) => (
                  <div key={i} className="chat-confirm-tool">
                    <span className="chat-confirm-tool-name">{tc.name}</span>
                    <pre className="chat-confirm-tool-args">
                      {JSON.stringify(tc.args, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
              <div className="chat-confirm-actions">
                <button
                  className="chat-confirm-btn chat-confirm-yes"
                  onClick={() => handleConfirm(true)}
                >
                  {t("confirmYes")}
                </button>
                <button
                  className="chat-confirm-btn chat-confirm-no"
                  onClick={() => handleConfirm(false)}
                >
                  {t("confirmNo")}
                </button>
              </div>
            </div>
          )}

          <div className="chat-input-bar">
            <textarea
              ref={inputRef}
              className="chat-input"
              value={input}
              onChange={(e) => { setInput(e.target.value); autoResize(); }}
              onKeyDown={handleKeyDown}
              placeholder={t("chatPlaceholder")}
              rows={1}
              disabled={loading || !!confirmData}
            />
            <button
              className="chat-send-btn"
              onClick={() => sendMessage()}
              disabled={loading || !input.trim() || !!confirmData}
            >
              {loading ? "..." : t("send")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
