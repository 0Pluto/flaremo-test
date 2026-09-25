import {
  BrainIcon,
  EyeIcon,
  PanelLeftOpenIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkspaceSidebarContent } from "@/components/workspace/workspace-sidebar";
import { WorkspaceMobileSidebar } from "@/components/workspace/workspace-sidebar";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

export function MemoryWorkspaceHeader({
  explorer,
  mobileSheetOpen,
  setMobileSheetOpen,
  sidebarCollapsed,
  toggleSidebarCollapsed,
  query,
  onQueryChange,
  onOpenLens,
  isScrolled = false,
}: {
  explorer: WorkspaceSidebarContent;
  mobileSheetOpen: boolean;
  setMobileSheetOpen: (open: boolean) => void;
  sidebarCollapsed: boolean;
  toggleSidebarCollapsed: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  onOpenLens: () => void;
  isScrolled?: boolean;
}) {
  const { t } = useI18n();

  return (
    <header
      className={cn(
        "z-20 shrink-0 border-b bg-background/90 backdrop-blur-md motion-safe:transition-[border-color,box-shadow] motion-safe:duration-200",
        isScrolled ? "border-border shadow-xs" : "border-transparent",
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center gap-2 px-5 lg:px-3 motion-safe:transition-[max-width,padding] motion-safe:duration-250 motion-safe:ease-signal",
          sidebarCollapsed && "mx-auto w-full max-w-[640px]",
        )}
      >
        <div
          className={cn(
            "hidden lg:flex items-center overflow-hidden motion-safe:transition-[width,opacity,margin] motion-safe:duration-250 motion-safe:ease-signal",
            sidebarCollapsed
              ? "w-8 opacity-100"
              : "w-0 opacity-0 pointer-events-none -mr-2",
          )}
        >
          <Button
            aria-label={t("sidebar.expand")}
            size="icon-sm"
            title={t("sidebar.expand")}
            variant="ghost"
            onClick={toggleSidebarCollapsed}
          >
            <PanelLeftOpenIcon />
          </Button>
        </div>

        <WorkspaceMobileSidebar
          explorer={explorer}
          open={mobileSheetOpen}
          onOpenChange={setMobileSheetOpen}
        />

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex items-center gap-1.5 px-1">
            <BrainIcon className="size-4 shrink-0 text-brand-500" />
            <h1 className="font-semibold text-sm sm:text-base leading-none">
              {t("memory.title")}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="group flex h-8.5 w-36 sm:w-52 md:w-60 items-center rounded-lg border border-border/60 bg-muted/40 px-2.5 text-xs text-muted-foreground transition-all hover:border-border hover:bg-accent/60 hover:text-foreground shadow-2xs focus-within:border-brand-500/80 focus-within:ring-2 focus-within:ring-brand-500/15 focus-within:bg-background">
            <SearchIcon className="size-3.5 shrink-0 text-muted-foreground group-focus-within:text-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={t("memory.searchPlaceholder")}
              className="ml-2 w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                className="ml-1 rounded p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                title={t("search.clear")}
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>

          <Button
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground hover:text-foreground"
            onClick={onOpenLens}
            title={t("memory.viewLens")}
          >
            <EyeIcon className="size-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
