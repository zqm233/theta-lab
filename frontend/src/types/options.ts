export interface OptionContract {
  contractSymbol: string;
  strike: number;
  lastPrice: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  inTheMoney: boolean;
}

export interface EarningsWarning {
  date: string;
  daysUntil: number;
  isClose: boolean;
}

export interface OptionsChainData {
  ticker: string;
  expiration: string;
  daysToExpiry: number;
  currentPrice: number;
  calls: OptionContract[];
  puts: OptionContract[];
  availableExpirations: string[];
  dataSource: string;
  fetchedAt: string;
  ivRank: number | null;
  earningsWarning: EarningsWarning | null;
  underlying?: string;
}

export interface VolatilitySummary {
  ticker: string;
  currentPrice: number;
  currentIV: number;
  hv20: number | null;
  hv60: number | null;
  ivRank: number | null;
  ivPercentile: number | null;
  ivHvSpread: number | null;
  sellSignal: string;
}

export interface SellPutAnalysis {
  ticker: string;
  expiration: string;
  spot: number;
  strike: number;
  premium: number;
  daysToExpiry: number;
  iv: number;
  breakeven: number;
  safetyCushion: { absolute: number; percent: number };
  roic: { roic: number; annualized: number };
  greeks: { delta: number; gamma: number; theta: number; vega: number };
  maxProfit: number;
  maxLoss: number;
  volatility: VolatilitySummary;
  earningsRisk: {
    hasEarningsRisk: boolean;
    message: string;
    warnings?: Array<{ earningsDate: string; risk: string; message?: string }>;
  };
  riskAlerts: string[];
}
