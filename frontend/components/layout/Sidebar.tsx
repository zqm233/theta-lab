"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { 
  TrendingUp, 
  Wallet, 
  DollarSign, 
  Settings,
  Bot,
  Sun,
  Moon,
  Languages
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

const navItems = [
  { id: "options", icon: TrendingUp, href: "/" },
  { id: "dual", icon: DollarSign, href: "/dual-invest" },
  { id: "accounts", icon: Wallet, href: "/accounts" },
  { id: "devtools", icon: Bot, href: "/devtools" },
  { id: "settings", icon: Settings, href: "/settings" },
] as const;

export default function Sidebar() {
  const { t, lang, setLang } = useI18n();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const toggleLang = () => {
    setLang(lang === "zh" ? "en" : "zh");
  };

  return (
    <motion.aside
      initial={{ x: -100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="group fixed left-0 top-0 z-50 h-screen w-20 hover:w-56 transition-all duration-300 ease-out overflow-visible"
    >
      <div 
        className="h-full flex flex-col py-6 bg-card/95 backdrop-blur-xl border-r border-border/50"
        style={{
          boxShadow: '4px 0 24px rgba(0, 0, 0, 0.1)',
        }}
      >
        {/* Logo - Text Only */}
        <div className="w-full mb-8 flex items-center justify-center group-hover:justify-start group-hover:pl-3">
          <div className="flex items-center gap-3">
            <div className="text-primary font-bold text-lg whitespace-nowrap transition-all">
              <span className="group-hover:hidden">θ</span>
              <span className="hidden group-hover:inline">ThetaLab</span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            
            return (
              <Link key={item.id} href={item.href}>
                <motion.div
                  whileHover={{ scale: 1.03, x: 2 }}
                  whileTap={{ scale: 0.97 }}
                  className={cn(
                    "relative flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-200 cursor-pointer",
                    active
                      ? "text-primary-foreground shadow-lg"
                      : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                  )}
                  style={
                    active
                      ? {
                          background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%)',
                          boxShadow: '0 8px 16px rgba(108, 99, 255, 0.3)',
                        }
                      : {}
                  }
                >
                  <Icon className="w-5 h-5 flex-shrink-0" strokeWidth={active ? 2.5 : 2} />
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap text-sm font-semibold">
                    {t(`nav${item.id.charAt(0).toUpperCase() + item.id.slice(1)}` as any)}
                  </span>
                  {active && (
                    <motion.div
                      layoutId="activeNav"
                      className="absolute inset-0 rounded-2xl -z-10"
                      style={{
                        background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%)',
                      }}
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                </motion.div>
              </Link>
            );
          })}
        </nav>

        {/* Theme & Language Toggle */}
        <div className="px-3 pt-4 border-t border-border/50 space-y-2">
          {/* Theme Toggle */}
          {mounted && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleTheme}
              className="w-full flex items-center gap-4 px-4 py-3 rounded-xl bg-secondary/80 hover:bg-secondary transition-colors"
              title={theme === "dark" ? t("lightMode") : t("darkMode")}
            >
              {theme === "dark" ? (
                <Sun className="w-5 h-5 flex-shrink-0" />
              ) : (
                <Moon className="w-5 h-5 flex-shrink-0" />
              )}
              <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap text-sm font-medium">
                {theme === "dark" ? t("lightMode") : t("darkMode")}
              </span>
            </motion.button>
          )}
          
          {/* Language Toggle */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleLang}
            className="w-full flex items-center gap-4 px-4 py-3 rounded-xl bg-secondary/80 hover:bg-secondary transition-colors"
            title={lang === "zh" ? "English" : "中文"}
          >
            <Languages className="w-5 h-5 flex-shrink-0" />
            <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap text-sm font-medium">
              {lang === "zh" ? "English" : "中文"}
            </span>
          </motion.button>
        </div>
      </div>
    </motion.aside>
  );
}
