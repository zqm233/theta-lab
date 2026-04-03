import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { I18nProvider } from './i18n.tsx'
import { ThemeProvider } from './theme.tsx'
import { ChatBridgeProvider } from './chatBridge.tsx'
import { PortfolioProvider } from './portfolio.tsx'
import { PriceProvider } from './priceProvider.tsx'
import { SettingsProvider } from './settings.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <SettingsProvider>
          <ChatBridgeProvider>
            <PriceProvider>
              <PortfolioProvider>
                <App />
              </PortfolioProvider>
            </PriceProvider>
          </ChatBridgeProvider>
        </SettingsProvider>
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>,
)
