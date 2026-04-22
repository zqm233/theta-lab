"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, RotateCcw, Minimize2, Maximize2, User, Bot } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useChatBridge } from "@/lib/chat-bridge";
import { API_BASE } from "@/lib/api";
import ReactMarkdown from "react-markdown";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  toolCalls?: Array<{ name: string; args: any }>;
}

interface StreamChunk {
  type: "text" | "tool_call" | "done" | "error" | "confirm";
  content?: string;
  tool?: { name: string; args: any; id: string };
  error?: string;
  confirm?: { id: string; message: string };
}

export default function ChatPanel() {
  const { t } = useI18n();
  const { register } = useChatBridge();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [minimized, setMinimized] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<{ id: string; message: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Rule: rerender-dependencies - Use stable dependencies for effects
  useEffect(() => {
    scrollToBottom();
  }, [messages.length, streamingContent.length, scrollToBottom]);

  const handleSend = useCallback(async (text?: string, displayAs?: string) => {
    const messageText = text || input.trim();
    if (!messageText || streaming) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: displayAs || messageText,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setStreaming(true);
    setStreamingContent("");

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Rule: async-defer-await - Start fetch early, process later
      // v1 API: POST /threads/:thread_id/messages
      const fetchPromise = fetch(`${API_BASE}/threads/default/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText,
        }),
        signal: controller.signal,
      });

      const res = await fetchPromise;
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedContent = "";

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim() || !line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") {
            const assistantMessage: Message = {
              id: Date.now().toString(),
              role: "assistant",
              content: accumulatedContent,
              timestamp: new Date(),
            };
            setMessages((prev) => [...prev, assistantMessage]);
            setStreamingContent("");
            break;
          }

          try {
            const chunk: StreamChunk = JSON.parse(data);
            
            if (chunk.type === "text" && chunk.content) {
              accumulatedContent += chunk.content;
              setStreamingContent(accumulatedContent);
            } else if (chunk.type === "confirm" && chunk.confirm) {
              setPendingConfirm(chunk.confirm);
            } else if (chunk.type === "error" && chunk.error) {
              throw new Error(chunk.error);
            }
          } catch (e) {
            console.error("Failed to parse SSE chunk:", e);
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: `Error: ${err.message || "Unknown error"}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      setStreamingContent("");
    } finally {
      setStreaming(false);
      abortControllerRef.current = null;
    }
  }, [input, streaming]);

  const handleConfirm = useCallback(async (approved: boolean) => {
    if (!pendingConfirm) return;
    
    try {
      // Rule: async-defer-await - Start fetch early
      // v1 API: POST /threads/:thread_id/confirmations
      const confirmPromise = fetch(`${API_BASE}/threads/default/confirmations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm_id: pendingConfirm.id,
          approved,
        }),
      });
      
      await confirmPromise;
      
      if (!approved) {
        const cancelMessage: Message = {
          id: Date.now().toString(),
          role: "assistant",
          content: t("confirmCancelled"),
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, cancelMessage]);
      }
    } catch (err) {
      console.error("Confirmation failed:", err);
    } finally {
      setPendingConfirm(null);
    }
  }, [pendingConfirm, t]);

  // Rule: rerender-dependencies - Use stable callback refs to avoid re-render cascades
  useEffect(() => {
    register((text: string, autoSubmit?: boolean, displayText?: string) => {
      if (autoSubmit) {
        handleSend(text, displayText);
      } else {
        setInput((prev) => (prev ? prev + "\n" + text : text));
      }
    });
  }, [register, handleSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setStreamingContent("");
    setPendingConfirm(null);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  if (minimized) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="fixed bottom-8 right-8 glass rounded-2xl shadow-2xl border border-border/50 overflow-hidden"
      >
        <button
          onClick={() => setMinimized(false)}
          className="flex items-center gap-3 px-6 py-4 hover:bg-accent/50 transition-colors"
        >
          <Bot size={24} className="text-primary" />
          <div className="text-left">
            <div className="font-semibold">{t("aiAssistant")}</div>
            <div className="text-xs text-muted-foreground">
              {messages.length} {t("messages")}
            </div>
          </div>
          <Maximize2 size={16} className="ml-4 text-muted-foreground" />
        </button>
      </motion.div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-card/30 backdrop-blur-xl border-l border-border/50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <Bot size={20} className="text-primary" />
          <div>
            <h2 className="text-sm font-semibold">{t("aiAssistant")}</h2>
            <div className="text-xs text-muted-foreground">
              {messages.length} {t("messages")}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleNewChat}
            className="p-2 hover:bg-accent/50 rounded-lg transition-colors"
            title={t("newChat")}
          >
            <RotateCcw size={16} />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setMinimized(true)}
            className="p-2 hover:bg-accent/50 rounded-lg transition-colors"
            title={t("minimize")}
          >
            <Minimize2 size={16} />
          </motion.button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
            <Bot size={48} className="text-primary/50" />
            <div>
              <p className="text-muted-foreground mb-2">{t("chatWelcome")}</p>
              <p className="text-xs text-muted-foreground max-w-sm">
                {t("chatHint")}
              </p>
            </div>
          </div>
        )}

        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <Bot size={16} className="text-primary" />
                </div>
              )}
              <div className={`
                max-w-[80%] p-3 rounded-2xl
                ${msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "glass border border-border/30"
                }
              `}>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </div>
              {msg.role === "user" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                  <User size={16} />
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Streaming Message */}
        {streaming && streamingContent && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3 justify-start"
          >
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <Bot size={16} className="text-primary animate-pulse" />
            </div>
            <div className="max-w-[80%] p-3 rounded-2xl glass border border-border/30">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{streamingContent}</ReactMarkdown>
              </div>
              <span className="inline-block w-1 h-4 bg-primary animate-pulse ml-1" />
            </div>
          </motion.div>
        )}

        {/* Confirmation Dialog */}
        <AnimatePresence>
          {pendingConfirm && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="p-4 bg-yellow-500/10 border-2 border-yellow-500/50 rounded-xl"
            >
              <div className="font-semibold mb-2 text-yellow-400">{t("confirmTitle")}</div>
              <p className="text-sm mb-4">{pendingConfirm.message}</p>
              <div className="flex gap-2">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleConfirm(true)}
                  className="flex-1 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors"
                >
                  {t("confirmYes")}
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleConfirm(false)}
                  className="flex-1 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                >
                  {t("confirmNo")}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border/50">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("chatPlaceholder")}
            disabled={streaming}
            className="flex-1 px-4 py-3 bg-background/50 border border-border/50 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
            rows={2}
          />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handleSend()}
            disabled={streaming || !input.trim()}
            className="p-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={t("send")}
          >
            <Send size={20} />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
