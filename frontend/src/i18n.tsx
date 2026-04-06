import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type Lang = "zh" | "en";

const translations = {
  // Nav / Sidebar
  subtitle: { zh: "期权智能投研助手", en: "Option Intelligence Research Agent" },
  navOptions: { zh: "期权", en: "Options" },
  navOptionsChain: { zh: "期权链", en: "Chain" },
  navPortfolio: { zh: "持仓", en: "Positions" },
  navTradeHistory: { zh: "交易记录", en: "Trades" },
  navDashboard: { zh: "仪表盘", en: "Dashboard" },
  navWorkbench: { zh: "工作台", en: "Workbench" },
  navSettings: { zh: "设置", en: "Settings" },
  darkMode: { zh: "深色", en: "Dark" },
  lightMode: { zh: "浅色", en: "Light" },
  watchlist: { zh: "自选列表", en: "Watchlist" },
  watchlistPlaceholder: { zh: "输入代码...", en: "Ticker..." },

  // OptionsChain
  expiration: { zh: "到期日：", en: "Expiration:" },
  loading: { zh: "加载中...", en: "Loading..." },
  loadFailed: { zh: "加载失败", en: "Failed to load" },
  dataSourceLabel: { zh: "数据源：yfinance（延迟）", en: "yfinance (delayed)" },
  tabPuts: { zh: "看跌期权", en: "Puts" },
  tabCalls: { zh: "看涨期权", en: "Calls" },
  sendToChat: { zh: "发送到聊天", en: "Send to Chat" },
  earningsWarning: { zh: "距财报", en: "Earnings in" },
  earningsDays: { zh: "天", en: "d" },
  addToPortfolio: { zh: "加入持仓", en: "Add to Portfolio" },
  portfolioEmpty: { zh: "暂无持仓，右键期权报价可添加", en: "No positions. Right-click an option to add." },
  portfolioSide: { zh: "方向", en: "Side" },
  portfolioQty: { zh: "数量", en: "Qty" },
  portfolioEntry: { zh: "入场价", en: "Entry" },
  portfolioCurrent: { zh: "现价", en: "Current" },
  portfolioPnl: { zh: "盈亏", en: "P&L" },
  portfolioSell: { zh: "卖出", en: "Sell" },
  portfolioBuy: { zh: "买入", en: "Buy" },
  portfolioRemove: { zh: "移除", en: "Remove" },
  portfolioAddedOk: { zh: "已加入持仓", en: "Added to portfolio" },
  closePosition: { zh: "平仓", en: "Close" },
  deletePosition: { zh: "删除", en: "Delete" },
  exitPrice: { zh: "平仓价", en: "Exit Price" },
  confirmClose: { zh: "确认平仓", en: "Confirm Close" },
  tradeClosed: { zh: "已平仓，记录已保存", en: "Position closed, trade recorded" },
  totalPnl: { zh: "累计盈亏", en: "Total P&L" },
  tradeCount: { zh: "交易次数", en: "Trades" },
  winRate: { zh: "胜率", en: "Win Rate" },
  noTradeHistory: { zh: "暂无交易记录", en: "No trade history yet" },
  closedAt: { zh: "平仓日期", en: "Closed" },
  colExpiration: { zh: "到期日", en: "Expiration" },
  portfolioAll: { zh: "全部", en: "All" },
  lastUpdated: { zh: "更新于", en: "Updated" },
  marketTimeEt: { zh: "（美东）", en: " ET" },
  refresh: { zh: "刷新", en: "Refresh" },
  /** Right-click row: short label, same tone as 加入持仓 / 发送到聊天 */
  ctxMenuAnalyzePut: { zh: "分析", en: "Analyze" },
  /** Modal title: full description */
  sellPutAnalysis: { zh: "卖出看跌分析", en: "Sell put analysis" },
  colStrike: { zh: "行权价", en: "Strike" },
  colLast: { zh: "最新价", en: "Last" },
  colBid: { zh: "买价", en: "Bid" },
  colAsk: { zh: "卖价", en: "Ask" },
  colVolume: { zh: "成交量", en: "Volume" },
  colOI: { zh: "持仓量", en: "OI" },
  colIV: { zh: "隐含波动率", en: "IV" },
  colITM: { zh: "价值状态", en: "ITM" },

  // SellPutPanel
  cushion: { zh: "安全垫", en: "Cushion" },
  roic: { zh: "投资回报率", en: "ROIC" },
  annualized: { zh: "年化", en: "Ann." },
  risks: { zh: "风险", en: "Risks" },
  collapse: { zh: "收起", en: "Less" },
  details: { zh: "详情", en: "More" },
  premium: { zh: "权利金", en: "Premium" },
  breakeven: { zh: "盈亏平衡", en: "Breakeven" },
  days: { zh: "天", en: "d" },
  maxProfit: { zh: "最大收益", en: "Max Profit" },
  maxLoss: { zh: "最大亏损", en: "Max Loss" },
  signalGood: { zh: "适合卖出", en: "Favorable" },
  signalBad: { zh: "不建议", en: "Unfavorable" },
  signalNeutral: { zh: "中性", en: "Neutral" },

  helpDelta: {
    zh: "Delta (Δ)：期权价格对标的价格变动的敏感度。\nSell Put 中 Delta 为负值，绝对值越小越安全。",
    en: "Delta (Δ): Sensitivity of option price to underlying price change.\nFor Sell Put, negative delta; smaller absolute value = safer.",
  },
  helpGamma: {
    zh: "Gamma (Γ)：Delta 的变化速率。\nGamma 越大，Delta 变化越快，风险越高。",
    en: "Gamma (Γ): Rate of change of Delta.\nHigher Gamma = Delta changes faster = higher risk.",
  },
  helpTheta: {
    zh: "Theta (Θ)：每天时间流逝带来的期权价值衰减。\nSell Put 中 Theta 为正收益，越大越有利。",
    en: "Theta (Θ): Daily time decay of option value.\nFor Sell Put, Theta is your profit; higher = better.",
  },
  helpVega: {
    zh: "Vega (V)：期权价格对隐含波动率变动的敏感度。\nSell Put 时，波动率下降对卖方有利。",
    en: "Vega (V): Sensitivity to implied volatility changes.\nFor Sell Put, decreasing IV benefits the seller.",
  },
  helpIV: {
    zh: "隐含波动率 (IV)：市场对标的未来波动的预期。\nIV 越高，权利金越贵，Sell Put 收益越高。",
    en: "Implied Volatility (IV): Market's expectation of future movement.\nHigher IV = higher premium = better Sell Put income.",
  },
  helpIVRank: {
    zh: "IV Rank：当前 IV 在过去一年 IV 区间中的相对位置。\n高于 50% 说明当前波动率偏高，适合卖出。",
    en: "IV Rank: Current IV position within past year's IV range.\nAbove 50% = elevated IV, favorable for selling.",
  },
  helpIVDotRed: {
    zh: "🔴 IV Rank < 25%：当前隐含波动率处于历史低位，权利金偏低，不太适合卖出。",
    en: "🔴 IV Rank < 25%: IV is at historical lows, premiums are cheap, not ideal for selling.",
  },
  helpIVDotWhite: {
    zh: "⚪ IV Rank 25%-50%：隐含波动率处于中性区间，卖出收益一般。",
    en: "⚪ IV Rank 25%-50%: IV is neutral, selling premiums are moderate.",
  },
  helpIVDotGreen: {
    zh: "🟢 IV Rank > 50%：当前隐含波动率偏高，权利金丰厚，适合卖出策略。",
    en: "🟢 IV Rank > 50%: IV is elevated, premiums are rich, favorable for selling.",
  },
  helpIVPctl: {
    zh: "IV 百分位：过去一年中，有多少天的 IV 低于当前值。\n高百分位说明当前 IV 处于历史高位。",
    en: "IV Percentile: % of days in the past year with IV below current.\nHigh percentile = IV at historical highs.",
  },

  // Trade History Filters
  filterPeriod: { zh: "时间范围", en: "Time Period" },
  period_all: { zh: "全部", en: "All" },
  period_7d: { zh: "7 天", en: "7D" },
  period_30d: { zh: "30 天", en: "30D" },
  period_90d: { zh: "90 天", en: "90D" },
  period_1y: { zh: "1 年", en: "1Y" },

  // Dual Investment
  navDualInvest: { zh: "双币投资", en: "Dual Investment" },
  dualInvestCoin: { zh: "币种", en: "Coin" },
  dualBuyLow: { zh: "低买", en: "Buy Low" },
  dualSellHigh: { zh: "高卖", en: "Sell High" },
  dualOrderType: { zh: "类型", en: "Type" },
  dualDuration: { zh: "期限", en: "Duration" },
  dualSettleDate: { zh: "交割日", en: "Settle" },
  dualMinAmount: { zh: "最低申购", en: "Min" },
  dualStatus: { zh: "状态", en: "Status" },
  dualAvailable: { zh: "可申购", en: "Open" },
  dualSoldOut: { zh: "已售罄", en: "Sold Out" },
  dualInvestEmpty: { zh: "暂无可用产品", en: "No products available" },
  dualExchange: { zh: "交易所", en: "Exchange" },
  dualExchangeNotConfigured: {
    zh: "该交易所 API 未配置，请前往设置页面配置",
    en: "This exchange API is not configured. Go to Settings to configure.",
  },
  dualInvestNotConfigured: {
    zh: "请先配置交易所 API Key 以查看双币赢产品",
    en: "Configure an exchange API Key in Settings to view Dual Investment products",
  },
  dualInvestConfigHint: {
    zh: "前往 设置 → 交易所 API 配置",
    en: "Go to Settings → Exchange API Configuration",
  },
  dualBalance: { zh: "可用余额", en: "Available" },
  dualMyOrders: { zh: "我的持仓", en: "My Orders" },
  dualNoOrders: { zh: "暂无持仓", en: "No active orders" },
  dualSubscribe: { zh: "申购", en: "Subscribe" },
  dualRedeem: { zh: "赎回", en: "Redeem" },
  dualOrderAmt: { zh: "投入金额", en: "Amount" },
  dualOrderState: { zh: "状态", en: "Status" },
  dualOrderCreated: { zh: "创建时间", en: "Created" },
  dualSubscribeTitle: { zh: "申购双币赢", en: "Subscribe DCD" },
  dualInvestAmount: { zh: "投入金额", en: "Invest Amount" },
  dualExpectedYield: { zh: "预计收益", en: "Expected Yield" },
  dualAvailBalance: { zh: "可用", en: "Available" },

  // Settings — LLM
  llmConfig: { zh: "大模型配置", en: "LLM Configuration" },
  llmConfigDesc: {
    zh: "配置 AI 助手使用的大模型供应商、模型和 API Key。支持自定义 Base URL 以使用代理/加速服务。",
    en: "Configure the LLM provider, model, and API key for the AI assistant. Custom Base URL supported for proxy services.",
  },
  llmProvider: { zh: "供应商", en: "Provider" },
  llmModel: { zh: "模型", en: "Model" },
  llmModelPlaceholder: { zh: "模型名称，如 gemini-2.5-flash", en: "Model name, e.g. gemini-2.5-flash" },
  llmApiKey: { zh: "API Key", en: "API Key" },
  llmBaseUrl: { zh: "Base URL", en: "Base URL" },
  llmBaseUrlPlaceholder: { zh: "留空使用官方地址，填写代理/加速地址", en: "Leave empty for official endpoint, or enter proxy URL" },
  llmBaseUrlRequired: { zh: "Base URL（必填，如 https://api.deepseek.com/v1）", en: "Base URL (required, e.g. https://api.deepseek.com/v1)" },
  llmConfigured: { zh: "已配置", en: "Configured" },
  llmNotConfigured: { zh: "未配置", en: "Not configured" },
  llmConfigSaved: { zh: "大模型配置已保存，Agent 已重新加载", en: "LLM config saved, agent reloaded" },
  llmTestBtn: { zh: "测试连接", en: "Test" },
  llmTesting: { zh: "测试中…", en: "Testing…" },
  llmTestOk: { zh: "连接成功", en: "Connected" },
  llmTestFail: { zh: "连接失败", en: "Failed" },
  llmEdit: { zh: "修改", en: "Edit" },
  llmAvailable: { zh: "可用", en: "Available" },

  // Settings
  settingsRefreshInterval: { zh: "数据刷新间隔", en: "Data Refresh Interval" },
  settingsRefreshDesc: {
    zh: "期权链、持仓报价、自选股价等自动刷新的时间间隔",
    en: "Auto-refresh interval for options chain, portfolio quotes, and watchlist prices",
  },
  settingsMarketStatus: { zh: "美股市场状态", en: "US Market Status" },
  binanceApiConfig: { zh: "Binance API 配置", en: "Binance API Configuration" },
  binanceApiConfigDesc: {
    zh: "配置 Binance API Key 以查看双币赢产品。仅需只读权限，密钥仅保存在运行时内存中。",
    en: "Configure Binance API Key for Dual Investment products. Read-only access is sufficient. Keys are stored in runtime memory only.",
  },
  binanceConfigured: { zh: "已配置", en: "Configured" },
  binanceNotConfigured: { zh: "未配置", en: "Not configured" },
  binanceConfigSaved: { zh: "Binance API 配置已保存", en: "Binance API configured" },
  okxApiConfig: { zh: "OKX API 配置", en: "OKX API Configuration" },
  okxApiConfigDesc: {
    zh: "配置 OKX API Key 以查看双币赢产品。需要 API Key、Secret Key 和 Passphrase。仅需只读权限。",
    en: "Configure OKX API Key for Dual Investment products. Requires API Key, Secret Key, and Passphrase. Read-only access is sufficient.",
  },
  okxConfigured: { zh: "已配置", en: "Configured" },
  okxNotConfigured: { zh: "未配置", en: "Not configured" },
  okxConfigSaved: { zh: "OKX API 配置已保存", en: "OKX API configured" },
  okxMcpConfig: { zh: "OKX MCP 权限", en: "OKX MCP Access" },
  okxMcpConfigDesc: {
    zh: "控制 OKX MCP 工具的访问级别。仅查询模式只能查看行情和账户信息，完整权限可执行交易操作。",
    en: "Control the access level of OKX MCP tools. Query Only mode allows viewing market data and account info; Full Access enables trading operations.",
  },
  okxMcpAccessReadonly: { zh: "仅查询", en: "Query Only" },
  okxMcpAccessFull: { zh: "完整权限", en: "Full Access" },
  okxMcpFullWarning: {
    zh: "⚠ 完整权限将允许 AI 执行真实交易操作，请谨慎使用。",
    en: "⚠ Full Access allows the AI to execute real trades. Use with caution.",
  },
  okxMcpSaved: { zh: "OKX MCP 配置已保存，工具已重新加载", en: "OKX MCP config saved, tools reloaded" },
  okxMcpToolCount: { zh: "已加载工具", en: "Tools loaded" },
  faMcpConfig: { zh: "FlashAlpha MCP", en: "FlashAlpha MCP" },
  faMcpConfigDesc: {
    zh: "接入 FlashAlpha 的期权高级分析：GEX/DEX/VEX 暴露、关键价位、波动率分析。免费版每日 5 次。",
    en: "Connect FlashAlpha for advanced options analytics: GEX/DEX/VEX exposure, key levels, volatility. Free tier: 5/day.",
  },
  faMcpConfigured: { zh: "已接入", en: "Connected" },
  faMcpNotConfigured: { zh: "未配置", en: "Not Configured" },
  faMcpSaved: { zh: "FlashAlpha MCP 已接入，工具已加载", en: "FlashAlpha MCP connected, tools loaded" },
  mcpConnecting: { zh: "接入中…", en: "Connecting…" },
  faMcpToolCount: { zh: "FA 工具", en: "FA tools" },
  ctxAdvancedAnalysis: { zh: "高级分析", en: "Advanced Analysis" },
  ctxQuotaExhausted: { zh: "今日已用完", en: "Quota exhausted" },
  quotaResetTime: { zh: "每日 08:00 重置", en: "Resets 00:00 UTC" },
  toolCalling: { zh: "调用中…", en: "calling…" },
  cmcMcpConfig: { zh: "CoinMarketCap MCP", en: "CoinMarketCap MCP" },
  cmcMcpConfigDesc: {
    zh: "接入 CoinMarketCap 的情绪面、技术面、链上数据和宏观事件分析。免费注册获取 API Key。",
    en: "Connect CoinMarketCap for sentiment, technicals, on-chain data, and macro events. Register for a free API Key.",
  },
  cmcMcpConfigured: { zh: "已接入", en: "Connected" },
  cmcMcpNotConfigured: { zh: "未配置", en: "Not Configured" },
  cmcMcpSaved: { zh: "CoinMarketCap MCP 已接入，工具已加载", en: "CoinMarketCap MCP connected, tools loaded" },
  cmcMcpToolCount: { zh: "CMC 工具", en: "CMC tools" },
  langsmithConfig: { zh: "LangSmith 可观测性", en: "LangSmith Observability" },
  langsmithConfigDesc: {
    zh: "配置 LangSmith API Key 启用 Agent 链路追踪。可在 smith.langchain.com 查看每次调用的完整 trace。",
    en: "Configure LangSmith API Key to enable agent tracing. View full traces at smith.langchain.com.",
  },
  langsmithConfigured: { zh: "已启用", en: "Enabled" },
  langsmithNotConfigured: { zh: "未配置", en: "Not Configured" },
  langsmithSaved: { zh: "LangSmith 已启用，Agent 链路追踪已开启", en: "LangSmith enabled, agent tracing is active" },
  reconfigure: { zh: "重新配置", en: "Reconfigure" },
  marketOpen: { zh: "交易中", en: "Market Open" },
  marketPre: { zh: "盘前", en: "Pre-Market" },
  marketPost: { zh: "盘后", en: "After-Hours" },
  marketClosed: { zh: "休市", en: "Market Closed" },
  marketClosedSlowRefresh: {
    zh: "当前休市，已暂停自动刷新。开盘后将自动恢复。",
    en: "Market closed — auto-refresh paused. Will resume when market opens.",
  },

  // Account Management
  navAccounts: { zh: "资产总览", en: "Portfolio" },
  accountsTitle: { zh: "账户管理", en: "Account Management" },
  accountsEmpty: { zh: "暂无账户，点击上方按钮创建", en: "No accounts yet. Click above to create one." },
  addAccount: { zh: "新建账户", en: "New Account" },
  editAccount: { zh: "编辑账户", en: "Edit Account" },
  deleteAccount: { zh: "删除账户", en: "Delete Account" },
  deleteAccountConfirm: { zh: "确定删除此账户及所有持仓？", en: "Delete this account and all its holdings?" },
  accountName: { zh: "账户名称", en: "Account Name" },
  accountPlatform: { zh: "市场类型", en: "Market" },
  accountBroker: { zh: "券商/交易所", en: "Broker / Exchange" },
  accountCurrency: { zh: "币种", en: "Currency" },
  platformUsStock: { zh: "美股", en: "US Stock" },
  platformAStock: { zh: "A股", en: "A-Share" },
  platformCrypto: { zh: "加密货币", en: "Crypto" },
  platformOther: { zh: "其他", en: "Other" },
  positionCount: { zh: "持仓数", en: "Positions" },
  totalCost: { zh: "持仓成本", en: "Cost Basis" },
  marketValue: { zh: "持仓市值", en: "Market Value" },
  unrealizedPnl: { zh: "浮动盈亏", en: "Unrealized P&L" },
  returnRate: { zh: "收益率", en: "Return" },
  viewHoldings: { zh: "查看持仓", en: "View Holdings" },
  addHolding: { zh: "新增持仓", en: "Add Holding" },
  editHolding: { zh: "编辑持仓", en: "Edit Holding" },
  deleteHolding: { zh: "删除持仓", en: "Delete Holding" },
  assetType: { zh: "资产类型", en: "Asset Type" },
  assetStock: { zh: "股票", en: "Stock" },
  assetOption: { zh: "期权", en: "Option" },
  assetCrypto: { zh: "加密货币", en: "Crypto" },
  holdingSide: { zh: "方向", en: "Side" },
  holdingLong: { zh: "做多", en: "Long" },
  holdingShort: { zh: "做空", en: "Short" },
  holdingQty: { zh: "数量", en: "Quantity" },
  holdingAvgCost: { zh: "平均成本", en: "Avg Cost" },
  holdingCurrentPrice: { zh: "当前价格", en: "Current Price" },
  holdingsEmpty: { zh: "暂无持仓", en: "No holdings" },
  save: { zh: "保存", en: "Save" },
  cancel: { zh: "取消", en: "Cancel" },
  confirm: { zh: "确认", en: "Confirm" },
  back: { zh: "返回", en: "Back" },
  optionType: { zh: "期权类型", en: "Option Type" },

  // ChatPanel
  aiAssistant: { zh: "AI 助手", en: "AI Assistant" },
  tradingProfile: { zh: "交易风格档案", en: "Trading Profile" },
  preferences: { zh: "个偏好", en: " pref." },
  messages: { zh: "条消息", en: " msgs" },
  expand: { zh: "展开", en: "Expand" },
  minimize: { zh: "最小化", en: "Minimize" },
  newChat: { zh: "+ 新对话", en: "+ New Chat" },
  strategyPref: { zh: "策略偏好", en: "Strategy" },
  riskPref: { zh: "风险偏好", en: "Risk" },
  tickers: { zh: "关注标的", en: "Tickers" },
  dtePref: { zh: "DTE 偏好", en: "DTE Pref." },
  deltaPref: { zh: "Delta", en: "Delta" },
  notes: { zh: "备注", en: "Notes" },
  chatWelcome: { zh: "我是你的期权投研助手。", en: "I'm your options research assistant." },
  chatHint: {
    zh: '试试问我："TSLL 现在适合 Sell Put 吗？" 或 "帮我分析一下 TSLA 的波动率"',
    en: 'Try asking: "Is TSLL good for Sell Put now?" or "Analyze TSLA volatility"',
  },
  chatPlaceholder: {
    zh: "输入消息... (Enter 发送, Shift+Enter 换行)",
    en: "Type a message... (Enter to send, Shift+Enter for new line)",
  },
  send: { zh: "发送", en: "Send" },

  // HITL confirmation
  confirmTitle: { zh: "⚠️ 即将执行以下操作，请确认：", en: "⚠️ The following action will be executed. Please confirm:" },
  confirmYes: { zh: "确认执行", en: "Confirm" },
  confirmNo: { zh: "取消", en: "Cancel" },
  confirmCancelled: { zh: "操作已取消。", en: "Operation cancelled." },
} as const;

type Key = keyof typeof translations;

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: Key) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem("lang");
    return saved === "en" ? "en" : "zh";
  });

  const changeLang = useCallback((l: Lang) => {
    setLang(l);
    localStorage.setItem("lang", l);
  }, []);

  const t = useCallback((key: Key) => translations[key][lang], [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang: changeLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
