// ============================================================================
// 4. Day Horizon View (Centered Apple-Style Astronomical Timepiece)
// ============================================================================
import { useEffect, useMemo, useState } from "react";
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

  // Live digital clock time string for today (e.g. "21:25")
  const [currentTimeStr, setCurrentTimeStr] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });

  useEffect(() => {
    if (!isViewingToday) return;
    const updateClock = () => {
      const now = new Date();
      setCurrentTimeStr(
        `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      );
    };
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, [isViewingToday]);

  // Real-time second sync for the satellite photon (0..60s continuous rotation)
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

  // Total memos on this selected day
  const totalDayNotes = useMemo(() => {
    let sum = 0;
    for (const count of hourCountMap.values()) {
      sum += count;
    }
    return sum;
  }, [hourCountMap]);

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

  // ── Precision Horology Geometry (ViewBox: 0 0 210 210, Center: 105, 105) ──
  const cx = 105;
  const cy = 105;
  const rOrbit = 86; // Outer orbit track for satellite
  const rTickOut = 76; // Hairline ticks outer edge
  const rTickInNormal = 68; // Hairline ticks inner edge
  const rTickInCardinal = 63; // Cardinal ticks inner edge (longer)
  const rCenterHub = 48; // Inner life clock plate

  // Hovered state details for the center hub
  const hoveredCount =
    hoveredHour !== null ? (hourCountMap.get(hoveredHour) ?? 0) : 0;
  const hoveredMemos =
    hoveredHour !== null ? (memosByHour.get(hoveredHour) ?? []) : [];
  const hoveredSnippet = hoveredMemos[0]?.content
    ? hoveredMemos[0].content
        .replace(/[#*`~>-]/g, "")
        .trim()
        .slice(0, 24)
    : null;

  return (
    <div className="flex h-full min-h-[210px] items-center justify-center px-1 py-1 select-none">
      <button
        type="button"
        className="relative flex items-center justify-center p-1 cursor-pointer transition-transform duration-200 hover:scale-[1.02]"
        onClick={() => onJumpToTimeline(selectedDay)}
        aria-label="在时间线查看该日"
      >
        <svg
          viewBox="0 0 210 210"
          className={cn(
            "w-[190px] h-[190px] sm:w-[204px] sm:h-[204px] select-none",
            isLoading && "animate-pulse",
          )}
          aria-hidden="true"
        >
          <title>24小时天文时计</title>

          {/* ── 1. Center Life Hub Plate (中央生活表盘底衬) ──────────────── */}
          <circle
            cx={cx}
            cy={cy}
            r={rCenterHub}
            className="fill-card/90 dark:fill-card/75 stroke-border/60 dark:stroke-border/40 shadow-xs"
            strokeWidth="0.75"
          />

          {/* ── 2. Outer Celestial Orbit Track (极细天体虚线轨道) ───────── */}
          <circle
            cx={cx}
            cy={cy}
            r={rOrbit}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.75"
            strokeDasharray="2 4"
            className="text-foreground/20 dark:text-foreground/25"
          />

          {/* ── 3. 24-Hour Hairline Watchmaking Ticks (极简精工发丝刻度) ──── */}
          {DAY_HOURS.map((h) => {
            const count = hourCountMap.get(h) ?? 0;
            const isHovered = hoveredHour === h;
            const isCardinal = h % 6 === 0;

            // Angle: 00:00 at top (-90 deg), 06:00 right (0 deg), 12:00 bottom (90 deg), 18:00 left (180 deg)
            const angleDeg = h * 15 - 90;
            const angleRad = (angleDeg * Math.PI) / 180;
            const cos = Math.cos(angleRad);
            const sin = Math.sin(angleRad);

            const rIn = isCardinal ? rTickInCardinal : rTickInNormal;
            const x1 = cx + rIn * cos;
            const y1 = cy + rIn * sin;
            const x2 = cx + rTickOut * cos;
            const y2 = cy + rTickOut * sin;

            // Outer tip gem coordinates
            const xGem = cx + (rTickOut + 1.5) * cos;
            const yGem = cy + (rTickOut + 1.5) * sin;

            return (
              <g key={`tick-${h}`}>
                {/* Visible Hairline Tick */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  strokeLinecap="round"
                  className={cn(
                    "transition-all duration-150",
                    count > 0
                      ? "stroke-brand-500 dark:stroke-brand-400 stroke-[2px]"
                      : isCardinal
                        ? "stroke-foreground/50 dark:stroke-foreground/55 stroke-[1.2px]"
                        : "stroke-foreground/20 dark:stroke-foreground/25 stroke-[0.75px]",
                    isHovered &&
                      "stroke-brand-500 stroke-[2.4px] brightness-125",
                  )}
                />

                {/* Illuminated Gem at Tip for Active Hours */}
                {count > 0 && (
                  <g>
                    {/* Hover Pulse Halo */}
                    {isHovered && (
                      <circle
                        cx={xGem}
                        cy={yGem}
                        r="6"
                        fill="none"
                        stroke="var(--brand-500)"
                        strokeWidth="1.2"
                        className="animate-pulse opacity-85"
                      />
                    )}
                    {/* Luminous Core Gem */}
                    <circle
                      cx={xGem}
                      cy={yGem}
                      r={isHovered ? 3.2 : 2.2}
                      className="fill-brand-500 dark:fill-brand-400 filter drop-shadow-[0_0_4px_var(--brand-500)]"
                    />
                    <circle
                      cx={xGem}
                      cy={yGem}
                      r="0.8"
                      className="fill-white"
                    />
                  </g>
                )}

                {/* Expanded Invisible Click/Hover Target */}
                {/* biome-ignore lint/a11y/noStaticElementInteractions: Hour tick hover interaction */}
                <line
                  x1={cx + (rIn - 4) * cos}
                  y1={cy + (rIn - 4) * sin}
                  x2={cx + (rTickOut + 6) * cos}
                  y2={cy + (rTickOut + 6) * sin}
                  stroke="transparent"
                  strokeWidth="14"
                  className="cursor-pointer"
                  onMouseEnter={() => handleHoverHour(h)}
                  onMouseLeave={() => handleHoverHour(null)}
                />
              </g>
            );
          })}

          {/* ── 4. Cardinal Hour Typography (00, 06, 12, 18 优雅外圈数字) ── */}
          {displayMode === "calendar" && (
            <>
              <text
                x={cx}
                y="13"
                textAnchor="middle"
                className="text-[8.5px] font-mono font-semibold fill-foreground/70 dark:fill-foreground/75 select-none"
              >
                00
              </text>
              <text
                x="197"
                y={cy + 3}
                textAnchor="middle"
                className="text-[8.5px] font-mono font-semibold fill-foreground/70 dark:fill-foreground/75 select-none"
              >
                06
              </text>
              <text
                x={cx}
                y="204"
                textAnchor="middle"
                className="text-[8.5px] font-mono font-semibold fill-foreground/70 dark:fill-foreground/75 select-none"
              >
                12
              </text>
              <text
                x="13"
                y={cy + 3}
                textAnchor="middle"
                className="text-[8.5px] font-mono font-semibold fill-foreground/70 dark:fill-foreground/75 select-none"
              >
                18
              </text>
            </>
          )}

          {/* ── 5. Orbital Satellite Photon (深空孤寂巡航的流光卫星微粒) ──── */}
          {isViewingToday ? (
            <g
              className="animate-satellite-orbit"
              style={{
                animationDelay: `-${secondOffset}s`,
                transformOrigin: `${cx}px ${cy}px`,
              }}
            >
              {/* Stardust Wake (3 Tapering Trailing Particles along rOrbit=86) */}
              <circle
                cx={cx + rOrbit * Math.sin((-12 * Math.PI) / 180)}
                cy={cy - rOrbit * Math.cos((-12 * Math.PI) / 180)}
                r="1"
                className="fill-brand-500/25 dark:fill-brand-400/30"
              />
              <circle
                cx={cx + rOrbit * Math.sin((-7.5 * Math.PI) / 180)}
                cy={cy - rOrbit * Math.cos((-7.5 * Math.PI) / 180)}
                r="1.5"
                className="fill-brand-500/50 dark:fill-brand-400/60"
              />
              <circle
                cx={cx + rOrbit * Math.sin((-3.5 * Math.PI) / 180)}
                cy={cy - rOrbit * Math.cos((-3.5 * Math.PI) / 180)}
                r="2"
                className="fill-brand-500/80 dark:fill-brand-400/90"
              />

              {/* Luminous Halo Aura */}
              <circle
                cx={cx}
                cy={cy - rOrbit}
                r="5.5"
                className="fill-brand-500/20 dark:fill-brand-400/25 animate-pulse"
              />

              {/* Core Photon: High-Energy Star Particle */}
              <circle
                cx={cx}
                cy={cy - rOrbit}
                r="2.6"
                className="fill-brand-500 dark:fill-brand-300 filter drop-shadow-[0_0_5px_var(--brand-500)]"
              />
              <circle
                cx={cx}
                cy={cy - rOrbit}
                r="1.1"
                className="fill-white dark:fill-white"
              />
            </g>
          ) : lastActiveHour !== null ? (
            /* Docked Photon for Historical Days (Resting at last active note hour) */
            <g
              style={{
                transform: `rotate(${lastActiveHour * 15}deg)`,
                transformOrigin: `${cx}px ${cy}px`,
              }}
            >
              {/* Stationed Beacon Halo */}
              <circle
                cx={cx}
                cy={cy - rOrbit}
                r="4.5"
                className="fill-brand-500/20 dark:fill-brand-400/25"
              />
              {/* Stationed Photon */}
              <circle
                cx={cx}
                cy={cy - rOrbit}
                r="2.4"
                className="fill-brand-500 dark:fill-brand-300 filter drop-shadow-[0_0_4px_var(--brand-500)]"
              />
              <circle
                cx={cx}
                cy={cy - rOrbit}
                r="0.9"
                className="fill-white/90"
              />
            </g>
          ) : null}

          {/* ── 6. Center Hub Display (中央生活与发呆时计) ─────────────────── */}
          {hoveredHour !== null ? (
            /* Hover State: Specific Hour Inspector */
            <g className="transition-all duration-150">
              <text
                x={cx}
                y={cy - 16}
                textAnchor="middle"
                className="text-[9.5px] font-mono font-medium fill-brand-600 dark:fill-brand-400 select-none"
              >
                {`${String(hoveredHour).padStart(2, "0")}:00`}
              </text>
              <text
                x={cx}
                y={cy + 6}
                textAnchor="middle"
                className="text-[19px] font-mono font-bold fill-foreground tracking-tight select-none"
              >
                {hoveredCount > 0 ? `${hoveredCount} 条` : "无记录"}
              </text>
              <text
                x={cx}
                y={cy + 22}
                textAnchor="middle"
                className="text-[9px] font-medium fill-muted-foreground select-none"
              >
                {hoveredSnippet ? `“${hoveredSnippet}”` : "点击查看明细"}
              </text>
            </g>
          ) : (
            /* Default State: Live Clock & Calm Day Atmosphere */
            <g className="transition-all duration-150">
              <text
                x={cx}
                y={cy - 18}
                textAnchor="middle"
                className="text-[9px] font-mono font-medium fill-muted-foreground uppercase tracking-widest select-none"
              >
                {isViewingToday ? "TODAY" : selectedDay.slice(5)}
              </text>
              <text
                x={cx}
                y={cy + 6}
                textAnchor="middle"
                className="text-[23px] font-mono font-bold fill-foreground tracking-tight select-none tabular-nums"
              >
                {isViewingToday ? currentTimeStr : `${totalDayNotes} 篇`}
              </text>
              <text
                x={cx}
                y={cy + 22}
                textAnchor="middle"
                className="text-[9.5px] font-medium fill-brand-600 dark:fill-brand-400 select-none"
              >
                {totalDayNotes > 0 ? `${totalDayNotes} 篇笔记` : "时间静静流淌"}
              </text>
            </g>
          )}
        </svg>
      </button>
    </div>
  );
}
