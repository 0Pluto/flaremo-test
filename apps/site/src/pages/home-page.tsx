import { useLocation } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  Database,
  ExternalLink,
  Image as ImageIcon,
  Layers,
  Lock,
  Moon,
  Radio,
  ServerOff,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Users,
  WifiOff,
  Zap,
} from "lucide-react";
import { useState } from "react";
import {
  AnimatedNumber,
  PopIn,
  Reveal,
  RevealGroup,
  RevealItem,
} from "@/components/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { getHomeContent } from "@/content/copy";
import {
  getLocaleFromPath,
  getLocalizedPath,
  type SupportedLocale,
} from "@/lib/seo";

const FEATURE_ICONS = [ShieldCheck, Database, WifiOff, Bot, Users, Layers];

const STAT_TITLES: Record<
  SupportedLocale,
  { servers: string; ownership: string }
> = {
  en: { servers: "0 Servers", ownership: "100% Yours" },
  zh: { servers: "0 台服务器", ownership: "100% 自主" },
  ja: { servers: "0台のサーバー", ownership: "100% 自主管理" },
  fr: { servers: "0 serveur", ownership: "100 % à vous" },
  es: { servers: "0 servidores", ownership: "100% tuyo" },
  ko: { servers: "0대 서버", ownership: "100% 완전 소유" },
  ru: { servers: "0 серверов", ownership: "100% ваше" },
  ar: { servers: "0 خوادم", ownership: "100% ملكك" },
};

const THEME_LABELS: Record<SupportedLocale, { light: string; dark: string }> = {
  en: { light: "Light Mode", dark: "Dark Mode" },
  zh: { light: "明亮日间", dark: "曜石夜间" },
  ja: { light: "ライト", dark: "ダーク" },
  fr: { light: "Clair", dark: "Sombre" },
  es: { light: "Claro", dark: "Oscuro" },
  ko: { light: "라이트", dark: "다크" },
  ru: { light: "Светлая", dark: "Тёмная" },
  ar: { light: "فاتح", dark: "داكن" },
};

const COMP_HEADERS: Record<SupportedLocale, { nas: string; vps: string }> = {
  en: { nas: "Home NAS / Homelab", vps: "Traditional VPS Cloud" },
  zh: { nas: "家用 NAS / 软路由", vps: "传统 VPS 云主机" },
  ja: { nas: "自宅 NAS / ルーター", vps: "従来の VPS" },
  fr: { nas: "NAS domestique", vps: "VPS traditionnel" },
  es: { nas: "NAS doméstico", vps: "VPS tradicional" },
  ko: { nas: "홈 NAS", vps: "기존 VPS" },
  ru: { nas: "Домашний NAS", vps: "Обычный VPS" },
  ar: { nas: "وحدة NAS منزلية", vps: "خوادم VPS التقليدية" },
};

export function HomePage() {
  const { pathname } = useLocation();
  const locale = getLocaleFromPath(pathname);
  const home = getHomeContent(locale);

  return (
    <main className="space-y-24 sm:space-y-32 pb-24 overflow-x-hidden">
      <Hero home={home} locale={locale} />
      <ProductShowcase
        heading={home.screenshotsHeading}
        locale={locale}
        subtitle={home.screenshotsSubtitle}
      />
      <BentoFeatures
        heading={home.featuresHeading}
        icons={FEATURE_ICONS}
        items={home.features}
        subtitle={home.featuresSubtitle}
      />
      <ComparisonSection
        heading={home.comparisonHeading}
        locale={locale}
        rows={home.comparisonRows}
        subtitle={home.comparisonSubtitle}
      />
      <EcosystemSection locale={locale} />
      <FaqSection heading={home.faqHeading} items={home.faqItems} />
      <CtaSection
        buttonText={home.ctaButton}
        heading={home.ctaHeading}
        locale={locale}
        subtitle={home.ctaSubtitle}
      />
    </main>
  );
}

/* ============================================================
   1. Hero 区块
   ============================================================ */

