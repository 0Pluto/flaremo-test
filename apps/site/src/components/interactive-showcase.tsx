import {
  ArrowUp,
  Bookmark,
  Heart,
  Lock,
  MessageSquarePlus,
  RefreshCw,
  Send,
  Sparkles,
  Wifi,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Memo = {
  id: string;
  content: string;
  tags: string[];
  createdAt: string;
  pinned?: boolean;
  likes: number;
  liked?: boolean;
  isNew?: boolean;
};

const INITIAL_MEMOS: Memo[] = [
  {
    id: "memo-1",
    content:
      "在 Cloudflare Workers + D1 架构上重构完成，彻底去除了常驻 VPS 与 Docker。首包延迟仅 12ms，数据跨多可用区物理持久化。",
    tags: ["架构", "Cloudflare"],
    createdAt: "刚刚",
    pinned: true,
    likes: 5,
  },
  {
    id: "memo-2",
    content:
      "离线优先（Offline-First）原则：本地先落 IndexedDB 保证零卡顿，重新连接边缘网关后再按单调时间戳批量追平差量。",
    tags: ["灵感", "架构"],
    createdAt: "15 分钟前",
    likes: 12,
  },
  {
    id: "memo-3",
    content:
      "接入 Claude Desktop 与 Cursor 的 MCP 协议端点，AI 编码助理现在已经可以把全库笔记当成长期记忆进行检索和溯源。",
    tags: ["AI", "生态"],
    createdAt: "1 小时前",
    likes: 8,
  },
];

const PRESETS = [
  {
    text: "在机场候机时随手理清了多端同步幂等协议 #架构 #灵感",
    tag: "架构",
  },
  {
    text: "体验了一下离线 PWA 模式，断网随心记，连网秒级入库 #灵感",
    tag: "灵感",
  },
  {
    text: "配置完成 Telegram 随手记 Bot，直接发语音自动转文字入库 #生态",
    tag: "生态",
  },
];

export function InteractiveShowcase({
  heading,
  subtitle,
}: {
  heading: string;
  subtitle: string;
}) {
  const [memos, setMemos] = useState<Memo[]>(INITIAL_MEMOS);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [mobileText, setMobileText] = useState("");
  const [selectedPresetTag, setSelectedPresetTag] = useState("架构");
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedId, setLastSyncedId] = useState<string | null>(null);

  // 获取所有独立标签及频次
  const tagCounts = memos.reduce<Record<string, number>>((acc, m) => {
    for (const t of m.tags) {
      acc[t] = (acc[t] || 0) + 1;
    }
    return acc;
  }, {});

  const filteredMemos = selectedTag
    ? memos.filter((m) => m.tags.includes(selectedTag))
    : memos;

  // 手机端发布笔记并触发同步
  const handlePublishFromMobile = (textToSend?: string) => {
    const rawContent = (textToSend ?? mobileText).trim();
    if (!rawContent) return;

    setIsSyncing(true);

    // 提取文本中的 #tag 或附加选中的预设 tag
    const extractedTags = Array.from(
      new Set(
        (rawContent.match(/#([\w\u4e00-\u9fa5]+)/g) || []).map((t) =>
          t.replace("#", ""),
        ),
      ),
    );
    const finalTags =
      extractedTags.length > 0 ? extractedTags : [selectedPresetTag || "灵感"];

    const newId = `memo-${Date.now()}`;
    const cleanContent = rawContent
      .replace(/#([\w\u4e00-\u9fa5]+)/g, "")
      .trim();

    setTimeout(() => {
      const newMemo: Memo = {
        id: newId,
        content: cleanContent || rawContent,
        tags: finalTags,
        createdAt: "刚刚同步",
        likes: 0,
        isNew: true,
      };

      setMemos((prev) => [newMemo, ...prev]);
      setLastSyncedId(newId);
      setMobileText("");
      setIsSyncing(false);
    }, 400);
  };

  const handleToggleLike = (id: string) => {
    setMemos((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const liked = !m.liked;
        return {
          ...m,
          liked,
          likes: liked ? m.likes + 1 : m.likes - 1,
        };
      }),
    );
  };

  const handleTogglePin = (id: string) => {
    setMemos((prev) =>
      prev.map((m) => (m.id === id ? { ...m, pinned: !m.pinned } : m)),
    );
  };

  const handleReset = () => {
    setMemos(INITIAL_MEMOS);
    setSelectedTag(null);
    setMobileText("");
    setLastSyncedId(null);
  };

  return (
    <section className="container-x space-y-8">
      {/* 模块标头 */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-2 max-w-2xl">
          <Badge variant="flame">Live Interactive Playground</Badge>
          <h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl md:text-4xl">
            {heading}
          </h2>
          <p className="text-sm text-mist">{subtitle}</p>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-between sm:justify-end">
          <div className="inline-flex items-center gap-2 rounded-full border border-line/70 bg-soft-surface px-3 py-1 text-xs font-semibold text-mist">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            <span>Cloudflare Edge: 12ms</span>
          </div>

          <button
            type="button"
            onClick={handleReset}
            title="重置演练数据"
            className="inline-flex items-center gap-1.5 rounded-full border border-line/60 bg-surface px-3 py-1 text-xs font-semibold text-mist transition-colors hover:bg-wash hover:text-ink cursor-pointer"
          >
            <RefreshCw className="size-3" />
            <span>重置</span>
          </button>
        </div>
      </div>

      {/* 双端可交互演练工作台 */}
      <div className="grid gap-6 lg:grid-cols-[1fr_310px] xl:grid-cols-[1fr_330px] items-start">
        {/* ============================================================
            电脑端桌面浏览器视窗（Desktop View）
            ============================================================ */}
        <div className="panel-card overflow-hidden border border-line/70 shadow-pop-xl transition-all duration-300">
          {/* macOS 视窗顶栏 */}
          <div className="flex h-10 items-center justify-between border-b border-line/60 bg-soft-surface px-4">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-[#ff5f56] shadow-2xs" />
              <span className="size-3 rounded-full bg-[#ffbd2e] shadow-2xs" />
              <span className="size-3 rounded-full bg-[#27c93f] shadow-2xs" />
            </div>

            <div className="flex h-6 w-60 sm:w-80 items-center justify-center gap-1.5 rounded-md border border-line/60 bg-surface px-3 text-[11px] text-mist shadow-2xs">
              <Lock className="size-2.5 text-signal" />
              <span className="font-mono truncate">
                https://app.flaremo.app
              </span>
            </div>

            <div className="flex items-center gap-1 text-[11px] font-semibold text-signal-ink">
              <Zap className="size-3" />
              <span className="hidden sm:inline">D1 Global Sync</span>
            </div>
          </div>

          {/* 桌面端内页主体 */}
          <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] min-h-[460px] bg-paper">
            {/* 侧边栏 */}
            <aside className="border-r border-line/60 bg-surface/50 p-4 space-y-5 hidden md:block">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-brand-gradient text-white text-xs font-bold shadow-2xs">
                  FM
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-ink truncate">
                    Kim's Space
                  </div>
                  <div className="text-[10px] text-mist">个人私有知识库</div>
                </div>
              </div>

              {/* 标签过滤 */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-fog px-1">
                  标签分类
                </div>
                <div className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => setSelectedTag(null)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer text-left",
                      selectedTag === null
                        ? "bg-surface text-signal-ink shadow-2xs border border-line/60"
                        : "text-mist hover:bg-wash hover:text-ink",
                    )}
                  >
                    <span>全部笔记</span>
                    <span className="text-[10px] text-fog tabular-nums font-mono">
                      {memos.length}
                    </span>
                  </button>

                  {Object.entries(tagCounts).map(([tag, count]) => (
                    <button
                      type="button"
                      key={tag}
                      onClick={() => setSelectedTag(tag)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer text-left",
                        selectedTag === tag
                          ? "bg-surface text-signal-ink shadow-2xs border border-line/60"
                          : "text-mist hover:bg-wash hover:text-ink",
                      )}
                    >
                      <span>#{tag}</span>
                      <span className="text-[10px] text-fog tabular-nums font-mono">
                        {count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 边缘统计 */}
              <div className="rounded-xl border border-line/60 bg-soft-surface p-3 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-medium text-mist">
                  <span>D1 数据量</span>
                  <span className="text-signal-ink font-bold font-mono">
                    5.2 KB
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-medium text-mist">
                  <span>响应延迟</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold font-mono">
                    12 ms
                  </span>
                </div>
              </div>
            </aside>

            {/* 主时间线区 */}
            <main className="p-4 sm:p-6 space-y-4 max-h-[560px] overflow-y-auto">
              {/* 顶部模拟输入框 */}
              <div className="panel-card p-3 border border-line/60 bg-surface shadow-2xs">
                <div className="text-xs text-fog flex items-center gap-2">
                  <MessageSquarePlus className="size-3.5 text-signal" />
                  <span>桌面端实时就绪，正在监听边缘双向流...</span>
                </div>
              </div>

              {/* 笔记时间线流 */}
              <div className="space-y-3">
                <AnimatePresence initial={false}>
                  {filteredMemos.map((memo) => {
                    const isHighlighted = memo.id === lastSyncedId;
                    return (
                      <motion.article
                        key={memo.id}
                        layout
                        initial={{ opacity: 0, y: -20, scale: 0.95 }}
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
                          "panel-card p-4 transition-all duration-300 relative border",
                          isHighlighted
                            ? "border-signal/50 bg-signal/5 shadow-md ring-2 ring-signal/20"
                            : "border-line/60 bg-surface shadow-2xs hover:border-line",
                        )}
                      >
                        {/* 置顶或刚刚同步徽标 */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="size-5 rounded-full bg-signal/15 text-signal-ink flex items-center justify-center text-[10px] font-bold">
                              K
                            </span>
                            <span className="text-xs font-bold text-ink">
                              Kim
                            </span>
                            <span className="text-[11px] text-fog font-mono">
                              {memo.createdAt}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {isHighlighted && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-signal/15 px-2 py-0.5 text-[10px] font-bold text-signal-ink animate-pulse">
                                <Sparkles className="size-2.5" />
                                刚刚同步
                              </span>
                            )}
                            {memo.pinned && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-mist">
                                <Bookmark className="size-2.5 fill-signal text-signal" />
                                置顶
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 内容正文 */}
                        <p className="text-xs sm:text-sm text-ink leading-relaxed">
                          {memo.content}
                        </p>

                        {/* 标签 */}
                        {memo.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2.5">
                            {memo.tags.map((t) => (
                              <button
                                type="button"
                                key={t}
                                onClick={() => setSelectedTag(t)}
                                className="inline-flex items-center rounded-md border border-line/60 bg-soft-surface px-2 py-0.5 text-[10px] font-semibold text-signal-ink hover:bg-wash transition-colors cursor-pointer"
                              >
                                #{t}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* 底部点赞与置顶操作 */}
                        <div className="flex items-center justify-between border-t border-line/50 mt-3 pt-2 text-fog">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => handleToggleLike(memo.id)}
                              className={cn(
                                "flex items-center gap-1 text-[11px] font-semibold transition-colors cursor-pointer",
                                memo.liked
                                  ? "text-rose-500 font-bold"
                                  : "hover:text-ink",
                              )}
                            >
                              <Heart
                                className={cn(
                                  "size-3.5",
                                  memo.liked && "fill-rose-500 text-rose-500",
                                )}
                              />
                              <span>{memo.likes}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleTogglePin(memo.id)}
                              className={cn(
                                "flex items-center gap-1 text-[11px] font-semibold transition-colors cursor-pointer",
                                memo.pinned ? "text-signal" : "hover:text-ink",
                              )}
                            >
                              <Bookmark className="size-3.5" />
                              <span>{memo.pinned ? "已置顶" : "置顶"}</span>
                            </button>
                          </div>

                          <div className="text-[10px] text-fog">
                            Cloudflare D1 Validated
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
            手机端速记设备模拟器（Mobile View）
            ============================================================ */}
        <div className="mx-auto w-full max-w-[320px] rounded-[2.6rem] border-4 border-surface bg-paper p-1 shadow-pop-xl ring-1 ring-line/80 relative">
          <div className="overflow-hidden rounded-[2.2rem] bg-paper border border-line/60 flex flex-col h-[520px]">
            {/* 灵动岛与状态栏 */}
            <div className="h-10 bg-soft-surface px-5 flex items-center justify-between border-b border-line/60 shrink-0">
              <span className="text-[11px] font-bold text-ink">09:41</span>
              {/* 灵动岛胶囊 */}
              <div className="h-4 w-20 rounded-full bg-black flex items-center justify-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[8px] font-mono text-white/80">
                  FlareMo
                </span>
              </div>
              <div className="flex items-center gap-1 text-ink">
                <Wifi className="size-3" />
                <div className="size-2 rounded-full bg-signal" />
              </div>
            </div>

            {/* 手机 App 顶栏 */}
            <div className="px-4 py-2.5 border-b border-line/60 bg-surface/80 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5">
                <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-ink">随手速记</span>
              </div>
              <span className="text-[10px] font-semibold text-mist bg-soft-surface px-2 py-0.5 rounded-full border border-line/60">
                PWA 离线就绪
              </span>
            </div>

            {/* 手机内部主体内容区 */}
            <div className="p-3.5 flex-1 flex flex-col justify-between overflow-y-auto space-y-3">
              {/* 输入框卡片 */}
              <div className="panel-card p-3 border border-line/60 bg-surface shadow-2xs space-y-2">
                <textarea
                  value={mobileText}
                  onChange={(e) => setMobileText(e.target.value)}
                  placeholder="随时记下灵感，自动实时同步到电脑端知识库..."
                  rows={3}
                  className="w-full bg-transparent text-xs text-ink placeholder:text-fog resize-none focus:outline-none leading-relaxed"
                />

                {/* 快捷标签 */}
                <div className="flex items-center justify-between pt-1 border-t border-line/40">
                  <div className="flex gap-1">
                    {["架构", "灵感", "待办"].map((t) => (
                      <button
                        type="button"
                        key={t}
                        onClick={() => setSelectedPresetTag(t)}
                        className={cn(
                          "rounded-md px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer",
                          selectedPresetTag === t
                            ? "bg-signal/15 text-signal-ink font-bold border border-signal/30"
                            : "bg-soft-surface text-mist hover:text-ink",
                        )}
                      >
                        #{t}
                      </button>
                    ))}
                  </div>

                  {/* 发送按钮 */}
                  <Button
                    size="xs"
                    variant="flame"
                    onClick={() => handlePublishFromMobile()}
                    disabled={isSyncing || !mobileText.trim()}
                    className="h-7 px-3 gap-1 rounded-full shadow-xs"
                  >
                    {isSyncing ? (
                      <span className="animate-spin text-xs">⟳</span>
                    ) : (
                      <>
                        <span>同步</span>
                        <ArrowUp className="size-3" />
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* 灵感填入气泡提示 */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-fog px-1 flex items-center justify-between">
                  <span>💡 灵感气泡（点击一键演练）：</span>
                </div>

                <div className="space-y-1">
                  {PRESETS.map((p) => (
                    <button
                      type="button"
                      key={p.text}
                      onClick={() => handlePublishFromMobile(p.text)}
                      disabled={isSyncing}
                      className="w-full text-left rounded-xl border border-line/60 bg-surface/80 p-2 text-[11px] text-mist hover:text-ink hover:bg-wash hover:border-line transition-all duration-150 cursor-pointer group shadow-2xs"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="line-clamp-1">{p.text}</span>
                        <Send className="size-2.5 text-signal shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 手机底部提示 */}
              <div className="rounded-xl border border-dashed border-line/80 bg-soft-surface/50 p-2.5 text-center">
                <div className="text-[10px] font-semibold text-mist leading-tight">
                  👈 在此点击发送后，请观察左侧电脑端
                </div>
                <div className="text-[9px] text-fog mt-0.5">
                  新笔记将以弹性动画平滑插入顶部
                </div>
              </div>
            </div>

            {/* 手机底部 Home Indicator */}
            <div className="h-5 flex items-center justify-center bg-soft-surface shrink-0">
              <span className="h-1 w-24 rounded-full bg-mist/40" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
