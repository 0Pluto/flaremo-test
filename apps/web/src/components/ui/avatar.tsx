import { type HTMLAttributes, useState } from "react";
import { cn } from "@/lib/utils";

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  name?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}

const SIZE_CLASSES = {
  xs: "size-5 text-[10px]",
  sm: "size-6 text-xs",
  md: "size-8 text-sm",
  lg: "size-12 text-base",
  xl: "size-16 text-xl",
};

const PALETTES = [
  "from-amber-500 to-orange-600",
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-purple-500 to-pink-600",
  "from-rose-500 to-red-600",
  "from-cyan-500 to-sky-600",
];

function getInitial(name?: string | null): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  // Handle UTF-16 surrogate pairs / code points cleanly
  const firstChar = Array.from(trimmed)[0];
  return firstChar ? firstChar.toUpperCase() : "?";
}

function getPaletteIndex(name?: string | null): number {
  if (!name) return 0;
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % PALETTES.length;
}

export function Avatar({
  src,
  name,
  size = "md",
  className,
  ...props
}: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const showImage = Boolean(src && !imgError);
  const initial = getInitial(name);
  const palette = PALETTES[getPaletteIndex(name)];

  return (
    <div
      aria-label={name ?? "Avatar"}
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-medium text-white shadow-xs transition-colors",
        SIZE_CLASSES[size],
        !showImage && cn("bg-gradient-to-br", palette),
        className,
      )}
      role="img"
      {...props}
    >
      {showImage ? (
        <img
          alt={name ?? "Avatar"}
          className="size-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          src={src ?? undefined}
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="leading-none">{initial}</span>
      )}
    </div>
  );
}