function Hero({
  locale,
  home,
}: {
  locale: SupportedLocale;
  home: ReturnType<typeof getHomeContent>;
}) {
  const titles = STAT_TITLES[locale] || STAT_TITLES.en;

  return (
    <section className="relative pt-12 md:pt-20">
      {/* 顶部环境柔光 */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 flex justify-center overflow-hidden"
      >
        <div className="h-[420px] w-[700px] rounded-full bg-gradient-to-b from-signal/15 to-transparent blur-3xl opacity-70 dark:opacity-40" />
      </div>

      <div className="container-x space-y-12">
        <div className="mx-auto max-w-3xl space-y-6 text-center">
          {/* Eyebrow Pill */}
          <PopIn className="inline-flex">
            <div className="inline-flex items-center gap-2 rounded-full border border-signal/30 bg-signal/10 px-3.5 py-1 text-xs font-semibold text-signal-ink shadow-2xs backdrop-blur-md">
              <span className="size-2 rounded-full bg-signal animate-pulse" />
              <span>{home.heroEyebrow}</span>
            </div>
          </PopIn>

          {/* Headline */}
          <Reveal delay={0.08}>
            <h1 className="text-balance text-4xl font-extrabold tracking-tight text-ink sm:text-5xl md:text-6xl lg:text-7xl leading-[1.08]">
              {home.heroTitle}
            </h1>
          </Reveal>

          {/* Subtitle */}
          <Reveal delay={0.16}>
            <p className="mx-auto max-w-2xl text-pretty text-base text-mist sm:text-lg leading-relaxed">
              {home.heroSubtitle}
            </p>
          </Reveal>

          {/* Actions */}
          <Reveal delay={0.24}>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button asChild size="lg" variant="flame" className="shadow-pop">
                <a href={getLocalizedPath("/docs/deploy", locale)}>
                  <span>{home.primaryCta}</span>
                  <ArrowRight className="size-4" />
                </a>
              </Button>

              <Button asChild size="lg" variant="secondary">
                <a
                  href="https://github.com/realchendahuang/FlareMo"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <span>{home.secondaryCta}</span>
                  <ExternalLink className="size-3.5 text-mist" />
                </a>
              </Button>
            </div>
          </Reveal>
        </div>

        {/* 4 栏核心指标看板 */}
        <RevealGroup
          stagger={0.08}
          className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
        >
          <RevealItem>
            <SpotlightCard className="p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between">
                <div className="icon-dock flex size-9 items-center justify-center text-signal">
                  <Database className="size-4" />
                </div>
                <Badge variant="flame">D1 Storage</Badge>
              </div>
              <div className="mt-4">
                <div className="text-3xl font-extrabold tracking-tight tabular-nums text-ink">
                  <AnimatedNumber value={5} suffix=" GB" />
                </div>
                <div className="mt-1 text-xs text-mist">{home.statMemos}</div>
              </div>
            </SpotlightCard>
          </RevealItem>

          <RevealItem>
            <SpotlightCard className="p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between">
                <div className="icon-dock flex size-9 items-center justify-center text-signal">
                  <ImageIcon className="size-4" />
                </div>
                <Badge variant="flame">R2 Free Egress</Badge>
              </div>
              <div className="mt-4">
                <div className="text-3xl font-extrabold tracking-tight tabular-nums text-ink">
                  <AnimatedNumber value={10} suffix=" GB" />
                </div>
                <div className="mt-1 text-xs text-mist">{home.statPhotos}</div>
              </div>
            </SpotlightCard>
          </RevealItem>

          <RevealItem>
            <SpotlightCard className="p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between">
                <div className="icon-dock flex size-9 items-center justify-center text-signal">
                  <ServerOff className="size-4" />
                </div>
                <Badge variant="secondary">Zero Ops</Badge>
              </div>
              <div className="mt-4">
                <div className="text-3xl font-extrabold tracking-tight tabular-nums text-ink">
                  {titles.servers}
                </div>
                <div className="mt-1 text-xs text-mist">{home.statServers}</div>
              </div>
            </SpotlightCard>
          </RevealItem>

          <RevealItem>
            <SpotlightCard className="p-5 flex flex-col justify-between h-full">
              <div className="flex items-center justify-between">
                <div className="icon-dock flex size-9 items-center justify-center text-signal">
                  <ShieldCheck className="size-4" />
                </div>
                <Badge variant="success">Your Data</Badge>
              </div>
              <div className="mt-4">
                <div className="text-3xl font-extrabold tracking-tight tabular-nums text-ink">
                  {titles.ownership}
                </div>
                <div className="mt-1 text-xs text-mist">{home.statUptime}</div>
              </div>
            </SpotlightCard>
          </RevealItem>
        </RevealGroup>
      </div>
    </section>
  );
}

/* ============================================================
   2. 交互式视窗展示
   ============================================================ */

function ProductShowcase({
  heading,
  subtitle,
  locale,
}: {
  heading: string;
  subtitle: string;
  locale: SupportedLocale;
}) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const labels = THEME_LABELS[locale] || THEME_LABELS.en;

  return (
    <section className="container-x">
      <div className="space-y-8">
        <div className="flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl md:text-4xl">
              {heading}
            </h2>
            <p className="mt-1 text-sm text-mist">{subtitle}</p>
          </div>

          {/* 切换预览明暗模式 */}
          <div className="inline-flex items-center rounded-full border border-line/70 bg-soft-surface p-1 shadow-xs">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer ${
                theme === "light"
                  ? "bg-surface text-ink shadow-xs"
                  : "text-mist hover:text-ink"
              }`}
            >
              <Sun className="size-3.5 text-amber-500" />
              <span>{labels.light}</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer ${
                theme === "dark"
                  ? "bg-surface text-ink shadow-xs"
                  : "text-mist hover:text-ink"
              }`}
            >
              <Moon className="size-3.5 text-signal" />
              <span>{labels.dark}</span>
            </button>
          </div>
        </div>

        {/* 桌面 + 移动视窗展示 */}
        <div className="grid items-end gap-6 lg:grid-cols-[1fr_250px]">
          {/* macOS 桌面浏览器 Mockup */}
          <div className="panel-card overflow-hidden border border-line/60 shadow-pop-xl">
            {/* 顶栏控制台 */}
            <div className="flex h-10 items-center justify-between border-b border-line/60 bg-soft-surface/90 px-4">
              <div className="flex items-center gap-2">
                <span className="size-3 rounded-full bg-[#ff5f56] shadow-2xs" />
                <span className="size-3 rounded-full bg-[#ffbd2e] shadow-2xs" />
                <span className="size-3 rounded-full bg-[#27c93f] shadow-2xs" />
              </div>
              <div className="flex h-6 w-56 sm:w-72 items-center justify-center gap-1.5 rounded-md border border-line/60 bg-surface/90 px-3 text-[11px] text-mist shadow-2xs">
                <Lock className="size-3 text-signal" />
                <span className="font-mono">https://app.flaremo.app</span>
              </div>
              <div className="w-10 text-right text-[10px] text-fog font-mono">
                200 OK
              </div>
            </div>

            {/* 真实截图容器 */}
            <div className="relative aspect-[1024/711] w-full bg-soft-surface">
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

          {/* 移动端 Mockup */}
          <div className="mx-auto w-full max-w-[230px] overflow-hidden rounded-[2.5rem] border-4 border-surface bg-paper p-1 shadow-pop-xl ring-1 ring-line/80">
            <div className="overflow-hidden rounded-[2.1rem] bg-paper">
              <div className="flex h-6 items-center justify-center bg-soft-surface/80">
                <span className="h-1 w-12 rounded-full bg-mist/30" />
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

/* ============================================================
   3. Bento 核心特性网格
   ============================================================ */

function BentoFeatures({
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
    <section className="container-x space-y-10">
      <div className="max-w-2xl space-y-2">
        <Badge variant="flame">Architecture & Capabilities</Badge>
        <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl md:text-4xl">
          {heading}
        </h2>
        <p className="text-sm text-mist">{subtitle}</p>
      </div>

      <RevealGroup
        stagger={0.06}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {items.map((item, idx) => {
          const Icon = icons[idx] ?? Bot;
          return (
            <RevealItem key={item.title}>
              <SpotlightCard className="p-6 flex flex-col justify-between h-full group">
                <div>
                  <div className="mb-4 flex size-11 items-center justify-center icon-dock text-signal transition-transform duration-300 group-hover:scale-105">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="text-base font-bold tracking-tight text-ink">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-mist">
                    {item.description}
                  </p>
                </div>
                <div className="mt-6 flex items-center gap-1 text-xs font-semibold text-signal-ink opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <span>了解更多</span>
                  <ArrowRight className="size-3" />
                </div>
              </SpotlightCard>
            </RevealItem>
          );
        })}
      </RevealGroup>
    </section>
  );
}

/* ============================================================
   4. 三方对比矩阵
   ============================================================ */

function ComparisonSection({
  heading,
  subtitle,
  rows,
  locale,
}: {
  heading: string;
  subtitle: string;
  rows: Array<{ label: string; cloudflare: string; nas: string; vps: string }>;
  locale: SupportedLocale;
}) {
  const headers = COMP_HEADERS[locale] || COMP_HEADERS.en;

  return (
    <section className="container-x space-y-8">
      <div className="max-w-2xl space-y-2">
        <Badge variant="flame">Fair Comparison</Badge>
        <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl md:text-4xl">
          {heading}
        </h2>
        <p className="text-sm text-mist">{subtitle}</p>
      </div>

      <div className="panel-card overflow-hidden border border-line/60 shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line/60 bg-soft-surface/80 text-left text-xs uppercase tracking-wider text-mist">
                <th className="px-5 py-4 font-semibold">对比维度</th>
                <th className="bg-signal/10 px-5 py-4 font-bold text-signal-ink">
                  Cloudflare (FlareMo)
                </th>
                <th className="px-5 py-4 font-semibold">{headers.nas}</th>
                <th className="px-5 py-4 font-semibold">{headers.vps}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {rows.map((row) => (
                <tr
                  className="transition-colors hover:bg-wash/50"
                  key={row.label}
                >
                  <th className="px-5 py-4 text-left align-top font-semibold text-ink whitespace-nowrap">
                    {row.label}
                  </th>
                  <td className="bg-signal/5 px-5 py-4 align-top font-semibold text-ink">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-signal/20 text-signal-ink">
                        <Check className="size-2.5" />
                      </span>
                      <span>{row.cloudflare}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 align-top text-mist">{row.nas}</td>
                  <td className="px-5 py-4 align-top text-mist">{row.vps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   5. 多端生态与无缝兼容展示
   ============================================================ */

function EcosystemSection({ locale }: { locale: SupportedLocale }) {
  const isZh = locale === "zh";

  const clients = [
    {
      title: "Moe Memos",
      tag: "iOS & Android",
      desc: isZh
        ? "最受欢迎的开源移动双端，支持直接以 FlareMo 地址与 PAT 连接。"
        : "Popular native mobile client for iOS & Android with offline sync.",
      icon: Smartphone,
    },
    {
      title: "Telegram Bot",
      tag: "Instant Capture",
      desc: isZh
        ? "随手向专属 Bot 发送文字、图片与语音，几秒内完成碎片灵感入库。"
        : "Send notes, voice, and photos directly to your personal bot.",
      icon: Radio,
    },
    {
      title: "AI MCP Server",
      tag: "Model Context Protocol",
      desc: isZh
        ? "连接 Claude Desktop、Cursor 与 Codex，将笔记库作为 AI 长期记忆体。"
        : "Directly connect Claude Desktop & Cursor as your AI external brain.",
      icon: Sparkles,
    },
    {
      title: "Raycast / Alfred",
      tag: "Desktop Workflow",
      desc: isZh
        ? "全局快捷键一秒唤起输入框，不打断手头心流快速记下一笔。"
        : "Global hotkey quick-capture on macOS without breaking flow.",
      icon: Zap,
    },
  ];

  return (
    <section className="container-x space-y-8">
      <div className="max-w-2xl space-y-2">
        <Badge variant="flame">Open Ecosystem</Badge>
        <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl md:text-4xl">
          {isZh
            ? "全面的 Memos 生态无缝兼容"
            : "Full Memos Ecosystem Compatibility"}
        </h2>
        <p className="text-sm text-mist">
          {isZh
            ? "完整兼容 Memos /api/v1 协议与可撤销个人访问令牌（PAT），你的现有工具链立即可用。"
            : "Drop-in compatibility with Memos API and PAT tokens. Keep your favorite daily tools."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {clients.map((c) => {
          const Icon = c.icon;
          return (
            <SpotlightCard
              key={c.title}
              className="p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="icon-dock flex size-9 items-center justify-center text-signal">
                    <Icon className="size-4" />
                  </div>
                  <Badge variant="secondary">{c.tag}</Badge>
                </div>
                <h3 className="mt-4 text-base font-bold text-ink">{c.title}</h3>
                <p className="mt-1.5 text-xs text-mist leading-relaxed">
                  {c.desc}
                </p>
              </div>
            </SpotlightCard>
          );
        })}
      </div>
    </section>
  );
}

/* ============================================================
   6. FAQ 手风琴常见问题
   ============================================================ */

function FaqSection({
  heading,
  items,
}: {
  heading: string;
  items: Array<{ q: string; a: string }>;
}) {
  return (
    <section className="container-x space-y-8">
      <div className="max-w-2xl space-y-2">
        <Badge variant="secondary">Questions & Answers</Badge>
        <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl md:text-4xl">
          {heading}
        </h2>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <details
            className="group panel-card p-5 transition-all duration-200 open:shadow-md cursor-pointer [&_summary::-webkit-details-marker]:hidden"
            key={item.q}
          >
            <summary className="flex list-none items-center justify-between gap-3 text-base font-bold text-ink">
              <span>{item.q}</span>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-soft-surface text-mist transition-transform duration-200 group-open:rotate-180">
                <ChevronDown className="size-4" />
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-mist border-t border-line/50 pt-3">
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   7. 底部高光 CTA 横幅
   ============================================================ */

function CtaSection({
  heading,
  subtitle,
  buttonText,
  locale,
}: {
  heading: string;
  subtitle: string;
  buttonText: string;
  locale: SupportedLocale;
}) {
  return (
    <section className="container-x">
      <div className="relative overflow-hidden rounded-3xl border border-signal/30 bg-surface p-8 sm:p-12 md:p-16 text-center shadow-pop-xl">
        {/* 背景径向余烬光晕 */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-72 w-96 rounded-full bg-signal/20 blur-3xl"
        />

        <div className="relative z-10 mx-auto max-w-2xl space-y-5">
          <Badge variant="flame">Free · Private · Serverless</Badge>
          <h2 className="text-balance text-3xl font-extrabold tracking-tight text-ink sm:text-4xl md:text-5xl">
            {heading}
          </h2>
          <p className="text-pretty text-sm sm:text-base text-mist max-w-xl mx-auto leading-relaxed">
            {subtitle}
          </p>
          <div className="pt-4 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" variant="flame" className="shadow-pop">
              <a href={getLocalizedPath("/docs/deploy", locale)}>
                <span>{buttonText}</span>
                <ArrowRight className="size-4" />
              </a>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <a
                href="https://github.com/realchendahuang/FlareMo"
                rel="noopener noreferrer"
                target="_blank"
              >
                <span>GitHub 源码</span>
                <ExternalLink className="size-3.5 text-mist" />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
