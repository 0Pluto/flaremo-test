import type { Locale } from "@/lib/seo";

export type HomeContent = {
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  primaryCta: string;
  secondaryCta: string;
  statMemos: string;
  statPhotos: string;
  statServers: string;
  statUptime: string;
  featuresHeading: string;
  featuresSubtitle: string;
  features: Array<{
    title: string;
    description: string;
  }>;
  comparisonHeading: string;
  comparisonSubtitle: string;
  comparisonRows: Array<{
    label: string;
    cloudflare: string;
    nas: string;
    vps: string;
  }>;
  screenshotsHeading: string;
  screenshotsSubtitle: string;
  faqHeading: string;
  faqItems: Array<{
    q: string;
    a: string;
  }>;
  ctaHeading: string;
  ctaSubtitle: string;
  ctaButton: string;
};

const ZH_HOME: HomeContent = {
  heroEyebrow: "0 服务器 · 24 小时全球在线 · 免费自托管",
  heroTitle: "跑在云端的私人笔记与团队共享知识库",
  heroSubtitle:
    "一个人用是安静专注的灵感速记与 AI 长期记忆；一个团队用是具备精细角色的共享大脑。无须购买服务器，数据永远归你所有。",
  primaryCta: "快速开始部署",
  secondaryCta: "GitHub 源码",
  statMemos: "约 250 万条笔记",
  statPhotos: "1 万张图片 · 0 流量费",
  statServers: "7×24h 边缘秒开",
  statUptime: "企业级多副本容灾",
  featuresHeading: "为什么选择 FlareMo",
  featuresSubtitle:
    "抛开繁重的服务器运维，享受更纯粹、更强大、更安全的知识管理",
  features: [
    {
      title: "企业级持久化，永不丢失",
      description:
        "笔记存储于 Cloudflare D1 数据库与 R2 存储桶，自带跨地域冗余。无需担心硬盘坏道、停电或意外损坏。",
    },
    {
      title: "免费配额，终生够用",
      description:
        "Cloudflare 免费层可存约 250 万条纯文本笔记与 1 万张高清照片，R2 存储免收出口流量费，0 成本无负担。",
    },
    {
      title: "离线可用，即时回放",
      description:
        "支持 PWA 原生安装。无网络时草稿本地秒级暂存，重新联网后待同步队列自动按顺序安全提交。",
    },
    {
      title: "AI 原生，跨会话记忆",
      description:
        "内置 /memory/mcp 端点，AI Agent（Claude、Cursor、Codex）可将知识库作为长期记忆读写，数据完全受你掌控。",
    },
    {
      title: "团队协作，三级权限",
      description:
        "支持 Owner / Admin / Member 多角色协作，提供私密、团队可见、公开三档可见性，离职成员私密数据深度清理。",
    },
    {
      title: "兼容 Memos，无缝迁移",
      description:
        "全面兼容 Memos /api/v1 常用端点与 OpenAPI，支持第三方客户端直接连接，Memos/flomo 数据一键无损导入导出。",
    },
  ],
  comparisonHeading: "为什么选择 Cloudflare 原生架构",
  comparisonSubtitle:
    "对比传统家用 NAS 与 VPS，看 Cloudflare 原生为何是现代自托管的最优解",
  comparisonRows: [
    {
      label: "数据存储位置",
      cloudflare: "Cloudflare 企业级多地域持久化",
      nas: "家中的单块或多块物理硬盘",
      vps: "单一云厂商机房虚拟机磁盘",
    },
    {
      label: "硬件/灾难风险",
      cloudflare: "自动故障转移，零硬件焦虑",
      nas: "硬盘损坏、断电漏水可能全丢",
      vps: "机房网络故障或误操作可能丢失",
    },
    {
      label: "全球访问延迟",
      cloudflare: "全球 300+ 边缘 CDN 毫秒就近响应",
      nas: "依赖家庭上行，需折腾内网穿透",
      vps: "取决于单一机房物理距离，延迟高",
    },
    {
      label: "日常运维开销",
      cloudflare: "零运维：无系统补丁、无 Docker 容器",
      nas: "需维护系统升级、监控硬盘 SMART",
      vps: "需维护操作系统安全补丁与看门狗",
    },
    {
      label: "证书与域名",
      cloudflare: "自带免费 HTTPS，自动配置与续期",
      nas: "需自行申请证书、配置 DDNS 与穿透",
      vps: "需配置 Nginx/Caddy 及证书轮换",
    },
    {
      label: "长期费用成本",
      cloudflare: "0 元 / 永久利用官方免费配额",
      nas: "数千元硬件采购费用 + 持续电费",
      vps: "按月/年持续支付服务器与带宽续费",
    },
  ],
  screenshotsHeading: "精致视觉，开箱即用",
  screenshotsSubtitle:
    "浅色明亮、深色沉浸与全功能移动端自适应，所有功能真实可用",
  faqHeading: "常见问题",
  faqItems: [
    {
      q: "免费配额真的够用吗？",
      a: "完全够用。Cloudflare 免费层提供 5GB D1 数据库（可存约 250 万条普通笔记）与 10GB R2 存储（约 1 万张压缩图片）。即使每天写 100 条笔记，也能写 68 年，对绝大部分笔记用户而言终生都难以触及上限。",
    },
    {
      q: "如何确保我的数据绝对安全？",
      a: "笔记保存在 Cloudflare 企业级分布式基础设施中，自带高冗余持久化，不会因单点硬件故障丢失。同时 FlareMo 支持一键导出标准 Memos 格式备份包，随时可本地离线归档形成双重保障。",
    },
    {
      q: "能从 Memos 或 flomo 搬家过来吗？",
      a: "可以。FlareMo 支持导入 Memos 和 flomo 导出的 ZIP 或 JSON 格式数据包，导入时可自由配置冲突策略，时间戳、标签与正文完整保留。",
    },
    {
      q: "现有的第三方 App 和自动化脚本还能用吗？",
      a: "完全兼容。FlareMo 实现了 Memos 核心的 /api/v1 接口子集与可撤销的 Personal Access Token（PAT），市面上主流的 Memos 客户端（如 Moe Memos）及快捷指令脚本均可无缝连接使用。",
    },
    {
      q: "单人使用和团队使用有什么区别？",
      a: "默认是一套安静的单人笔记系统；如果需要协同，管理员可在后台一键生成邀请激活链接添加成员。笔记支持设为私密（仅自己可见）、团队可见（成员只读）或全网公开，数据权属清晰明确。",
    },
  ],
  ctaHeading: "准备好拥有你的第二大脑了吗？",
  ctaSubtitle:
    "无需服务器，无需信用卡，使用免费 Cloudflare 账号 5 分钟即可完成部署。",
  ctaButton: "查看 5 分钟部署指南",
};

