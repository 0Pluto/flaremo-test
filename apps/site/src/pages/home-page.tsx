import { useLocation } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  ArrowRight,
  Bot,
  Database,
  ExternalLink,
  Image as ImageIcon,
  Lock,
  Moon,
  ServerOff,
  ShieldCheck,
  Sun,
  Users,
  WifiOff,
} from "lucide-react";
import { useState } from "react";
import { getHomeContent } from "@/content/copy";
import type { Locale } from "@/lib/seo";

const FEATURE_ICONS = [
  ShieldCheck,
  Database,
  WifiOff,
  Bot,
  Users,
  ArrowLeftRight,
];

export function HomePage() {
  const { pathname } = useLocation();
  const locale: Locale = pathname.startsWith("/en") ? "en-US" : "zh-CN";
  const home = getHomeContent(locale);

  return (
    <main>
      <Hero locale={locale} home={home} />
      <Screenshots
        heading={home.screenshotsHeading}
        subtitle={home.screenshotsSubtitle}
        locale={locale}
      />
      <Features
        heading={home.featuresHeading}
        subtitle={home.featuresSubtitle}
        items={home.features}
        icons={FEATURE_ICONS}
      />
      <Comparison
        heading={home.comparisonHeading}
        subtitle={home.comparisonSubtitle}
        rows={home.comparisonRows}
        locale={locale}
      />
      <Faq heading={home.faqHeading} items={home.faqItems} />
      <CtaSection
        heading={home.ctaHeading}
        subtitle={home.ctaSubtitle}
        buttonText={home.ctaButton}
        locale={locale}
      />
    </main>
  );
}

function Hero({
  locale,
  home,
}: {
  locale: Locale;
  home: ReturnType<typeof getHomeContent>;
}) {
  return (
    <section className="relative overflow-hidden border-b border-border/60 bg-gradient-to-b from-background via-background to-flame-50/30 py-20 md:py-28">
      <div className="container-x space-y-12">
        <div className="mx-auto max-w-3xl space-y-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3.5 py-1 text-xs font-medium text-muted-foreground shadow-xs backdrop-blur">
            <span className="size-2 rounded-full bg-flame-500 animate-pulse" />
            {home.heroEyebrow}
          </div>
          <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl">
            {home.heroTitle}
          </h1>
          <p className="mx-auto max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
            {home.heroSubtitle}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <a
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-gradient px-6 py-3 text-sm font-semibold text-primary-foreground shadow-md transition-all hover:brightness-105 active:translate-y-px motion-safe:duration-200"
              href={locale === "zh-CN" ? "/docs/deploy" : "/en/docs/deploy"}
            >
              {home.primaryCta}
              <ArrowRight className="size-4" />
            </a>
            <a
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border/70 bg-background/90 px-5 py-3 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-secondary active:translate-y-px"
              href="https://github.com/realchendahuang/FlareMo"
              rel="noopener noreferrer"
              target="_blank"
            >
              {home.secondaryCta}
              <ExternalLink className="size-3.5 text-muted-foreground" />
            </a>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <HeroStat
            icon={<Database className="size-5 text-flame-500" />}
            title="5 GB"
            body={home.statMemos}
          />
          <HeroStat
            icon={<ImageIcon className="size-5 text-flame-500" />}
            title="10 GB"
            body={home.statPhotos}
          />
          <HeroStat
            icon={<ServerOff className="size-5 text-flame-500" />}
            title={locale === "zh-CN" ? "0 台服务器" : "0 Servers"}
            body={home.statServers}
          />
          <HeroStat
            icon={<ShieldCheck className="size-5 text-flame-500" />}
            title={locale === "zh-CN" ? "100% 自主" : "100% Yours"}
            body={home.statUptime}
          />
        </div>
      </div>
    </section>
  );
}

function HeroStat({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-xs backdrop-blur transition-shadow hover:shadow-sm">
      <div className="mb-3 flex size-9 items-center justify-center rounded-xl bg-accent">
        {icon}
      </div>
      <div className="text-base font-semibold tracking-tight">{title}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{body}</div>
    </div>
  );
}

