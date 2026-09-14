import { Link } from "@tanstack/react-router";
import { Monitor, Moon, Sun } from "lucide-react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SiteMark } from "@/components/site-mark";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  getLocalizedPath,
  getPathWithoutLocale,
  type Locale,
  normalizeLocale,
  type SupportedLocale,
} from "@/lib/seo";
import { cycleTheme, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
};

type SiteNavProps = {
  locale: Locale;
  currentPath: string;
};

const NAV_LABELS: Record<
  SupportedLocale,
  { home: string; docs: string; signIn: string }
> = {
  en: { home: "Home", docs: "Docs", signIn: "Sign In" },
  zh: { home: "首页", docs: "文档", signIn: "进入控制台" },
  ja: { home: "ホーム", docs: "ドキュメント", signIn: "ログイン" },
  fr: { home: "Accueil", docs: "Documentation", signIn: "Se connecter" },
  es: { home: "Inicio", docs: "Documentación", signIn: "Iniciar sesión" },
  ko: { home: "홈", docs: "문서", signIn: "로그인" },
  ru: { home: "Главная", docs: "Документация", signIn: "Войти" },
  ar: { home: "الرئيسية", docs: "المستندات", signIn: "تسجيل الدخول" },
};

const THEME_LABELS: Record<ThemeMode, { label: string; next: string }> = {
  system: { label: "跟随系统", next: "浅色模式" },
  light: { label: "浅色模式", next: "深色模式" },
  dark: { label: "深色模式", next: "跟随系统" },
};

function ThemeToggle() {
  const { mode, setMode } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setMode(cycleTheme(mode))}
      title={`当前：${THEME_LABELS[mode].label}，点击切换为${THEME_LABELS[mode].next}`}
      aria-label="Toggle theme"
      className="inline-flex size-8 items-center justify-center rounded-full text-mist transition-colors hover:bg-wash hover:text-ink cursor-pointer border border-transparent hover:border-line/60"
    >
      {mode === "system" && <Monitor className="size-4" />}
      {mode === "light" && <Sun className="size-4 text-amber-500" />}
      {mode === "dark" && <Moon className="size-4 text-signal" />}
    </button>
  );
}

export function SiteNav({ locale, currentPath }: SiteNavProps) {
  const norm = normalizeLocale(locale);
  const labels = NAV_LABELS[norm];
  const homePath = getLocalizedPath("/", norm);
  const docsPath = getLocalizedPath("/docs", norm);

  const items: NavItem[] = [
    { to: homePath, label: labels.home },
    { to: docsPath, label: labels.docs },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-paper/85 backdrop-blur-md transition-colors duration-200">
      <div className="container-x flex h-14 items-center justify-between gap-4">
        {/* Logo */}
        <Link
          aria-label="FlareMo home"
          className="flex items-center gap-2 text-ink transition-opacity hover:opacity-85"
          to={homePath}
        >
          <SiteMark iconSize="size-6" />
        </Link>

        {/* 居中药丸导航 */}
        <nav className="hidden items-center gap-1 rounded-full border border-line/60 bg-soft-surface/80 p-1 shadow-2xs md:flex">
          {items.map((item) => {
            const active = isActive(currentPath, item.to);
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full px-4 py-1 text-xs font-semibold transition-all duration-150",
                  active
                    ? "bg-surface text-ink shadow-[var(--panel-elev)] font-bold"
                    : "text-mist hover:text-ink hover:bg-wash",
                )}
                key={item.to}
                to={item.to}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* 右侧动作区 */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          <ThemeToggle />
          <LocaleSwitcher locale={norm} path={currentPath} />

          <a
            className="hidden items-center gap-1.5 rounded-full border border-line/70 bg-surface/80 px-3 py-1 text-xs font-semibold text-mist shadow-2xs transition-colors hover:bg-wash hover:text-ink sm:inline-flex"
            href="https://github.com/realchendahuang/FlareMo"
            rel="noopener noreferrer"
            target="_blank"
          >
            GitHub ↗
          </a>

          <Button
            asChild
            size="xs"
            variant="flame"
            className="h-8 px-3.5 shadow-xs"
          >
            <a href="https://app.flaremo.app" rel="noopener noreferrer">
              {labels.signIn}
            </a>
          </Button>
        </div>
      </div>

      {/* 移动端快捷导航栏 */}
      <div className="container-x flex gap-1 overflow-x-auto pb-2 pt-1 md:hidden">
        {items.map((item) => {
          const active = isActive(currentPath, item.to);
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1 text-xs font-semibold transition-colors",
                active
                  ? "bg-surface text-ink shadow-xs border border-line/60"
                  : "text-mist hover:bg-soft-surface hover:text-ink",
              )}
              key={item.to}
              to={item.to}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}

function isActive(currentPath: string, itemTo: string): boolean {
  const normCurrent = getPathWithoutLocale(currentPath);
  const normItem = getPathWithoutLocale(itemTo);
  if (normItem === "/") {
    return normCurrent === "/";
  }
  return normCurrent === normItem || normCurrent.startsWith(`${normItem}/`);
}
