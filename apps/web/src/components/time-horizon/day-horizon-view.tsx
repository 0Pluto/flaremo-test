// ============================================================================
// 4. Day Horizon View (Option 2: Dual-Axis Timepiece - Linear Spine + Orbital Dial)
// ============================================================================
import { useEffect, useMemo, useState } from "react";
import { heatmapColor } from "@/lib/activity";
import { todayKey } from "@/lib/calendar-date";
import { buildHourCountMap } from "@/lib/time-horizon";
import { cn } from "@/lib/utils";
import { DAY_HOURS, type DisplayMode } from "./shared";

type MemoItem = {
  id: string;
  create_time: string;
  content?: string;
};

export function DayHorizonPureView({
  selectedDay,
  today = todayKey(),
  hourlyData,
  memos = [],
  isLoading,
  displayMode = "calendar",
  onJumpToTimeline,
  onHoverTip,
}: {
  selectedDay: string;
  today?: string;
  hourlyData: Array<{ date: string; hour: number; count: number }>;
  memos?: MemoItem[];
  isLoading: boolean;
  displayMode?: DisplayMode;
  onJumpToTimeline: (day: string) => void;
  onHoverTip: (tip: string | null) => void;
}) {
  const hourCountMap = useMemo(
    () => buildHourCountMap(hourlyData),
    [hourlyData],
  );

  const [hoveredHour, setHoveredHour] = useState<number | null>(null);

  const isViewingToday = selectedDay === today;

  // Real-time second sync for the satellite photon (0..60s offset)
  const [secondOffset, setSecondOffset] = useState(() => {
    const d = new Date();
    return d.getSeconds() + d.getMilliseconds() / 1000;
  });

  useEffect(() => {
    if (!isViewingToday) return;
    const syncTime = () => {
      const d = new Date();
      setSecondOffset(d.getSeconds() + d.getMilliseconds() / 1000);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        syncTime();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isViewingToday]);

  // If viewing a historical day, find the last active hour to dock the photon
  const lastActiveHour = useMemo(() => {
    if (isViewingToday) return null;
    for (let h = 23; h >= 0; h--) {
      if ((hourCountMap.get(h) ?? 0) > 0) return h;
    }
    return null;
  }, [isViewingToday, hourCountMap]);

  // Group memos by their local hour for informative hover tips
  const memosByHour = useMemo(() => {
    const map = new Map<number, MemoItem[]>();
    for (const m of memos) {
      const h = new Date(m.create_time).getHours();
      const list = map.get(h) ?? [];
      list.push(m);
      map.set(h, list);
    }
    return map;
  }, [memos]);

  const handleHoverHour = (h: number | null) => {
    setHoveredHour(h);
    if (h === null) {
      onHoverTip(null);
      return;
    }
    const count = hourCountMap.get(h) ?? 0;
    const hourLabel = `${String(h).padStart(2, "0")}:00`;
    const hourMemos = memosByHour.get(h) ?? [];
    const firstSnippet = hourMemos[0]?.content
      ? hourMemos[0].content
          .replace(/[#*`~>-]/g, "")
          .trim()
          .slice(0, 30)
      : null;

    if (count > 0) {
      const snippetSuffix = firstSnippet ? ` · “${firstSnippet}”` : "";
      onHoverTip(
        `${selectedDay} ${hourLabel} · ${count} 条笔记${snippetSuffix}`,
      );
    } else {
      onHoverTip(`${selectedDay} ${hourLabel} · 无记录`);
    }
  };

  // Dial Geometry Constants
  const R = 44;
  const cx = 58;
  const cy = 58;

  return (
    <div className="flex h-full min-h-[196px] items-center justify-center px-1 py-1 select-none">
      <div className="flex items-center justify-center gap-3 sm:gap-5 w-full max-w-[210px]">
        {/* ── Left Side: The Linear Spine (周视图单列的无缝切出, 24 根高对比度堆叠横条) ── */}
        <div className="flex items-stretch gap-1.5 shrink-0">
          {/* Y-axis Hour Scale (Calendar Mode Only - Zero Text in Heatmap Mode) */}
          {displayMode === "calendar" ? (
            <div className="flex w-3.5 shrink-0 flex-col justify-between py-0.5 text-[8.5px] font-mono font-medium text-foreground/75 dark:text-foreground/70 select-none">
              <span>00</span>
              <span>06</span>
              <span>12</span>
              <span>18</span>
              <span>23</span>
            </div>
          ) : null}

          {/* The Single Magnified Column of 24 Stacked Bars */}
          <div
            className={cn(
              "flex w-8 sm:w-9 flex-col justify-between gap-[2px]",
              isLoading && "animate-pulse",
            )}
          >
            {DAY_HOURS.map((h) => {
              const count = hourCountMap.get(h) ?? 0;
              const isHovered = hoveredHour === h;

              return (
                <button
                  key={`day-bar-${h}`}
                  className={cn(
                    "h-[6px] w-full rounded-[1.5px] transition-all cursor-pointer",
                    displayMode === "heatmap"
                      ? count > 0
                        ? cn(
                            heatmapColor(count),
                            "hover:brightness-110 shadow-2xs",
                          )
                        : "border border-black/[0.04] bg-muted-foreground/20 hover:bg-muted-foreground/35 dark:border-white/[0.06] dark:bg-white/[0.14] dark:hover:bg-white/[0.24]"
                      : count > 0
                        ? "bg-brand-500 dark:bg-brand-400 shadow-xs ring-1 ring-brand-500/80 dark:ring-brand-400/80 brightness-105 hover:brightness-115"
                        : "border border-black/[0.04] bg-muted-foreground/20 hover:bg-muted-foreground/35 dark:border-white/[0.06] dark:bg-white/[0.14] dark:hover:bg-white/[0.24]",
                    isHovered &&
                      "ring-1.5 ring-brand-500 scale-x-110 scale-y-115 z-10 brightness-110 shadow-xs",
                    "hover:scale-x-110 hover:scale-y-115 hover:z-10",
                  )}
                  type="button"
                  onClick={() => onJumpToTimeline(selectedDay)}
                  onMouseEnter={() => handleHoverHour(h)}
                  onMouseLeave={() => handleHoverHour(null)}
                />
              );
            })}
          </div>
        </div>

        {/* ── Right Side: The Orbital Solar Dial (24小时微型环形日晷 + 卫星微粒) ── */}
        <button
          type="button"
          className="flex flex-1 items-center justify-center p-1 cursor-pointer transition-transform hover:scale-105"
          onClick={() => onJumpToTimeline(selectedDay)}
          aria-label="在时间线查看该日"
        >
          <svg
            viewBox="0 0 116 116"
            className="w-[110px] h-[110px] select-none"
            aria-hidden="true"
          >
            <title>24小时日晷时计</title>

            {/* Outer orbital track (crisp celestial dashed line) */}
            <circle
              cx={cx}
              cy={cy}
              r={R}
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="2 3.5"
              className="text-foreground/28 dark:text-foreground/35"
            />

            {/* Inner concentric guide ring */}
            <circle
              cx={cx}
              cy={cy}
              r={25}
              fill="none"
              stroke="currentColor"
              strokeWidth="0.75"
              strokeDasharray="1.5 4"
              className="text-foreground/18 dark:text-foreground/22"
            />

            {/* Center hub point */}
            <circle
              cx={cx}
              cy={cy}
              r="2.2"
              className="fill-brand-500 dark:fill-brand-400"
            />
            <circle
              cx={cx}
              cy={cy}
              r="0.8"
              className="fill-background dark:fill-background"
            />

            {/* 24 Hour Nodes around the orbital circle */}
            {DAY_HOURS.map((h) => {
              const count = hourCountMap.get(h) ?? 0;
              const isHovered = hoveredHour === h;
              const isCardinal = h % 6 === 0;

              // Angle: 00:00 at top (-90 deg), 06:00 right (0 deg), 12:00 bottom (90 deg), 18:00 left (180 deg)
              const angleDeg = h * 15 - 90;
              const angleRad = (angleDeg * Math.PI) / 180;
              const x = cx + R * Math.cos(angleRad);
              const y = cy + R * Math.sin(angleRad);

              const radius = isHovered
                ? count > 0
                  ? 5
                  : 3.5
                : count > 0
                  ? 3.5
                  : isCardinal
                    ? 2.2
                    : 1.5;

              return (
                <g key={`dial-dot-${h}`}>
                  {/* Pulsing ring if active and hovered */}
                  {isHovered && count > 0 && (
                    <circle
                      cx={x}
                      cy={y}
                      r="7"
                      fill="none"
                      stroke="var(--brand-500)"
                      strokeWidth="1.2"
                      className="animate-pulse opacity-85"
                    />
                  )}

                  {/* Visible Node */}
                  <circle
                    cx={x}
                    cy={y}
                    r={radius}
                    className={cn(
                      "transition-all duration-150",
                      count > 0
                        ? "fill-brand-500 dark:fill-brand-400 filter drop-shadow-[0_0_3px_var(--brand-500)]"
                        : isCardinal
                          ? "fill-foreground/60 dark:fill-foreground/65"
                          : "fill-foreground/30 dark:fill-foreground/38",
                      isHovered && "fill-brand-500 brightness-125 scale-110",
                    )}
                  />

                  {/* Expanded interactive hit circle */}
                  {/* biome-ignore lint/a11y/noStaticElementInteractions: SVG dial node hover indicator */}
                  <circle
                    cx={x}
                    cy={y}
                    r="7"
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => handleHoverHour(h)}
                    onMouseLeave={() => handleHoverHour(null)}
                  />
                </g>
              );
            })}

            {/* ── Dynamic Orbital Satellite Photon (轨道卫星流光微粒) ── */}
            {isViewingToday ? (
              <g
                className="animate-satellite-orbit"
                style={{
                  animationDelay: `-${secondOffset}s`,
                  transformOrigin: "58px 58px",
                }}
              >
                {/* 1. Stardust Wake (3 Tapering Trailing Particles along R=44) */}
                <circle
                  cx={cx + R * Math.sin((-13 * Math.PI) / 180)}
                  cy={cy - R * Math.cos((-13 * Math.PI) / 180)}
                  r="0.8"
                  className="fill-brand-500/25 dark:fill-brand-400/30"
                />
                <circle
                  cx={cx + R * Math.sin((-8 * Math.PI) / 180)}
                  cy={cy - R * Math.cos((-8 * Math.PI) / 180)}
                  r="1.2"
                  className="fill-brand-500/50 dark:fill-brand-400/60"
                />
                <circle
                  cx={cx + R * Math.sin((-3.5 * Math.PI) / 180)}
                  cy={cy - R * Math.cos((-3.5 * Math.PI) / 180)}
                  r="1.7"
                  className="fill-brand-500/80 dark:fill-brand-400/90"
                />

                {/* 2. Luminous Halo Aura */}
                <circle
                  cx={cx}
                  cy={cy - R}
                  r="4.5"
                  className="fill-brand-500/20 dark:fill-brand-400/25 animate-pulse"
                />

                {/* 3. Core Photon: High-energy brilliant particle */}
                <circle
                  cx={cx}
                  cy={cy - R}
                  r="2.2"
                  className="fill-brand-500 dark:fill-brand-300 filter drop-shadow-[0_0_4px_var(--brand-500)]"
                />
                <circle
                  cx={cx}
                  cy={cy - R}
                  r="0.9"
                  className="fill-white dark:fill-white"
                />
              </g>
            ) : lastActiveHour !== null ? (
              /* Docked Photon for Historical Days (Resting at last active note hour) */
              <g
                style={{
                  transform: `rotate(${lastActiveHour * 15}deg)`,
                  transformOrigin: "58px 58px",
                }}
              >
                {/* Stationed Beacon Halo */}
                <circle
                  cx={cx}
                  cy={cy - R}
                  r="4"
                  className="fill-brand-500/20 dark:fill-brand-400/25"
                />
                {/* Stationed Photon */}
                <circle
                  cx={cx}
                  cy={cy - R}
                  r="2"
                  className="fill-brand-500 dark:fill-brand-300 filter drop-shadow-[0_0_3px_var(--brand-500)]"
                />
                <circle cx={cx} cy={cy - R} r="0.8" className="fill-white/90" />
              </g>
            ) : null}

            {/* Cardinal Markers in Calendar Mode Only (Zero Text in Heatmap Mode) */}
            {displayMode === "calendar" && (
              <>
                <text
                  x={cx}
                  y="8"
                  textAnchor="middle"
                  className="text-[7.5px] font-mono font-medium fill-foreground/75 dark:fill-foreground/80 select-none"
                >
                  00
                </text>
                <text
                  x="111"
                  y={cy + 2.5}
                  textAnchor="start"
                  className="text-[7.5px] font-mono font-medium fill-foreground/75 dark:fill-foreground/80 select-none"
                >
                  06
                </text>
                <text
                  x={cx}
                  y="113"
                  textAnchor="middle"
                  className="text-[7.5px] font-mono font-medium fill-foreground/75 dark:fill-foreground/80 select-none"
                >
                  12
                </text>
                <text
                  x="5"
                  y={cy + 2.5}
                  textAnchor="end"
                  className="text-[7.5px] font-mono font-medium fill-foreground/75 dark:fill-foreground/80 select-none"
                >
                  18
                </text>
              </>
            )}
          </svg>
        </button>
      </div>
    </div>
  );
}
