import { createContext, useCallback, useContext, useRef, type ReactNode } from "react";

type ChatHandler = (text: string, autoSubmit?: boolean, displayText?: string) => void;

interface ChatBridgeValue {
  sendToChat: (text: string) => void;
  submitToChat: (text: string, displayText?: string) => void;
  register: (handler: ChatHandler) => void;
}

const ChatBridgeContext = createContext<ChatBridgeValue | null>(null);

export function ChatBridgeProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<ChatHandler | null>(null);

  const register = useCallback((handler: ChatHandler) => {
    handlerRef.current = handler;
  }, []);

  const sendToChat = useCallback((text: string) => {
    handlerRef.current?.(text, false);
  }, []);

  const submitToChat = useCallback((text: string, displayText?: string) => {
    handlerRef.current?.(text, true, displayText);
  }, []);

  return (
    <ChatBridgeContext.Provider value={{ sendToChat, submitToChat, register }}>
      {children}
    </ChatBridgeContext.Provider>
  );
}

export function useChatBridge() {
  const ctx = useContext(ChatBridgeContext);
  if (!ctx) throw new Error("useChatBridge must be used within ChatBridgeProvider");
  return ctx;
}
