"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, TrendingDown, TrendingUp, DollarSign } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { useApiQuery } from "@/lib/api-hooks";
import { useChatBridge } from "@/lib/chat-bridge";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { handleSilentError, extractErrorMessage } from "@/lib/utils/errorHandler";
import { cn } from "@/lib/utils";

/** 双币订单金额展示：BTC/ETH 多给小数位，报价币保留 2 位 */
function formatDcdAmount(value: number, ccy: string): string {
  const u = ccy.trim().toUpperCase();
  if (u === "BTC" || u === "ETH") {
    const s = value.toFixed(8);
    const trimmed = s.replace(/\.?0+$/, "");
    return trimmed === "" ? "0" : trimmed;
  }
  return value.toFixed(2);
}

interface Product {
  id: string;
  coin: string;
  direction: string;
  optionType: string;
  investCoin: string;
  exercisedCoin: string;
  strikePrice: number;
  apr: number;
  aprPercent: number;
  duration: number;
  settleDate: string;
  minAmount: number;
  maxAmount: number;
  stepSize: number;
  canPurchase: boolean;
}

interface DcdOrder {
  ordId: string;
  productId: string;
  coin: string;
  direction: string;
  strikePrice: number;
  apr: number;
  aprPercent: number;
  investAmt: number;
  investCcy: string;
  /** True when OKX payload had no usable notional — show "—" instead of misleading 0 */
  investUnknown?: boolean;
  state: string;
  settleDate: string;
  createTime: string;
  durationDays?: number;
  expectedProfit?: number;
  /** 预期收益币种（高卖多为 BTC）；低买多为 USDT */
  expectedProfitCcy?: string;
  actualProfit?: number | null;
}

type Exchange = "binance" | "okx";

const COINS = ["BTC", "ETH"];

