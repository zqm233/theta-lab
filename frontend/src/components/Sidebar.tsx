import { useI18n } from "../i18n";
import { useTheme } from "../theme";

interface Props {
  active: string;
  onNavigate: (page: string) => void;
}

export default function Sidebar({ active, onNavigate }: Props) {
  const { lang, setLang, t } = useI18n();
  const { theme, toggleTheme } = useTheme();

  const navItems = [
    { id: "options", icon: "⚡", label: t("navOptions") },
    { id: "dual", icon: "💰", label: t("navDualInvest") },
    { id: "accounts", icon: "📊", label: t("navAccounts") },
    { id: "workbench", icon: "🛠", label: t("navWorkbench") },
    { id: "settings", icon: "⚙", label: t("navSettings") },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="sidebar-logo">
          <span className="sidebar-logo-icon">θ</span>
          <span className="sidebar-brand">ThetaLab</span>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`sidebar-nav-item${active === item.id ? " active" : ""}`}
              onClick={() => onNavigate(item.id)}
              title={item.label}
            >
              <span className="sidebar-nav-icon">{item.icon}</span>
              <span className="sidebar-nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="sidebar-bottom">
        <button className="sidebar-setting-btn" onClick={toggleTheme} title={theme === "dark" ? t("lightMode") : t("darkMode")}>
          <span>{theme === "dark" ? "☀" : "🌙"}</span>
        </button>
        <button
          className="sidebar-setting-btn"
          onClick={() => setLang(lang === "zh" ? "en" : "zh")}
          title={lang === "zh" ? "English" : "中文"}
        >
          <span>🌐</span>
        </button>
      </div>
    </aside>
  );
}
