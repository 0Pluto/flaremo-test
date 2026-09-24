import { BrainIcon, EyeIcon, PanelLeftOpenIcon, PlusIcon } from "lucide-react";
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
  onOpenLens,
  onNewMemory,
  isScrolled = false,
}: {
  explorer: WorkspaceSidebarContent;
  mobileSheetOpen: boolean;
  setMobileSheetOpen: (open: boolean) => void;
  sidebarCollapsed: boolean;
  toggleSidebarCollapsed: () => void;
  onOpenLens: () => void;
  onNewMemory: () => void;
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

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={onOpenLens}
          >
            <EyeIcon className="size-3.5" data-icon="inline-start" />
            <span className="hidden sm:inline">{t("memory.viewLens")}</span>
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 px-3 text-xs"
            onClick={onNewMemory}
          >
            <PlusIcon className="size-3.5" data-icon="inline-start" />
            <span>{t("memory.newMemory")}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
