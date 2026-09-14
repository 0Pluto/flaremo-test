import { useRouter } from "@tanstack/react-router";
import { ChevronDown, Globe } from "lucide-react";
import {
  getLocalizedPath,
  LOCALE_LABELS,
  type Locale,
  normalizeLocale,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@/lib/seo";

type LocaleSwitcherProps = {
  locale: Locale;
  /** Path of the current route (e.g. "/", "/docs", "/docs/deploy"). */
  path: string;
};

export function LocaleSwitcher({ locale, path }: LocaleSwitcherProps) {
  const router = useRouter();
  const current = normalizeLocale(locale);

  return (
    <div className="relative inline-flex items-center">
      <Globe className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
      <select
        aria-label="Select language"
        className="h-8 cursor-pointer appearance-none rounded-md border border-border/60 bg-background pl-8 pr-7 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-1 focus:ring-flame-500"
        onChange={(e) => {
          const next = e.target.value as SupportedLocale;
          const nextHref = getLocalizedPath(path, next);
          try {
            void router.navigate({ to: nextHref as string });
          } catch {
            window.location.href = nextHref;
          }
        }}
        value={current}
      >
        {SUPPORTED_LOCALES.map((loc) => (
          <option
            className="bg-background text-foreground"
            key={loc}
            value={loc}
          >
            {LOCALE_LABELS[loc]}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 size-3 text-muted-foreground" />
    </div>
  );
}
