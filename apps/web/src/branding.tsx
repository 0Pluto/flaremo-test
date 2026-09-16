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

export type BrandingAccent =
  | "flame"
  | "ocean"
  | "indigo"
  | "iris"
  | "jade"
  | "teal"
  | "crimson"
  | "amber";

export type Branding = {
  product: string;
  accent: BrandingAccent;
  markLightUrl: string | null;
  markDarkUrl: string | null;
};

export const DEFAULT_BRANDING: Branding = {
  product: "FlareMo",
  accent: "flame",
  markLightUrl: null,
  markDarkUrl: null,
};

const BrandingContext = createContext<Branding>(DEFAULT_BRANDING);

/** Instance accent presets, mirrored from @flaremo/domain's whitelist. */
export const BRANDING_ACCENTS: BrandingAccent[] = [
  "flame",
  "ocean",
  "indigo",
  "iris",
  "jade",
  "teal",
  "crimson",
  "amber",
];

export function normalizeBrandingAccent(value: unknown): BrandingAccent {
  return BRANDING_ACCENTS.some((preset) => preset === value)
    ? (value as BrandingAccent)
    : DEFAULT_BRANDING.accent;
}

function applyAccentAttribute(accent: BrandingAccent) {
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
export function setAccentAttribute(accent: BrandingAccent) {
  applyAccentAttribute(accent);
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
        accent: normalizeBrandingAccent(info.accent),
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
    applyAccentAttribute(branding.accent);
    setFaviconAccent(branding.accent);
  }, [branding.accent]);

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
