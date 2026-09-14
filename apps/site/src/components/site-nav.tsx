import { Link } from "@tanstack/react-router";
import { Check, ExternalLink, Monitor, Moon, Sun } from "lucide-react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SiteMark } from "@/components/site-mark";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getLocalizedPath,
  getPathWithoutLocale,
  type Locale,
  normalizeLocale,
  type SupportedLocale,
} from "@/lib/seo";
import type { ThemeMode } from "@/lib/theme";
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
  { home: string; docs: string; deploy: string; signIn: string }
> = {
  en: { home: "Home", docs: "Docs", deploy: "Deploy", signIn: "Console" },
  zh: { home: "首页", docs: "文档", deploy: "快速部署", signIn: "进入控制台" },
  ja: {
    home: "ホーム",
    docs: "ドキュメント",
    deploy: "デプロイ",
    signIn: "コンソール",
  },
  fr: { home: "Accueil", docs: "Docs", deploy: "Déployer", signIn: "Console" },
  es: { home: "Inicio", docs: "Docs", deploy: "Desplegar", signIn: "Consola" },
  ko: { home: "홈", docs: "문서", deploy: "배포 가이드", signIn: "콘솔" },
  ru: {
    home: "Главная",
    docs: "Документация",
    deploy: "Развернуть",
    signIn: "Консоль",
  },
  ar: {
    home: "الرئيسية",
    docs: "المستندات",
    deploy: "النشر",
    signIn: "لوحة التحكم",
  },
};

const THEME_OPTIONS: Array<{
  mode: ThemeMode;
  label: string;
  icon: typeof Sun;
}> = [
  { mode: "light", label: "浅色模式 / Light", icon: Sun },
  { mode: "dark", label: "深色模式 / Dark", icon: Moon },
  { mode: "system", label: "跟随系统 / System", icon: Monitor },
];

function ThemeToggle() {
  const { mode, setMode } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="切换主题 / Switch theme"
          className="inline-flex size-8 items-center justify-center rounded-full border border-line/70 bg-surface/90 text-mist shadow-2xs transition-colors hover:bg-wash hover:text-ink hover:border-line focus:outline-none focus:ring-1 focus:ring-signal/40 cursor-pointer"
        >
          {mode === "light" && <Sun className="size-3.5 text-amber-500" />}
          {mode === "dark" && <Moon className="size-3.5 text-signal" />}
          {mode === "system" && <Monitor className="size-3.5 text-mist" />}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-40 p-1.5">
        <DropdownMenuLabel className="px-2 py-1 text-[10px] text-fog font-medium">
          外观 / Theme
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEME_OPTIONS.map((opt) => {
          const isSelected = mode === opt.mode;
          const Icon = opt.icon;
          return (
            <DropdownMenuItem
              key={opt.mode}
              onClick={() => setMode(opt.mode)}
              className="flex items-center justify-between px-2.5 py-1.5 text-xs cursor-pointer rounded-lg hover:bg-wash focus:bg-wash"
            >
              <div className="flex items-center gap-2">
                <Icon
                  className={cn(
                    "size-3.5",
                    opt.mode === "light" && "text-amber-500",
                    opt.mode === "dark" && "text-signal",
                    opt.mode === "system" && "text-mist",
                  )}
                />
                <span
                  className={
                    isSelected ? "font-bold text-signal-ink" : "text-ink"
                  }
                >
                  {opt.label.split(" / ")[0]}
                </span>
              </div>
              {isSelected && (
                <Check className="size-3.5 text-signal shrink-0" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("fill-current", className)}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

export function SiteNav({ locale, currentPath }: SiteNavProps) {
  const norm = normalizeLocale(locale);
  const labels = NAV_LABELS[norm];
  const homePath = getLocalizedPath("/", norm);
  const docsPath = getLocalizedPath("/docs", norm);
  const deployPath = getLocalizedPath("/docs/deploy", norm);

  const items: NavItem[] = [
    { to: homePath, label: labels.home },
    { to: docsPath, label: labels.docs },
    { to: deployPath, label: labels.deploy },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-paper/85 backdrop-blur-md transition-colors duration-200">
      <div className="container-x flex h-14 items-center justify-between gap-3">
        {/* Logo */}
        <Link
          aria-label="FlareMo home"
          className="flex items-center gap-2 text-ink transition-opacity hover:opacity-85 shrink-0"
          to={homePath}
        >
          <SiteMark iconSize="size-6" />
        </Link>

        {/* 居中统一胶囊导航 */}
        <nav className="hidden items-center gap-1 rounded-full border border-line/60 bg-soft-surface/80 p-1 shadow-2xs md:flex">
          {items.map((item) => {
            const active = isActive(currentPath, item.to);
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full px-3.5 py-1 text-xs font-semibold transition-all duration-150",
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

        {/* 右侧工具栏：统一高度 h-8 与圆角设计 */}
        <div className="flex items-center gap-2">
          {/* GitHub 按钮 */}
          <a
            className="hidden items-center gap-1.5 h-8 rounded-full border border-line/70 bg-surface/90 px-3 text-xs font-medium text-ink shadow-2xs transition-colors hover:bg-wash hover:border-line sm:inline-flex"
            href="https://github.com/realchendahuang/FlareMo"
            rel="noopener noreferrer"
            target="_blank"
            title="GitHub 源码仓库"
          >
            <GithubIcon className="size-3.5" />
            <span>GitHub</span>
            <ExternalLink className="size-2.5 text-fog" />
          </a>

          {/* 国际化语言切换 (shadcn DropdownMenu) */}
          <LocaleSwitcher locale={norm} path={currentPath} />

          {/* 外观模式切换 (shadcn DropdownMenu) */}
          <ThemeToggle />

          {/* 快速进入应用 CTA */}
          <Button
            asChild
            size="xs"
            variant="flame"
            className="h-8 px-3.5 rounded-full shadow-xs"
          >
            <a href="https://app.flaremo.app" rel="noopener noreferrer">
              {labels.signIn}
            </a>
          </Button>
        </div>
      </div>

      {/* 移动端快捷导航栏 */}
      <div className="container-x flex gap-1.5 overflow-x-auto pb-2 pt-0.5 md:hidden no-scrollbar">
        {items.map((item) => {
          const active = isActive(currentPath, item.to);
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full px-3 py-0.5 text-xs font-semibold transition-colors",
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
