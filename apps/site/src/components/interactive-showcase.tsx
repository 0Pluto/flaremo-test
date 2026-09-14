import {
  Archive,
  Bell,
  Brain,
  Calendar,
  CalendarDays,
  FolderKanban,
  Footprints,
  Hash,
  Image as ImageIcon,
  Inbox,
  List,
  Menu,
  MoreHorizontal,
  RefreshCw,
  Search,
  Send,
  Settings,
  Sparkles,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type Memo = {
  id: string;
  orderNumber: number;
  timeLabel: string;
  title: string;
  content: string;
  quote?: string;
  tags: string[];
  isNew?: boolean;
};

const INITIAL_MEMOS: Memo[] = [
  {
    id: "memo-65",
    orderNumber: 65,
    timeLabel: "21分钟前 · 本地体验验证",
    title: "阅读摘录：注意力与创造力",
    content:
      "信息越多，越需要为自己留出安静的空间。把零散的观察记下来，连接就会慢慢浮现。",
    quote: "学习不是积累答案，而是不断提出更好的问题。",
    tags: ["灵感", "阅读"],
  },
  {
    id: "memo-64",
    orderNumber: 64,
    timeLabel: "1小时前 · 本地体验验证",
    title: "让记录成为思考的起点",
    content:
      "今天散步时想到：好的工具应该让人专注于自己的想法。打开就能写，想找的内容也能很快找到。\n• 保留清晰的主线\n• 给重要的灵感加上标签\n• 每周花一点时间回顾",
    tags: ["思考", "产品"],
  },
];

const PRESETS = [
  {
    text: "在机场候机时随手理清了多端同步幂等协议 #架构 #灵感",
    title: "边缘毫秒同步方案设计",
    quote: "客户端优先本地落盘，联网后单调时间戳递增同步。",
    tag: "架构",
  },
  {
    text: "体验了一下离线 PWA 模式，断网随心记，连网秒级入库 #灵感",
    title: "离线优先使用体验",
    quote: "地铁与飞行途中无网环境下的心流完全不中断。",
    tag: "灵感",
  },
  {
    text: "配置完成 Telegram 随手记 Bot，直接发语音自动转文字入库 #生活",
    title: "碎片化灵感速记链路",
    quote: "随手语音发给专属 Bot，10 秒内自动汇总成结构化知识点。",
    tag: "生活",
  },
];

const HEATMAP_TILES = Array.from({ length: 72 }, (_, i) => ({
  id: `tile-k-${i}`,
  isHigh: i >= 68,
  isMedium: i >= 64 && i < 68,
}));

export function InteractiveShowcase({
  heading,
  subtitle,
}: {
  heading: string;
  subtitle: string;
}) {
  const [memos, setMemos] = useState<Memo[]>(INITIAL_MEMOS);
  const [activeMenu, setActiveMenu] = useState<
    "timeline" | "archive" | "trash"
  >("timeline");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [timeViewTab, setTimeViewTab] = useState<"trend" | "calendar">("trend");
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // 输入框草稿
  const [desktopInput, setDesktopInput] = useState("");
  const [mobileInput, setMobileInput] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedId, setLastSyncedId] = useState<string | null>(null);

  // 记录数统计
  const totalCount = memos.length + 63; // 保持 65 附近基数
  const tagList = [
    { name: "产品", count: 22 },
    { name: "思考", count: 22 },
    { name: "灵感", count: 22 },
    { name: "生活", count: 21 },
    { name: "计划", count: 21 },
    { name: "阅读", count: 22 },
  ];

  // 提交新笔记逻辑
  const publishMemo = (rawText: string, fromMobile = false) => {
    const text = rawText.trim();
    if (!text) return;

    setIsSyncing(true);

    // 提取标签
    const extractedTags = Array.from(
      new Set(
        (text.match(/#([\w\u4e00-\u9fa5]+)/g) || []).map((t) =>
          t.replace("#", ""),
        ),
      ),
    );
    const tags = extractedTags.length > 0 ? extractedTags : ["灵感"];

    // 寻找预设匹配
    const matchedPreset = PRESETS.find((p) => p.text === rawText);
    const title =
      matchedPreset?.title ??
      (text.length > 18 ? `${text.slice(0, 16)}...` : text);
    const quote = matchedPreset?.quote;
    const cleanContent = text.replace(/#([\w\u4e00-\u9fa5]+)/g, "").trim();

    const newId = `memo-${Date.now()}`;
    const nextOrder = memos.length > 0 ? memos[0].orderNumber + 1 : 66;

    setTimeout(() => {
      const newMemo: Memo = {
        id: newId,
        orderNumber: nextOrder,
        timeLabel: fromMobile ? "刚刚 · 手机边缘同步" : "刚刚 · 本地体验验证",
        title,
        content: cleanContent || text,
        quote,
        tags,
        isNew: true,
      };

      setMemos((prev) => [newMemo, ...prev]);
      setLastSyncedId(newId);
      if (fromMobile) setMobileInput("");
      else setDesktopInput("");
      setIsSyncing(false);
    }, 380);
  };

  const handleReset = () => {
    setMemos(INITIAL_MEMOS);
    setActiveTag(null);
    setDesktopInput("");
    setMobileInput("");
    setLastSyncedId(null);
  };

  const filteredMemos = memos.filter((m) => {
    if (activeTag && !m.tags.includes(activeTag)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        m.title.toLowerCase().includes(q) ||
        m.content.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <section className="container-x space-y-6">
      {/* 模块标题与状态栏 */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-signal/30 bg-signal/10 px-3 py-0.5 text-xs font-semibold text-signal-ink">
            <span className="size-2 rounded-full bg-signal animate-pulse" />
            <span>真实产品交互协同演练</span>
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl md:text-4xl">
            {heading}
          </h2>
          <p className="text-sm text-mist">{subtitle}</p>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-line/70 bg-soft-surface px-3 py-1 text-xs font-semibold text-mist">
            <Zap className="size-3 text-signal" />
            <span>D1 边缘多副本同步就绪</span>
          </div>

          <button
            type="button"
            onClick={handleReset}
            title="重置演练数据"
            className="inline-flex items-center gap-1 rounded-full border border-line/60 bg-surface px-3 py-1 text-xs font-semibold text-mist transition-colors hover:bg-wash hover:text-ink cursor-pointer"
          >
            <RefreshCw className="size-3" />
            <span>重置</span>
          </button>
        </div>
      </div>

      {/* 提示文案栏 */}
      <div className="rounded-xl border border-line/60 bg-soft-surface/80 p-3 text-xs text-mist flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-signal/15 text-signal-ink font-bold text-[11px]">
            💡
          </span>
          <span>
            完全对齐 FlareMo 真实客户端布局与设计。<strong>右侧手机端</strong>
            可直接键入或点击气泡发送，<strong>左侧电脑端</strong>
            将即时插入新笔记并动态累加统计！
          </span>
        </div>
        <div className="flex items-center gap-1 text-[11px] font-mono text-signal-ink">
          <span>{isSyncing ? "⚡ 边缘网络同步中..." : "✓ 状态一致"}</span>
        </div>
      </div>

      {/* 真实双端模型 */}
      <div className="grid gap-6 lg:grid-cols-[1fr_310px] xl:grid-cols-[1fr_330px] items-start">
        {/* ============================================================
            电脑端视窗（严格还原 FlareMo 真实桌面端布局）
            ============================================================ */}
        <div className="panel-card overflow-hidden border border-line/70 shadow-pop-xl">
          {/* 桌面端浏览器顶栏 */}
          <div className="flex h-9 items-center justify-between border-b border-line/60 bg-soft-surface px-4">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-[#ff5f56]" />
              <span className="size-2.5 rounded-full bg-[#ffbd2e]" />
              <span className="size-2.5 rounded-full bg-[#27c93f]" />
            </div>

            <div className="flex h-5.5 w-60 sm:w-80 items-center justify-center gap-1.5 rounded-md border border-line/60 bg-surface px-3 text-[11px] text-mist">
              <span className="size-2 rounded-full bg-signal" />
              <span className="font-mono">https://app.flaremo.app</span>
            </div>

            <div className="text-[11px] font-mono text-fog">
              Cloudflare Workers
            </div>
          </div>

          {/* 电脑端应用内结构：左侧边栏 + 右侧时间线 */}
          <div className="grid grid-cols-1 md:grid-cols-[210px_1fr] lg:grid-cols-[220px_1fr] min-h-[580px] bg-paper">
            {/* 左侧真实边栏 (FlareMo Explorer) */}
            <aside className="border-r border-line/60 bg-surface/40 p-4 space-y-4 hidden md:block select-none overflow-y-auto max-h-[620px] no-scrollbar">
              {/* 边栏顶部 Header：Logo + 标题 + 铃铛 + 版本 + 设置 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex size-6 items-center justify-center rounded-lg bg-brand-gradient text-white text-xs font-bold shadow-2xs">
                    <span className="text-white font-extrabold text-[13px]">
                      F
                    </span>
                  </div>
                  <span className="font-bold text-sm text-ink tracking-tight">
                    FlareMo
                  </span>
                </div>

                <div className="flex items-center gap-1 text-mist">
                  <Bell className="size-3.5 hover:text-ink cursor-pointer" />
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-soft-surface px-1.5 py-0.5 text-[9px] font-mono border border-line/60">
                    <RefreshCw className="size-2 text-signal" />
                    v0.20
                  </span>
                  <Settings className="size-3.5 hover:text-ink cursor-pointer" />
                </div>
              </div>

              {/* 数据总览行：记录 | 标签 | 天数 */}
              <div className="grid grid-cols-3 text-center py-1.5 border-y border-line/60">
                <div>
                  <div className="text-base font-extrabold text-ink tabular-nums">
                    {totalCount}
                  </div>
                  <div className="text-[10px] text-mist">记录</div>
                </div>
                <div>
                  <div className="text-base font-extrabold text-ink tabular-nums">
                    {tagList.length}
                  </div>
                  <div className="text-[10px] text-mist">标签</div>
                </div>
                <div>
                  <div className="text-base font-extrabold text-ink tabular-nums">
                    1
                  </div>
                  <div className="text-[10px] text-mist">天</div>
                </div>
              </div>

              {/* 贡献热力图卡片 */}
              <div className="space-y-2">
                <div className="flex rounded-lg bg-soft-surface p-0.5 border border-line/60 text-[10px] font-semibold text-mist">
                  <button
                    type="button"
                    onClick={() => setTimeViewTab("trend")}
                    className={cn(
                      "flex-1 py-1 rounded-md text-center transition-colors cursor-pointer",
                      timeViewTab === "trend"
                        ? "bg-surface text-signal-ink shadow-2xs font-bold"
                        : "hover:text-ink",
                    )}
                  >
                    趋势
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeViewTab("calendar")}
                    className={cn(
                      "flex-1 py-1 rounded-md text-center transition-colors cursor-pointer",
                      timeViewTab === "calendar"
                        ? "bg-surface text-signal-ink shadow-2xs font-bold"
                        : "hover:text-ink",
                    )}
                  >
                    日历
                  </button>
                </div>

                {/* 贡献小方格矩阵 */}
                <div className="rounded-xl border border-line/60 bg-surface/70 p-2.5 space-y-1.5">
                  <div className="grid grid-flow-col grid-rows-6 gap-1 justify-between">
                    {HEATMAP_TILES.map((tile) => (
                      <span
                        key={tile.id}
                        className={cn(
                          "size-2 rounded-[2px]",
                          tile.isHigh
                            ? "bg-signal shadow-2xs"
                            : tile.isMedium
                              ? "bg-signal/40"
                              : "bg-line/70 dark:bg-line/40",
                        )}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between text-[9px] text-fog font-mono px-0.5">
                    <span>6月</span>
                    <span>7月</span>
                    <span>8月</span>
                    <span>9月</span>
                  </div>
                </div>
              </div>

              {/* 系统主菜单 */}
              <nav className="space-y-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setActiveMenu("timeline");
                    setActiveTag(null);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer text-left",
                    activeMenu === "timeline" && activeTag === null
                      ? "bg-signal/10 text-signal-ink font-bold border-l-2 border-signal"
                      : "text-mist hover:bg-wash hover:text-ink",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Inbox className="size-3.5 text-signal" />
                    <span>时间线</span>
                  </span>
                  <span className="text-[10px] tabular-nums font-mono text-signal-ink">
                    {totalCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveMenu("archive")}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer text-left",
                    activeMenu === "archive"
                      ? "bg-signal/10 text-signal-ink font-bold"
                      : "text-mist hover:bg-wash hover:text-ink",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Archive className="size-3.5" />
                    <span>归档</span>
                  </span>
                  <span className="text-[10px] text-fog font-mono">0</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveMenu("trash")}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer text-left",
                    activeMenu === "trash"
                      ? "bg-signal/10 text-signal-ink font-bold"
                      : "text-mist hover:bg-wash hover:text-ink",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Trash2 className="size-3.5" />
                    <span>回收站</span>
                  </span>
                  <span className="text-[10px] text-fog font-mono">0</span>
                </button>
              </nav>

              {/* 扩展功能列表 */}
              <div className="pt-2 border-t border-line/60 space-y-0.5 text-xs text-mist">
                {[
                  { icon: CalendarDays, label: "每日回顾" },
                  { icon: Footprints, label: "随机漫步" },
                  { icon: Brain, label: "记忆" },
                  { icon: Calendar, label: "日历" },
                  { icon: FolderKanban, label: "项目" },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-wash hover:text-ink transition-colors cursor-pointer"
                    >
                      <Icon className="size-3.5 text-mist" />
                      <span>{item.label}</span>
                    </div>
                  );
                })}
              </div>

              {/* 标签分类 */}
              <div className="pt-2 border-t border-line/60 space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-fog px-1 flex items-center gap-1">
                  <Hash className="size-2.5" />
                  <span>标签索引</span>
                </div>
                <div className="space-y-0.5 text-xs">
                  {tagList.map((tag) => (
                    <button
                      type="button"
                      key={tag.name}
                      onClick={() => setActiveTag(tag.name)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-2.5 py-1 transition-colors cursor-pointer text-left",
                        activeTag === tag.name
                          ? "bg-signal/10 text-signal-ink font-bold"
                          : "text-mist hover:bg-wash hover:text-ink",
                      )}
                    >
                      <span>#{tag.name}</span>
                      <span className="text-[10px] text-fog font-mono">
                        {tag.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            {/* 右侧主工作区 (时间线 + 发送器) */}
            <main className="p-4 sm:p-5 space-y-4 max-h-[620px] overflow-y-auto thin-scrollbar">
              {/* 顶部标题栏与搜索条 */}
              <div className="flex items-center justify-between gap-3 pb-1 border-b border-line/60">
                <div className="flex items-center gap-1.5 text-sm font-bold text-ink">
                  <span className="text-fog">/</span>
                  <span>{activeTag ? `标签: #${activeTag}` : "时间线"}</span>
                </div>

                <div className="relative w-44 sm:w-56">
                  <Search className="size-3.5 text-fog absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索记录..."
                    className="w-full h-8 pl-8 pr-3 rounded-full border border-line/70 bg-surface text-xs text-ink placeholder:text-fog focus:outline-none focus:border-signal"
                  />
                </div>
              </div>

              {/* 真实 Memo 发送器 (MemoComposer) */}
              <div className="rounded-2xl border border-line/70 bg-surface p-3.5 shadow-2xs space-y-2.5 transition-shadow hover:shadow-xs">
                <textarea
                  value={desktopInput}
                  onChange={(e) => setDesktopInput(e.target.value)}
                  placeholder="此刻在想什么？记下来..."
                  rows={2}
                  className="w-full bg-transparent text-xs sm:text-sm text-ink placeholder:text-fog resize-none focus:outline-none leading-relaxed"
                />

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-3 text-mist">
                    <button
                      type="button"
                      title="插入标签"
                      onClick={() => setDesktopInput((prev) => `${prev} #`)}
                      className="hover:text-ink cursor-pointer"
                    >
                      <Hash className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      title="添加图片"
                      className="hover:text-ink cursor-pointer"
                    >
                      <ImageIcon className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      title="待办清单"
                      className="hover:text-ink cursor-pointer"
                    >
                      <List className="size-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => publishMemo(desktopInput, false)}
                    disabled={isSyncing || !desktopInput.trim()}
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand-gradient px-4 py-1 text-xs font-semibold text-white shadow-xs hover:brightness-105 active:translate-y-px transition-all cursor-pointer disabled:opacity-40"
                  >
                    <Send className="size-3" />
                    <span>发送</span>
                  </button>
                </div>
              </div>

              {/* 真实笔记卡片流 (MemoCard List) */}
              <div className="space-y-3">
                <AnimatePresence initial={false}>
                  {filteredMemos.map((m) => {
                    const isHighlighted = m.id === lastSyncedId;
                    return (
                      <motion.article
                        key={m.id}
                        layout
                        initial={{ opacity: 0, y: -20, scale: 0.96 }}
                        animate={{
                          opacity: 1,
                          y: 0,
                          scale: 1,
                          transition: {
                            type: "spring",
                            stiffness: 350,
                            damping: 25,
                          },
                        }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className={cn(
                          "rounded-2xl border bg-surface p-4 sm:p-5 space-y-2.5 transition-all duration-300 relative",
                          isHighlighted
                            ? "border-signal/60 ring-2 ring-signal/20 bg-signal/5 shadow-md"
                            : "border-line/70 shadow-2xs hover:border-line",
                        )}
                      >
                        {/* 卡片头部：圆形头像 + 时间/来源 + 更多操作 */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="size-4.5 rounded-full border-2 border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 shrink-0" />
                            <span className="text-xs text-mist font-medium">
                              {m.timeLabel}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {isHighlighted && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-signal/15 px-2 py-0.5 text-[10px] font-bold text-signal-ink animate-pulse">
                                <Sparkles className="size-2.5" />
                                刚刚同步
                              </span>
                            )}
                            <MoreHorizontal className="size-3.5 text-fog hover:text-ink cursor-pointer" />
                          </div>
                        </div>

                        {/* 笔记标题 */}
                        <h3 className="text-sm sm:text-base font-bold text-ink tracking-tight">
                          {m.title}
                        </h3>

                        {/* 笔记内容 */}
                        <p className="text-xs sm:text-sm text-ink leading-relaxed whitespace-pre-line">
                          {m.content}
                        </p>

                        {/* 引用样式块 (Quote Callout) */}
                        {m.quote && (
                          <div className="rounded-r-xl border-l-2 border-signal bg-signal/10 p-3 text-xs text-ink leading-relaxed">
                            {m.quote}
                          </div>
                        )}

                        {/* 标签行 */}
                        {m.tags.length > 0 && (
                          <div className="text-xs text-signal-ink font-medium">
                            {m.tags.map((t) => `#${t}`).join(" ")}
                          </div>
                        )}

                        {/* 记录编号与底栏药丸标签 */}
                        <div className="pt-2 border-t border-line/40 flex items-center justify-between text-xs">
                          <span className="text-[11px] text-mist font-mono">
                            记录 {m.orderNumber}
                          </span>

                          <div className="flex gap-1.5">
                            {m.tags.map((t) => (
                              <span
                                key={t}
                                className="rounded-full bg-flame-50 dark:bg-flame-950/50 border border-flame-200 dark:border-flame-900/60 px-2 py-0.5 text-[10px] font-medium text-flame-600 dark:text-flame-400"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        </div>
                      </motion.article>
                    );
                  })}
                </AnimatePresence>
              </div>
            </main>
          </div>
        </div>

        {/* ============================================================
            手机端设备（严格还原 FlareMo 真实移动端单列布局）
            ============================================================ */}
        <div className="mx-auto w-full max-w-[320px] rounded-[2.6rem] border-4 border-surface bg-paper p-1 shadow-pop-xl ring-1 ring-line/80 relative">
          <div className="overflow-hidden rounded-[2.2rem] bg-paper border border-line/60 flex flex-col h-[540px] relative">
            {/* 手机系统状态栏与扬声器孔 */}
            <div className="h-9 bg-soft-surface px-5 flex items-center justify-between border-b border-line/60 shrink-0 select-none">
              <span className="text-[11px] font-bold text-ink">09:41</span>
              <div className="h-3.5 w-16 rounded-full bg-black flex items-center justify-center">
                <span className="size-1 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="flex items-center gap-1 text-[10px] text-ink font-bold">
                5G
              </div>
            </div>

            {/* 移动端 App 真实顶栏：汉堡菜单 (可点击打开抽屉) + 标题 + 筛选提示 */}
            <div className="px-3.5 py-2 border-b border-line/60 bg-surface flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(true)}
                  className="p-1 -ml-1 text-ink hover:text-signal hover:bg-wash transition-colors cursor-pointer rounded-lg focus:outline-none flex items-center"
                  aria-label="打开侧边栏"
                  title="点击打开侧边栏"
                >
                  <Menu className="size-4" />
                </button>
                <span className="text-sm font-bold text-ink tracking-tight">
                  {activeTag
                    ? `#${activeTag}`
                    : activeMenu === "timeline"
                      ? "时间线"
                      : activeMenu === "archive"
                        ? "归档"
                        : "回收站"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {activeTag && (
                  <button
                    type="button"
                    onClick={() => setActiveTag(null)}
                    className="text-[10px] text-signal hover:underline cursor-pointer"
                  >
                    重置
                  </button>
                )}
                <span className="text-[10px] text-fog font-mono bg-soft-surface px-1.5 py-0.5 rounded-full border border-line/60">
                  {filteredMemos.length}
                </span>
              </div>
            </div>

            {/* 手机屏幕主内容区 (可滚动，使用 no-scrollbar 去除粗滚动条) */}
            <div className="p-3 flex-1 overflow-y-auto space-y-3 no-scrollbar">
              {/* 搜索框 */}
              <div className="relative">
                <Search className="size-3 text-fog absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索记录..."
                  className="w-full h-7 pl-7 pr-3 rounded-full border border-line/70 bg-surface text-[11px] text-ink placeholder:text-fog focus:outline-none"
                />
              </div>

              {/* 手机端真实 Memo 发送器 */}
              <div className="rounded-2xl border border-line/70 bg-surface p-3 shadow-2xs space-y-2">
                <textarea
                  value={mobileInput}
                  onChange={(e) => setMobileInput(e.target.value)}
                  placeholder="此刻在想什么？记下来..."
                  rows={2}
                  className="w-full bg-transparent text-xs text-ink placeholder:text-fog resize-none focus:outline-none leading-relaxed"
                />

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2.5 text-mist">
                    <button
                      type="button"
                      onClick={() => setMobileInput((p) => `${p} #`)}
                      className="cursor-pointer hover:text-ink"
                    >
                      <Hash className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className="cursor-pointer hover:text-ink"
                    >
                      <ImageIcon className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className="cursor-pointer hover:text-ink"
                    >
                      <List className="size-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => publishMemo(mobileInput, true)}
                    disabled={isSyncing || !mobileInput.trim()}
                    className="inline-flex items-center gap-1 rounded-full bg-brand-gradient px-3 py-1 text-xs font-semibold text-white shadow-xs hover:brightness-105 active:translate-y-px transition-all cursor-pointer disabled:opacity-40"
                  >
                    {isSyncing ? (
                      <span className="animate-spin text-xs">⟳</span>
                    ) : (
                      <>
                        <Send className="size-2.5" />
                        <span>发送</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 灵感气泡（一键填入并直接演练） */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-fog px-1 flex items-center gap-1">
                  <span>✨ 快捷灵感（点击一键演练）：</span>
                </div>
                <div className="space-y-1">
                  {PRESETS.map((p) => (
                    <button
                      type="button"
                      key={p.text}
                      onClick={() => publishMemo(p.text, true)}
                      disabled={isSyncing}
                      className="w-full text-left rounded-xl border border-line/60 bg-surface p-2 text-[11px] text-mist hover:text-ink hover:bg-wash transition-colors cursor-pointer group shadow-2xs"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="line-clamp-1">{p.text}</span>
                        <Send className="size-2.5 text-signal opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 移动端时间线第一条卡片预览 */}
              {filteredMemos.length > 0 && (
                <div className="rounded-2xl border border-line/70 bg-surface p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="size-3.5 rounded-full border border-zinc-300 dark:border-zinc-700 bg-zinc-100" />
                      <span className="text-[10px] text-mist">
                        {filteredMemos[0].timeLabel}
                      </span>
                    </div>
                    <MoreHorizontal className="size-3 text-fog" />
                  </div>
                  <div className="font-bold text-ink text-xs line-clamp-1">
                    {filteredMemos[0].title}
                  </div>
                  <p className="text-[11px] text-mist line-clamp-2">
                    {filteredMemos[0].content}
                  </p>
                  <div className="flex gap-1 pt-1 border-t border-line/40">
                    {filteredMemos[0].tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-flame-50 dark:bg-flame-950/50 px-2 py-0.5 text-[9px] text-flame-600 dark:text-flame-400 font-medium"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 手机底部指示条 */}
            <div className="h-5 flex items-center justify-center bg-soft-surface shrink-0 border-t border-line/40 select-none">
              <span className="h-1 w-20 rounded-full bg-mist/40" />
            </div>

            {/* 移动端真实侧边抽屉 (Sheet Drawer) */}
            <AnimatePresence>
              {mobileDrawerOpen && (
                <>
                  {/* 背景遮罩 */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => setMobileDrawerOpen(false)}
                    className="absolute inset-0 z-40 bg-black/60 backdrop-blur-xs cursor-pointer"
                  />

                  {/* 侧边滑出抽屉面板 */}
                  <motion.aside
                    initial={{ x: "-100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "-100%" }}
                    transition={{ type: "spring", damping: 26, stiffness: 300 }}
                    className="absolute inset-y-0 left-0 z-50 w-[84%] bg-surface border-r border-line shadow-2xl flex flex-col overflow-hidden"
                  >
                    {/* 抽屉顶部 Header */}
                    <div className="p-3.5 border-b border-line/60 flex items-center justify-between bg-surface/90">
                      <div className="flex items-center gap-2">
                        <div className="flex size-6 items-center justify-center rounded-lg bg-brand-gradient text-white text-xs font-bold shadow-2xs">
                          <span className="text-white font-extrabold text-[13px]">
                            F
                          </span>
                        </div>
                        <span className="font-bold text-sm text-ink tracking-tight">
                          FlareMo
                        </span>
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-soft-surface px-1.5 py-0.5 text-[8px] font-mono border border-line/60 text-mist">
                          v0.20
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMobileDrawerOpen(false)}
                        className="p-1 text-mist hover:text-ink rounded-lg transition-colors cursor-pointer"
                        aria-label="关闭侧边栏"
                      >
                        <X className="size-4" />
                      </button>
                    </div>

                    {/* 抽屉滚动内容 */}
                    <div className="flex-1 overflow-y-auto p-3 space-y-3.5 no-scrollbar text-xs">
                      {/* 统计概览 */}
                      <div className="grid grid-cols-3 text-center py-1.5 border-y border-line/60 bg-soft-surface/40 rounded-lg">
                        <div>
                          <div className="text-sm font-extrabold text-ink tabular-nums">
                            {totalCount}
                          </div>
                          <div className="text-[9px] text-mist">记录</div>
                        </div>
                        <div>
                          <div className="text-sm font-extrabold text-ink tabular-nums">
                            {tagList.length}
                          </div>
                          <div className="text-[9px] text-mist">标签</div>
                        </div>
                        <div>
                          <div className="text-sm font-extrabold text-ink tabular-nums">
                            1
                          </div>
                          <div className="text-[9px] text-mist">天</div>
                        </div>
                      </div>

                      {/* 贡献热力图 */}
                      <div className="rounded-xl border border-line/60 bg-surface/70 p-2 space-y-1">
                        <div className="grid grid-flow-col grid-rows-6 gap-0.5 justify-between">
                          {HEATMAP_TILES.slice(0, 48).map((tile) => (
                            <span
                              key={`mob-${tile.id}`}
                              className={cn(
                                "size-1.5 rounded-[1px]",
                                tile.isHigh
                                  ? "bg-signal"
                                  : tile.isMedium
                                    ? "bg-signal/40"
                                    : "bg-line/70 dark:bg-line/40",
                              )}
                            />
                          ))}
                        </div>
                        <div className="flex justify-between text-[8px] text-fog font-mono px-0.5">
                          <span>7月</span>
                          <span>8月</span>
                          <span>9月</span>
                        </div>
                      </div>

                      {/* 菜单列表 */}
                      <nav className="space-y-0.5 font-semibold text-[11px]">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenu("timeline");
                            setActiveTag(null);
                            setMobileDrawerOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center justify-between px-2 py-1.5 rounded-lg transition-colors cursor-pointer",
                            activeMenu === "timeline" && !activeTag
                              ? "bg-signal/15 text-signal-ink font-bold border border-signal/30"
                              : "text-mist hover:text-ink hover:bg-wash",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Inbox className="size-3.5 text-signal" />
                            <span>时间线</span>
                          </div>
                          <span className="font-mono text-[9px] px-1 py-0.2 bg-line/60 rounded-full text-mist">
                            {totalCount}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenu("archive");
                            setMobileDrawerOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center justify-between px-2 py-1.5 rounded-lg transition-colors cursor-pointer",
                            activeMenu === "archive"
                              ? "bg-signal/15 text-signal-ink font-bold border border-signal/30"
                              : "text-mist hover:text-ink hover:bg-wash",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Archive className="size-3.5" />
                            <span>归档</span>
                          </div>
                          <span className="font-mono text-[9px] px-1 py-0.2 bg-line/60 rounded-full text-mist">
                            0
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenu("trash");
                            setMobileDrawerOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center justify-between px-2 py-1.5 rounded-lg transition-colors cursor-pointer",
                            activeMenu === "trash"
                              ? "bg-signal/15 text-signal-ink font-bold border border-signal/30"
                              : "text-mist hover:text-ink hover:bg-wash",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Trash2 className="size-3.5" />
                            <span>回收站</span>
                          </div>
                          <span className="font-mono text-[9px] px-1 py-0.2 bg-line/60 rounded-full text-mist">
                            0
                          </span>
                        </button>
                      </nav>

                      {/* 快捷视图 */}
                      <div className="pt-2 border-t border-line/40 space-y-0.5 text-[11px] text-mist">
                        {[
                          { icon: Zap, label: "每日回顾" },
                          { icon: Footprints, label: "随机漫步" },
                          { icon: Brain, label: "记忆" },
                          { icon: CalendarDays, label: "日历" },
                          { icon: FolderKanban, label: "项目" },
                        ].map((item) => (
                          <button
                            type="button"
                            key={item.label}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:text-ink hover:bg-wash transition-colors cursor-pointer text-left"
                            onClick={() => setMobileDrawerOpen(false)}
                          >
                            <item.icon className="size-3.5 text-fog" />
                            <span>{item.label}</span>
                          </button>
                        ))}
                      </div>

                      {/* 标签列表 */}
                      <div className="pt-2 border-t border-line/40 space-y-1">
                        <div className="text-[10px] font-bold text-fog px-2">
                          标签索引
                        </div>
                        <div className="space-y-0.5">
                          {tagList.map((tag) => (
                            <button
                              type="button"
                              key={tag.name}
                              onClick={() => {
                                setActiveTag(
                                  activeTag === tag.name ? null : tag.name,
                                );
                                setMobileDrawerOpen(false);
                              }}
                              className={cn(
                                "w-full flex items-center justify-between px-2 py-1 rounded-lg text-[11px] transition-colors cursor-pointer",
                                activeTag === tag.name
                                  ? "bg-signal/15 text-signal-ink font-bold"
                                  : "text-mist hover:text-ink hover:bg-wash",
                              )}
                            >
                              <span>#{tag.name}</span>
                              <span className="text-[9px] text-fog font-mono">
                                {tag.count}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* 抽屉底部设置 */}
                    <div className="p-2.5 border-t border-line/60 bg-soft-surface/50 flex items-center justify-between text-xs text-mist">
                      <div className="flex items-center gap-1.5">
                        <span className="size-4 rounded-full bg-signal/20 flex items-center justify-center text-[10px] font-bold text-signal-ink">
                          K
                        </span>
                        <span className="text-[11px] font-medium text-ink">
                          flaremo-user
                        </span>
                      </div>
                      <Settings className="size-3.5 hover:text-ink cursor-pointer" />
                    </div>
                  </motion.aside>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