export default function DualInvestPage() {
  const { t } = useI18n();
  const { sendToChat } = useChatBridge();
  const { jitteredInterval } = useSettings();
  const menuRef = useRef<HTMLDivElement>(null);
  
  const [exchange, setExchange] = useState<Exchange>("okx");
  
  // 主 Tab：首屏默认值需与 SSR 一致，避免 hydration mismatch；持久化在 effect 里恢复
  const [mainTab, setMainTab] = useState<"products" | "orders">("products");

  const [orderTab, setOrderTab] = useState<"active" | "history">("active");

  const [orderCoinFilter, setOrderCoinFilter] = useState<string>("all");

  const [orderDirectionFilter, setOrderDirectionFilter] = useState<string>("all");

  useEffect(() => {
    const savedMain = localStorage.getItem("dual_main_tab");
    if (savedMain === "products" || savedMain === "orders") setMainTab(savedMain);
    const savedOrderTab = localStorage.getItem("dual_order_tab");
    if (savedOrderTab === "active" || savedOrderTab === "history") setOrderTab(savedOrderTab);
    const savedCoinFilter = localStorage.getItem("dual_order_coin_filter");
    if (savedCoinFilter) setOrderCoinFilter(savedCoinFilter);
    const savedDirFilter = localStorage.getItem("dual_order_direction_filter");
    if (savedDirFilter) setOrderDirectionFilter(savedDirFilter);
  }, []);
  const [coin, setCoin] = useState("BTC");
  const [direction, setDirection] = useState<"buy_low" | "sell_high">("buy_low");
  const [subModal, setSubModal] = useState<Product | null>(null);
  const [subPct, setSubPct] = useState(50);
  const [selectedSettleDate, setSelectedSettleDate] = useState<string>("");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; product: Product } | null>(null);

  // React Query: 交易所状态
  const { data: statusData } = useApiQuery<{ binance: boolean; okx: boolean }>(
    ["dual-invest-status"],
    "/dual-invest/status",
    {
      staleTime: 300000, // 5分钟 - 状态不会频繁变化
    }
  );
  
  const exchangeStatus = statusData ?? { binance: false, okx: false };
  const statusLoaded = !!statusData;
  
  // 根据状态自动切换交易所
  useEffect(() => {
    if (statusData && !statusData.okx && statusData.binance) {
      setExchange("binance");
    }
  }, [statusData]);
  
  // 保存主 Tab 状态
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("dual_main_tab", mainTab);
    }
  }, [mainTab]);
  
  // 保存订单 Tab 状态
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("dual_order_tab", orderTab);
    }
  }, [orderTab]);
  
  // 保存订单筛选状态
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("dual_order_coin_filter", orderCoinFilter);
    }
  }, [orderCoinFilter]);
  
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("dual_order_direction_filter", orderDirectionFilter);
    }
  }, [orderDirectionFilter]);

  const isConfigured = exchangeStatus[exchange];

  // React Query: 产品列表
  const { data: productsData, isLoading: loading, error: productsError } = useApiQuery<{ products: Product[] }>(
    ["dual-products", exchange, coin, direction],
    `/dual-invest/products?coin=${coin}&direction=${direction}&exchange=${exchange}`,
    {
      // 仅在「可购买产品」页请求，避免订单页因产品接口失败在控制台报错、且订单数据仍正常
      enabled: statusLoaded && isConfigured && mainTab === "products",
      // 移除 refetchInterval - 避免后台持续请求导致页面切换时重复请求
      staleTime: 60000, // 60秒内认为是新鲜数据
    }
  );

  const products = productsData?.products ?? [];
  const error = productsError?.message ?? null;

  // React Query: 现有订单 — 仅在「现有订单」子 Tab 请求，避免与历史接口并行、也避免失败时全局 retry 打出两条相同请求
  const { data: activeOrdersData } = useApiQuery<{ orders: DcdOrder[] }>(
    ["dual-orders-active", exchange],
    exchange === "okx" ? `/okx/dcd/orders?state=live` : `/dual-invest/orders?exchange=${exchange}&state=live`,
    {
      enabled: isConfigured && mainTab === "orders" && orderTab === "active",
      staleTime: 60000,
      retry: false,
    }
  );

  // React Query: 历史订单 — 仅在「历史订单」子 Tab 请求
  const { data: historyOrdersData } = useApiQuery<{ orders: DcdOrder[] }>(
    ["dual-orders-history", exchange],
    exchange === "okx" ? `/okx/dcd/orders/history` : `/dual-invest/orders?exchange=${exchange}&state=filled,expired`,
    {
      enabled: isConfigured && mainTab === "orders" && orderTab === "history",
      staleTime: 60000,
      retry: false,
    }
  );

  // React Query: 现货价格
  const { data: spotData } = useApiQuery<{ price: number }>(
    ["spot-price", coin],
    `/tickers/${coin}/quote?market=crypto`,
    {
      enabled: true,
      // 移除 refetchInterval - 避免后台持续请求
      staleTime: 60000, // 增加到60s与全局一致
    }
  );

  const spotPrice = spotData?.price ?? null;

  // Extract unique settle dates from products and sort by date (earliest first)
  const settleDates = useMemo(
    () => Array.from(new Set(products.map((p) => p.settleDate))).sort(),
    [products]
  );

  // Load user's last selected settle date from localStorage or default to nearest
  useEffect(() => {
    if (settleDates.length === 0) return;

    const storageKey = `dual_invest_settle_date_${exchange}_${coin}_${direction}`;
    const saved = localStorage.getItem(storageKey);

    // Check if saved date exists in current products and is not expired
    if (saved && settleDates.includes(saved)) {
      const savedDate = new Date(saved);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // If saved date is still valid (not expired), use it
      if (savedDate >= today) {
        setSelectedSettleDate(saved);
        return;
      }
    }

    // Otherwise, default to the nearest (earliest) settle date
    setSelectedSettleDate(settleDates[0]);
  }, [settleDates, exchange, coin, direction]);

  // Save user's selection to localStorage
  const handleSettleDateChange = (date: string) => {
    setSelectedSettleDate(date);
    const storageKey = `dual_invest_settle_date_${exchange}_${coin}_${direction}`;
    localStorage.setItem(storageKey, date);
  };

  // 右键菜单处理
  const handleContextMenu = useCallback((e: React.MouseEvent, product: Product) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, product });
  }, []);

  const handleSendToChat = useCallback(() => {
    if (!ctxMenu) return;
    const p = ctxMenu.product;
    const dir = p.direction === "buy_low" ? t("dualBuyLow") : t("dualSellHigh");
    const msg = `${p.coin} ${dir} | Strike: $${p.strikePrice} | APR: ${p.aprPercent.toFixed(2)}% | ${t("dualDuration")}: ${p.duration}天 | ${t("dualSettleDate")}: ${p.settleDate}`;
    sendToChat(msg);
    setCtxMenu(null);
  }, [ctxMenu, sendToChat, t]);

  const handleOpenSubscribeModal = useCallback(() => {
    if (!ctxMenu) return;
    setSubModal(ctxMenu.product);
    setCtxMenu(null);
  }, [ctxMenu]);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!ctxMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [ctxMenu]);

  // Filter products by selected settle date
  const filteredProducts = useMemo(
    () =>
      selectedSettleDate === ""
        ? []
        : products.filter((p) => p.settleDate === selectedSettleDate),
    [selectedSettleDate, products]
  );
  
  // Filter orders by coin and direction
  const filteredOrders = useMemo(() => {
    const source = orderTab === "active" 
      ? (activeOrdersData?.orders ?? []) 
      : (historyOrdersData?.orders ?? []);
    
    return source.filter(order => {
      if (orderCoinFilter !== "all" && order.coin !== orderCoinFilter) return false;
      if (orderDirectionFilter !== "all" && order.direction !== orderDirectionFilter) return false;
      return true;
    });
  }, [orderTab, activeOrdersData, historyOrdersData, orderCoinFilter, orderDirectionFilter]);
  
  // Calculate order statistics
  const orderStats = useMemo(() => {
    const orders = filteredOrders;
    const totalInvest = orders.reduce(
      (sum, o) => sum + (o.investUnknown ? 0 : o.investAmt),
      0
    );
    const totalProfit = orders.reduce((sum, o) => {
      const profit = o.actualProfit !== null && o.actualProfit !== undefined 
        ? o.actualProfit 
        : (o.expectedProfit ?? 0);
      return sum + profit;
    }, 0);
    const avgAPR = orders.length > 0 
      ? orders.reduce((sum, o) => sum + o.aprPercent, 0) / orders.length 
      : 0;
    
    return { totalInvest, totalProfit, avgAPR, count: orders.length };
  }, [filteredOrders]);

  const handleSubscribe = async () => {
    if (!subModal) return;
    const amount = (subModal.minAmount * subPct) / 100;
    try {
      const res = await fetch(`${API_BASE}/dual-invest/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange,
          product_id: subModal.id,
          invest_amount: amount,
        }),
      });
      if (!res.ok) throw new Error("Subscription failed");
      setSubModal(null);
    } catch (err) {
      console.error(err);
    }
  };

  // ProductsView Component
  const ProductsView = () => (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-6">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="text-sm font-medium">{t("dualExchange")}</label>
          <select value={exchange} onChange={(e) => setExchange(e.target.value as Exchange)} className="px-3 py-1.5 bg-background/50 border border-border/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
            {exchangeStatus.okx && <option value="okx">OKX</option>}
            {exchangeStatus.binance && <option value="binance">Binance</option>}
          </select>
          <label className="text-sm font-medium ml-4">{t("dualInvestCoin")}</label>
          <div className="flex gap-2">
            {COINS.map((c) => (
              <button key={c} onClick={() => setCoin(c)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${coin === c ? "bg-primary/20 text-primary border border-primary/30" : "bg-accent/50 hover:bg-accent"}`}>{c}</button>
            ))}
          </div>
          <label className="text-sm font-medium ml-4">{t("dualOrderType")}</label>
          <div className="flex gap-2">
            <button onClick={() => setDirection("buy_low")} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${direction === "buy_low" ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-accent/50 hover:bg-accent"}`}>
              <TrendingDown size={14} />{t("dualBuyLow")}
            </button>
            <button onClick={() => setDirection("sell_high")} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${direction === "sell_high" ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-accent/50 hover:bg-accent"}`}>
              <TrendingUp size={14} />{t("dualSellHigh")}
            </button>
          </div>
          {settleDates.length > 0 && selectedSettleDate && (
            <>
              <label className="text-sm font-medium ml-4">{t("dualSettleDate")}</label>
              <select value={selectedSettleDate} onChange={(e) => handleSettleDateChange(e.target.value)} className="px-3 py-1.5 text-sm bg-background/50 border border-border/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 hover:bg-accent/20 transition-colors cursor-pointer">
                {settleDates.map((date) => {
                  const count = products.filter((p) => p.settleDate === date).length;
                  return <option key={date} value={date}>{date} ({count})</option>;
                })}
              </select>
            </>
          )}
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-2xl p-6">
        <h3 className="text-lg font-semibold mb-4">{t("dualTabProducts")}</h3>
        {loading ? (
          <div className="flex items-center justify-center py-12"><div className="text-muted-foreground">{t("loading")}</div></div>
        ) : error ? (
          <div className="m-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">{error}</div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground"><div className="text-4xl mb-4">📊</div><p>{t("dualInvestEmpty")}</p></div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground"><div className="text-4xl mb-4">🔍</div><p>{t("noProductsForDate") || "No products for selected date"}</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border/50"><tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("dualInvestCoin")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("dualOrderType")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">APR</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("colStrike")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("dualDuration")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("dualSettleDate")}</th>
              </tr></thead>
              <tbody>
                {filteredProducts.map((prod) => (
                  <motion.tr key={prod.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-b border-border/30 hover:bg-card/50 transition-colors cursor-pointer" onClick={() => setSubModal(prod)} onContextMenu={(e) => handleContextMenu(e, prod)} whileHover={{ x: 4 }}>
                    <td className="px-4 py-3"><span className="font-semibold text-sm">{prod.coin}</span></td>
                    <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${prod.direction === "buy_low" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                      {prod.direction === "buy_low" ? <><TrendingDown size={12} />{t("dualBuyLow")}</> : <><TrendingUp size={12} />{t("dualSellHigh")}</>}
                    </span></td>
                    <td className="px-4 py-3"><span className="font-semibold text-primary text-sm">{prod.aprPercent.toFixed(2)}%</span></td>
                    <td className="px-4 py-3 font-mono text-sm">${prod.strikePrice.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm">{prod.duration} {t("days")}</td>
                    <td className="px-4 py-3 text-sm">{prod.settleDate}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );

  // OrdersView Component  
  const OrdersView = () => (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-6">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="text-sm font-medium">{t("dualInvestCoin")}</label>
          <select value={orderCoinFilter} onChange={(e) => setOrderCoinFilter(e.target.value)} className="px-3 py-1.5 bg-background/50 border border-border/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
            <option value="all">{t("dualFilterAll")}</option>
            {COINS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="text-sm font-medium ml-4">{t("dualOrderType")}</label>
          <select value={orderDirectionFilter} onChange={(e) => setOrderDirectionFilter(e.target.value)} className="px-3 py-1.5 bg-background/50 border border-border/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
            <option value="all">{t("dualFilterAll")}</option>
            <option value="buy_low">{t("dualBuyLow")}</option>
            <option value="sell_high">{t("dualSellHigh")}</option>
          </select>
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass rounded-xl p-6">
          <div className="text-xs text-muted-foreground mb-2">{t("dualTotalInvest")}</div>
          <div className="text-2xl font-bold">{orderStats.totalInvest.toFixed(2)} USDT</div>
          <div className="text-xs text-muted-foreground mt-1">{orderStats.count} 订单</div>
        </div>
        <div className="glass rounded-xl p-6">
          <div className="text-xs text-muted-foreground mb-2">{t("dualTotalProfit")}</div>
          <div className={cn("text-2xl font-bold", orderStats.totalProfit >= 0 ? "text-green-400" : "text-red-400")}>
            {orderStats.totalProfit >= 0 ? "+" : ""}{orderStats.totalProfit.toFixed(2)} USDT
          </div>
          <div className="text-xs text-muted-foreground mt-1">{orderTab === "active" ? t("dualExpectedProfit") : t("dualActualProfit")}</div>
        </div>
        <div className="glass rounded-xl p-6">
          <div className="text-xs text-muted-foreground mb-2">{t("dualAvgAPR")}</div>
          <div className="text-2xl font-bold">{orderStats.avgAPR.toFixed(2)}%</div>
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-2xl p-6">
        <div className="flex gap-2 mb-6">
          <button onClick={() => setOrderTab("active")} className={cn("px-4 py-2 rounded-lg font-medium transition-all", orderTab === "active" ? "bg-primary text-primary-foreground" : "hover:bg-accent/50 text-muted-foreground")}>{t("dualOrdersActive")}</button>
          <button onClick={() => setOrderTab("history")} className={cn("px-4 py-2 rounded-lg font-medium transition-all", orderTab === "history" ? "bg-primary text-primary-foreground" : "hover:bg-accent/50 text-muted-foreground")}>{t("dualOrdersHistory")}</button>
        </div>
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground"><div className="text-4xl mb-4">📭</div><p>{t("dualNoOrders")}</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border/50"><tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("dualInvestCoin")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("dualOrderType")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("colStrike")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">APR</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("dualTotalInvest")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  {orderTab === "active" ? t("dualExpectedProfit") : t("dualProfit")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("dualSettleDate")}</th>
              </tr></thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const profit = order.actualProfit !== null && order.actualProfit !== undefined ? order.actualProfit : (order.expectedProfit ?? 0);
                  const profitUnavailable =
                    order.investUnknown === true && Math.abs(profit) < 1e-9;
                  const isActualProfit =
                    order.actualProfit !== null && order.actualProfit !== undefined;
                  const profitCcy = isActualProfit
                    ? order.direction === "sell_high"
                      ? order.coin
                      : order.investCcy
                    : (order.expectedProfitCcy || order.investCcy);
                  return (
                    <motion.tr key={order.ordId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-b border-border/30 hover:bg-card/50 transition-colors">
                      <td className="px-4 py-3"><span className="font-semibold text-sm">{order.coin}</span></td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${order.direction === "buy_low" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                        {order.direction === "buy_low" ? <><TrendingDown size={12} />{t("dualBuyLow")}</> : <><TrendingUp size={12} />{t("dualSellHigh")}</>}
                      </span></td>
                      <td className="px-4 py-3 font-mono text-sm">${order.strikePrice.toLocaleString()}</td>
                      <td className="px-4 py-3"><span className="font-semibold text-primary text-sm">{order.aprPercent.toFixed(2)}%</span></td>
                      <td className="px-4 py-3 text-sm">
                        {order.investUnknown === true ? (
                          <span className="text-muted-foreground cursor-help border-b border-dotted border-muted-foreground/50" title={t("dualInvestNotionalUnavailableHint")}>
                            —
                          </span>
                        ) : (
                          <>
                            {formatDcdAmount(order.investAmt, order.investCcy)} {order.investCcy}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {profitUnavailable ? (
                          <span className="font-semibold text-sm text-muted-foreground cursor-help border-b border-dotted border-muted-foreground/50" title={t("dualInvestNotionalUnavailableHint")}>
                            —
                          </span>
                        ) : (
                          <span className={cn("font-semibold text-sm", profit >= 0 ? "text-green-400" : "text-red-400")}>
                            {profit >= 0 ? "+" : ""}
                            {formatDcdAmount(profit, profitCcy)}
                            {profitCcy ? ` ${profitCcy}` : ""}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">{order.settleDate}</td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );

  if (!statusLoaded && !exchangeStatus.okx && !exchangeStatus.binance) {
    // 只在没有缓存数据且正在加载时显示 loading
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground">{t("loading")}</div>
      </div>
    );
  }

  if (statusLoaded && !isConfigured) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass p-12 rounded-3xl text-center max-w-2xl"
        >
          <DollarSign size={64} className="mx-auto mb-6 text-primary" />
          <h1 className="text-3xl font-bold mb-4">{t("navDual")}</h1>
          <p className="text-muted-foreground mb-4">{t("dualInvestNotConfigured")}</p>
          <p className="text-sm text-muted-foreground">{t("dualInvestConfigHint")}</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header with Price and Tabs */}
      <div className="border-b border-border/50 bg-card/20 backdrop-blur-sm">
        <div className="flex items-center justify-center p-4">
          {spotPrice && (
            <div className="flex items-center gap-2 px-4 py-2 glass rounded-xl border border-primary/30">
              <div className="text-xs text-muted-foreground">{coin} {t("dualSpotPrice")}:</div>
              <div className="text-lg font-semibold text-primary">${spotPrice.toLocaleString()}</div>
            </div>
          )}
        </div>
        
        {/* Main Tab Bar */}
        <div className="flex gap-2 px-6 pb-4">
          <button
            onClick={() => setMainTab("products")}
            className={cn(
              "px-6 py-2.5 rounded-lg font-medium transition-all",
              mainTab === "products" 
                ? "bg-primary text-primary-foreground shadow-lg" 
                : "hover:bg-accent/50 text-muted-foreground"
            )}
          >
            {t("dualTabProducts")}
          </button>
          <button
            onClick={() => setMainTab("orders")}
            className={cn(
              "px-6 py-2.5 rounded-lg font-medium transition-all",
              mainTab === "orders" 
                ? "bg-primary text-primary-foreground shadow-lg" 
                : "hover:bg-accent/50 text-muted-foreground"
            )}
          >
            {t("dualTabOrders")}
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto">
        {mainTab === "products" ? (
          <ProductsView />
        ) : (
          <OrdersView />
        )}
      </div>

      {/* Subscribe Modal */}
      <AnimatePresence>
        {subModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setSubModal(null)}
            />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative glass border border-border/50 rounded-2xl w-full max-w-md shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-4">
                  {t("dualSubscribeTitle")} - {subModal.coin}
                </h3>

                <div className="space-y-4">
                  <div className="p-4 glass rounded-xl border border-border/30">
                    <div className="text-sm text-muted-foreground mb-2">APR</div>
                    <div className="text-2xl font-bold text-primary">{subModal.aprPercent.toFixed(2)}%</div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      {t("dualInvestAmount")} ({subPct}%)
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={subPct}
                      onChange={(e) => setSubPct(parseInt(e.target.value))}
                      className="w-full"
                    />
                    <div className="text-right text-sm text-muted-foreground mt-1">
                      {((subModal.minAmount * subPct) / 100).toFixed(2)} {subModal.investCoin}
                    </div>
                  </div>

                  <button
                    onClick={handleSubscribe}
                    className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
                  >
                    {t("dualSubscribe")}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Context Menu */}
      <AnimatePresence>
        {ctxMenu && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed z-50 glass rounded-xl shadow-2xl overflow-hidden border border-border/50"
            style={{ top: ctxMenu.y, left: ctxMenu.x }}
          >
            <button
              className="w-full px-4 py-2 text-sm text-left hover:bg-accent/50 transition-colors"
              onClick={handleOpenSubscribeModal}
            >
              💰 {t("dualSubscribe")}
            </button>
            <button
              className="w-full px-4 py-2 text-sm text-left hover:bg-accent/50 transition-colors"
              onClick={handleSendToChat}
            >
              💬 {t("sendToChat")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