function Screenshots({
  heading,
  subtitle,
  locale,
}: {
  heading: string;
  subtitle: string;
  locale: Locale;
}) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  return (
    <section className="border-b border-border/60 bg-background py-20">
      <div className="container-x space-y-10">
        <div className="flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              {heading}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <div className="inline-flex items-center rounded-xl border border-border/80 bg-secondary/60 p-1 shadow-xs">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                theme === "light"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sun className="size-3.5 text-amber-500" />
              {locale === "zh-CN" ? "浅色明亮" : "Light"}
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                theme === "dark"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Moon className="size-3.5 text-indigo-400" />
              {locale === "zh-CN" ? "深色沉浸" : "Dark"}
            </button>
          </div>
        </div>

        <div className="grid items-end gap-8 lg:grid-cols-[1fr_260px]">
          {/* Desktop Browser Window Mockup */}
          <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-lg">
            <div className="flex h-9 items-center gap-2 border-b border-border/60 bg-muted/40 px-4">
              <div className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-[#ff5f56]" />
                <span className="size-2.5 rounded-full bg-[#ffbd2e]" />
                <span className="size-2.5 rounded-full bg-[#27c93f]" />
              </div>
              <div className="mx-auto flex h-6 max-w-xs flex-1 items-center justify-center gap-1.5 rounded-md border border-border/60 bg-background/80 px-3 text-[11px] text-muted-foreground shadow-2xs">
                <Lock className="size-2.5 text-flame-500" />
                <span>https://app.flaremo.app</span>
              </div>
            </div>
            <div className="relative aspect-[1024/711] w-full bg-muted/20">
              <img
                alt="FlareMo Desktop Timeline"
                className="h-full w-full object-cover transition-opacity duration-300"
                decoding="async"
                height="711"
                loading="lazy"
                src={
                  theme === "light"
                    ? "/docs-assets/flaremo-desktop-light.png"
                    : "/docs-assets/flaremo-desktop-dark.png"
                }
                width="1024"
              />
            </div>
          </div>

          {/* Mobile Phone Mockup */}
          <div className="mx-auto w-full max-w-[240px] overflow-hidden rounded-[2.2rem] border-4 border-muted/80 bg-card p-1 shadow-lg ring-1 ring-border/60">
            <div className="overflow-hidden rounded-[1.8rem] bg-background">
              <div className="flex h-6 items-center justify-center bg-muted/30">
                <span className="h-1 w-10 rounded-full bg-muted-foreground/30" />
              </div>
              <img
                alt="FlareMo Mobile Timeline"
                className="w-full object-cover"
                decoding="async"
                height="844"
                loading="lazy"
                src="/docs-assets/flaremo-mobile.png"
                width="390"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Features({
  heading,
  subtitle,
  items,
  icons,
}: {
  heading: string;
  subtitle: string;
  items: Array<{ title: string; description: string }>;
  icons: typeof FEATURE_ICONS;
}) {
  return (
    <section className="border-b border-border/60 bg-background py-20">
      <div className="container-x space-y-12">
        <div className="max-w-2xl space-y-2">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            {heading}
          </h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item, idx) => {
            const Icon = icons[idx] ?? Bot;
            return (
              <article
                className="group rounded-2xl border border-border/60 bg-card p-6 shadow-xs transition-all hover:border-flame-400/40 hover:shadow-md"
                key={item.title}
              >
                <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-accent text-flame-500 transition-transform group-hover:scale-105">
                  <Icon className="size-5" />
                </div>
                <h3 className="text-base font-semibold tracking-tight">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {item.description}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Comparison({
  heading,
  subtitle,
  rows,
  locale,
}: {
  heading: string;
  subtitle: string;
  rows: Array<{ label: string; cloudflare: string; nas: string; vps: string }>;
  locale: Locale;
}) {
  return (
    <section className="border-b border-border/60 bg-secondary/30 py-20">
      <div className="container-x space-y-8">
        <div className="max-w-2xl space-y-2">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            {heading}
          </h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-border/60 bg-background shadow-xs">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium"> </th>
                <th className="bg-flame-50/50 px-4 py-3 font-semibold text-flame-600">
                  Cloudflare (FlareMo)
                </th>
                <th className="px-4 py-3 font-medium">
                  {locale === "zh-CN" ? "家用 NAS / 软路由" : "Home NAS"}
                </th>
                <th className="px-4 py-3 font-medium">
                  {locale === "zh-CN" ? "传统 VPS 云主机" : "Traditional VPS"}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-t border-border/60" key={row.label}>
                  <th className="px-4 py-3.5 text-left align-top font-medium text-foreground">
                    {row.label}
                  </th>
                  <td className="bg-flame-50/20 px-4 py-3.5 align-top font-medium text-foreground">
                    {row.cloudflare}
                  </td>
                  <td className="px-4 py-3.5 align-top text-muted-foreground">
                    {row.nas}
                  </td>
                  <td className="px-4 py-3.5 align-top text-muted-foreground">
                    {row.vps}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Faq({
  heading,
  items,
}: {
  heading: string;
  items: Array<{ q: string; a: string }>;
}) {
  return (
    <section className="border-b border-border/60 bg-background py-20">
      <div className="container-x space-y-8">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
          {heading}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <details
              className="group rounded-2xl border border-border/60 bg-card p-5 shadow-xs open:shadow-md [&_summary::-webkit-details-marker]:hidden"
              key={item.q}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-base font-semibold tracking-tight">
                {item.q}
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-flame-500 transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaSection({
  heading,
  subtitle,
  buttonText,
  locale,
}: {
  heading: string;
  subtitle: string;
  buttonText: string;
  locale: Locale;
}) {
  return (
    <section className="bg-gradient-to-b from-background to-flame-50/40 py-20">
      <div className="container-x">
        <div className="rounded-3xl border border-flame-200/60 bg-gradient-to-br from-card via-card to-flame-50/50 p-8 text-center shadow-sm md:p-14">
          <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {heading}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-sm text-muted-foreground sm:text-base">
            {subtitle}
          </p>
          <div className="mt-8 flex justify-center">
            <a
              className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-md transition-all hover:brightness-105 active:translate-y-px motion-safe:duration-200"
              href={locale === "zh-CN" ? "/docs/deploy" : "/en/docs/deploy"}
            >
              {buttonText}
              <ArrowRight className="size-4" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
