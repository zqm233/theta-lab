"use client";

import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { I18nProvider } from "@/lib/i18n";
import { SettingsProvider } from "@/lib/settings";
import { PortfolioProvider } from "@/lib/portfolio";
import { ChatBridgeProvider } from "@/lib/chat-bridge";
import { ReactQueryProvider } from "@/lib/react-query";
import { HoldingQuotesProvider } from "@/lib/holdingQuotes";
import { ThemeProvider } from "next-themes";
import Sidebar from "@/components/layout/Sidebar";
import "./globals.css";

const ChatPanel = dynamic(() => import("@/components/layout/ChatPanel"), {
  loading: () => <div className="w-96 h-full bg-card/30 animate-pulse" />,
  ssr: false,
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <ReactQueryProvider>
            <HoldingQuotesProvider>
            <I18nProvider>
              <SettingsProvider>
                <PortfolioProvider>
                  <ChatBridgeProvider>
                    <div className="flex h-screen overflow-hidden bg-background">
                      <Sidebar />
                      <main className="ml-20 flex-1 overflow-hidden flex">
                        <div className="flex-1 overflow-hidden">
                          {children}
                        </div>
                        <ChatPanel />
                      </main>
                    </div>
                  </ChatBridgeProvider>
                </PortfolioProvider>
              </SettingsProvider>
            </I18nProvider>
            </HoldingQuotesProvider>
          </ReactQueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
