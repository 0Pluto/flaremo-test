import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getPublicBranding } from "@/api";
import { setFaviconAccent } from "@/components/theme-provider";
import { buildCustomRamp, normalizeHexColor } from "@/lib/brand-ramp";

export type BrandingAccent =
  | "flame"
  | "ocean"
  | "indigo"
  | "iris"
  | "jade"
  | "teal"
  | "crimson"
  | "amber"
  | "custom";

export type Branding = {
  product: string;
  accent: BrandingAccent;
  accentHex: string | null;
  markLightUrl: string | null;
  markDarkUrl: string | null;
};

export const DEFAULT_BRANDING: Branding = {
  product: "FlareMo",
  accent: "flame",
  accentHex: null,
  markLightUrl: null,
  markDarkUrl: null,
};

const BrandingContext = createContext<Branding>(DEFAULT_BRANDING);

/** Instance accent presets, mirrored from @flaremo/domain's whitelist. */
export const BRANDING_ACCENTS: Exclude<BrandingAccent, "custom">[] = [
  "flame",
  "ocean",
  "indigo",
  "iris",
  "jade",
  "teal",
  "crimson",
  "amber",
];

/** Swatch order for the admin picker: presets, then the custom seed option. */
export const BRANDING_ACCENT_CHOICES: BrandingAccent[] = [
  ...BRANDING_ACCENTS,
  "custom",
];

export function normalizeBrandingAccent(
  value: unknown,
  hex?: unknown,
): BrandingAccent {
  if (value === "custom") {
    return typeof hex === "string" && normalizeHexColor(hex)
      ? "custom"
      : DEFAULT_BRANDING.accent;
  }
  return BRANDING_ACCENTS.some((preset) => preset === value)
    ? (value as Exclude<BrandingAccent, "custom">)
    : DEFAULT_BRANDING.accent;
}

const CUSTOM_RAMP_VARS = [
  "--brand-50",
  "--brand-100",
  "--brand-200",
  "--brand-300",
  "--brand-400",
  "--brand-500",
  "--brand-600",
  "--brand-700",
  "--brand-coral",
  "--brand-gradient-foreground",
  "--brand-custom-fg-light",
  "--brand-custom-fg-dark",
] as const;

function applyCustomRamp(seedHex: string) {
  const ramp = buildCustomRamp(seedHex);
  const style = document.documentElement.style;
  for (const [step, value] of Object.entries(ramp.steps)) {
    style.setProperty(`--brand-${step}`, value);
  }
  style.setProperty("--brand-coral", ramp.coral);
  style.setProperty("--brand-gradient-foreground", ramp.gradientForeground);
  style.setProperty("--brand-custom-fg-light", ramp.primaryForegroundLight);
  style.setProperty("--brand-custom-fg-dark", ramp.primaryForegroundDark);
}

function clearCustomRamp() {
  const style = document.documentElement.style;
  for (const name of CUSTOM_RAMP_VARS) {
    style.removeProperty(name);
  }
}

function applyAccent(accent: BrandingAccent, accentHex: string | null) {
  if (accent === "custom") {
    const seed = normalizeHexColor(accentHex ?? "");
    if (!seed) {
      applyAccent(DEFAULT_BRANDING.accent, null);
      return;
    }
    document.documentElement.dataset.accent = "custom";
    applyCustomRamp(seed);
    return;
  }
  clearCustomRamp();
  // "flame" is the compiled-in default: no attribute keeps it a one-selector
  // match instead of adding a redundant [data-accent=flame] override block.
  if (accent === DEFAULT_BRANDING.accent) {
    delete document.documentElement.dataset.accent;
  } else {
    document.documentElement.dataset.accent = accent;
  }
}

/**
 * Applies an accent immediately (admin saves, optimistic updates) without
 * waiting for a BrandingProvider refetch; the next branding fetch agrees.
 */
export function setAccentAttribute(accent: BrandingAccent, accentHex?: string) {
  applyAccent(accent, accentHex ?? null);
}

/**
 * Resolves the instance's white-label branding once on mount. Consumers
 * render bundled FlareMo assets immediately and swap to the configured
 * branding when the public endpoint responds, so anonymous pages never gate
 * rendering on this fetch.
 */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);

  useEffect(() => {
    let cancelled = false;
    void getPublicBranding().then((info) => {
      if (cancelled || !info) return;
      setBranding({
        product: info.product,
        accent: normalizeBrandingAccent(info.accent, info.accent_hex),
        accentHex: info.accent_hex ?? null,
        markLightUrl: info.mark_light_url,
        markDarkUrl: info.mark_dark_url,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (branding.product !== DEFAULT_BRANDING.product) {
      document.title = branding.product;
    }
  }, [branding.product]);

  useEffect(() => {
    applyAccent(branding.accent, branding.accentHex);
    // No prerendered mark exists for arbitrary seeds: a custom accent keeps
    // the bundled flame favicon rather than a broken /brand/custom/ URL.
    setFaviconAccent(branding.accent === "custom" ? "flame" : branding.accent);
  }, [branding.accent, branding.accentHex]);

  const value = useMemo(() => branding, [branding]);
  return (
    <BrandingContext.Provider value={value}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  return useContext(BrandingContext);
}