const EN_HOME: HomeContent = {
  heroEyebrow: "Zero Servers · Always Online · Free Self-Hosted",
  heroTitle: "Cloud-native personal notes & shared team knowledge base",
  heroSubtitle:
    "A quiet personal thinking space with AI long-term memory for one; a shared brain with roles for teams. Zero servers to manage, and your data is forever yours.",
  primaryCta: "Read Deploy Guide",
  secondaryCta: "GitHub Source",
  statMemos: "~2.5M text memos",
  statPhotos: "~10k photos · $0 egress",
  statServers: "24/7 global edge latency",
  statUptime: "Multi-region replication",
  featuresHeading: "Why Choose FlareMo",
  featuresSubtitle:
    "Leave heavy server maintenance behind and enjoy pure, reliable, AI-native knowledge management",
  features: [
    {
      title: "Enterprise Durability",
      description:
        "Memos live in your Cloudflare D1 database and R2 bucket with multi-region persistence. Drive failure, power outages, and moves won't touch your data.",
    },
    {
      title: "Generous Free Tier",
      description:
        "The free tier holds 2.5 million text memos plus 10k photos. R2 has $0 egress fees so sharing notes won't surprise you with bandwidth charges.",
    },
    {
      title: "Offline-First & PWA",
      description:
        "Installable PWA. Write seamlessly on planes or subways. Drafts save instantly and sync sequentially when connectivity returns.",
    },
    {
      title: "AI-Native Long-term Memory",
      description:
        "Built-in /memory/mcp endpoint allows AI agents (Claude, Cursor, Codex) to read and update your preferences and project context with full human auditability.",
    },
    {
      title: "Team Collaboration & Roles",
      description:
        "Owner, Admin, and Member roles with 3-tier visibility (private, team-visible, public). Safe offboarding deletes private data cleanly.",
    },
    {
      title: "Memos Compatible",
      description:
        "Full compatibility with Memos /api/v1 endpoints and OpenAPI. Direct integration with existing third-party clients, plus one-click import and export.",
    },
  ],
  comparisonHeading: "Why Cloudflare Native Wins",
  comparisonSubtitle:
    "Comparing Cloudflare Serverless against home NAS and traditional VPS self-hosting",
  comparisonRows: [
    {
      label: "Data Location",
      cloudflare: "Cloudflare multi-region enterprise storage",
      nas: "Single or RAID drive in your home",
      vps: "Single cloud vendor virtual disk",
    },
    {
      label: "Hardware Failure",
      cloudflare: "Auto-replicated, zero hardware risk",
      nas: "Drive crash or power surge risks total loss",
      vps: "Host outage or hypervisor crash risks loss",
    },
    {
      label: "Global Latency",
      cloudflare: "300+ edge locations, sub-100ms worldwide",
      nas: "Bound to home upload speeds & tunnels",
      vps: "Single datacenter region, high cross-border lag",
    },
    {
      label: "Daily Upkeep",
      cloudflare: "Zero: No OS patches, no Docker compose",
      nas: "OS updates, SMART drive health monitoring",
      vps: "Kernel updates, security patches, watchdogs",
    },
    {
      label: "SSL & Domains",
      cloudflare: "Automated HTTPS and custom domain binding",
      nas: "Manual certs, dynamic DNS & port forwarding",
      vps: "Nginx/Caddy maintenance & Let's Encrypt renewals",
    },
    {
      label: "Ongoing Cost",
      cloudflare: "$0 / month on generous free tier",
      nas: "High upfront hardware costs + electricity",
      vps: "Continuous monthly / annual hosting invoices",
    },
  ],
  screenshotsHeading: "Polished Visual Experience",
  screenshotsSubtitle:
    "Light mode, dark immersion, and mobile responsive design. Everything is live and working.",
  faqHeading: "Frequently Asked Questions",
  faqItems: [
    {
      q: "Is the free tier really enough?",
      a: "More than enough. Cloudflare's free tier provides 5GB D1 database (~2.5 million text memos) and 10GB R2 storage (~10,000 compressed photos). Writing 100 memos every day would take 68 years to fill.",
    },
    {
      q: "How safe is my data?",
      a: "Data is stored on Cloudflare's enterprise-grade distributed infrastructure with multi-region replication. FlareMo also supports one-click exports to standard Memos bundles for regular offline archiving.",
    },
    {
      q: "Can I migrate from Memos or flomo?",
      a: "Yes. FlareMo imports ZIP or JSON export bundles from Memos and flomo, preserving timestamps, tags, and content while allowing custom conflict resolution.",
    },
    {
      q: "Do third-party apps and scripts still work?",
      a: "Yes. FlareMo implements the Memos /api/v1 endpoint surface and personal access tokens (PAT). Popular iOS/Android clients like Moe Memos connect directly.",
    },
    {
      q: "How does single-user differ from team mode?",
      a: "By default, it is a quiet single-user sanctuary. When team mode is enabled, admins invite members via one-time activation links. Memos can be private, team-visible, or public.",
    },
  ],
  ctaHeading: "Ready to Build Your Second Brain?",
  ctaSubtitle:
    "No servers, no credit card required. Deploy on Cloudflare in 5 minutes.",
  ctaButton: "Read 5-Minute Deploy Guide",
};

export function getHomeContent(locale: Locale): HomeContent {
  return locale === "zh-CN" ? ZH_HOME : EN_HOME;
}
