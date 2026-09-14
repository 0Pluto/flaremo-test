import { Link } from "@tanstack/react-router";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SiteMark } from "@/components/site-mark";
import {
  getLocalizedPath,
  getPathWithoutLocale,
  type Locale,
  normalizeLocale,
  type SupportedLocale,
} from "@/lib/seo";

type NavItem = {
  to: string;
  label: string;
};

type SiteNavProps = {
  locale: Locale;
  /** Path of the current route, e.g. "/", "/docs". */
  currentPath: string;
};

const NAV_LABELS: Record<
  SupportedLocale,
  { home: string; docs: string; signIn: string }
> = {
  en: { home: "Home", docs: "Docs", signIn: "Sign in" },
  zh: { home: "首页", docs: "文档", signIn: "登录 / 注册" },
  ja: { home: "ホーム", docs: "ドキュメント", signIn: "ログイン" },
  fr: { home: "Accueil", docs: "Documentation", signIn: "Se connecter" },
  es: { home: "Inicio", docs: "Documentación", signIn: "Iniciar sesión" },
  ko: { home: "홈", docs: "문서", signIn: "로그인" },
  ru: { home: "Главная", docs: "Документация", signIn: "Войти" },
  ar: { home: "الرئيسية", docs: "المستندات", signIn: "تسجيل الدخول" },
};

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
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/65">
      <div className="container-x flex h-14 items-center justify-between gap-4">
        <Link
          aria-label="FlareMo home"
          className="flex items-center gap-2 text-foreground transition-opacity hover:opacity-80"
          to={homePath}
        >
          <SiteMark iconSize="size-6" />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {items.map((item) => {
            const active = isActive(currentPath, item.to);
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
                key={item.to}
                to={item.to}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <a
            className="inline-flex items-center rounded-md bg-brand-gradient px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-[filter,transform] hover:brightness-105 active:translate-y-px"
            href="https://app.flaremo.app"
            rel="noopener noreferrer"
          >
            {labels.signIn}
          </a>
          <a
            className="hidden items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            href="https://github.com/realchendahuang/FlareMo"
            rel="noopener noreferrer"
            target="_blank"
          >
            GitHub ↗
          </a>
          <LocaleSwitcher locale={norm} path={currentPath} />
        </div>
      </div>
      <div className="container-x flex gap-1 overflow-x-auto pb-2 pt-1 md:hidden">
        {items.map((item) => {
          const active = isActive(currentPath, item.to);
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
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
