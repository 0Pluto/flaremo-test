import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArchiveIcon,
  CheckIcon,
  CornerUpLeftIcon,
  MoreHorizontalIcon,
  NotebookPenIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  archiveMemory,
  confirmMemory,
  deleteMemory,
  type Memory,
  pinMemory,
  promoteMemoryToMemo,
  resolveProposal,
  restoreMemory,
  unpinMemory,
} from "@/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/lib/error";
import { stripResourceName } from "@/lib/utils";
import { MemoryFormDialog } from "./memory-form-dialog";
import { MemoryRevisions } from "./memory-revisions";

export function MemoryCard({
  memory,
  showSource,
  review,
  onMutated,
}: {
  memory: Memory;
  showSource: boolean;
  review: boolean;
  onMutated: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showRevisions, setShowRevisions] = useState(false);

  const confirmMutation = useMutation({
    mutationFn: () => {
      if (memory.needs_review || memory.verification === "inferred") {
        return resolveProposal(stripResourceName(memory.id, "memories"), {
          action: "accept",
        });
      }
      return confirmMemory(stripResourceName(memory.id, "memories"));
    },
    onSuccess: () => {
      toast.success(t("toast.memoryConfirmed"));
      onMutated();
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("toast.memoryConfirmFailed"))),
  });

  const rejectMutation = useMutation({
    mutationFn: () =>
      resolveProposal(stripResourceName(memory.id, "memories"), {
        action: "reject",
        rejection_reason: "user_rejected_in_inbox",
      }),
    onSuccess: () => {
      toast.success(t("toast.memoryRejected"));
      onMutated();
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("toast.memoryRejectFailed"))),
  });

  const pinMutation = useMutation({
    mutationFn: () => pinMemory(stripResourceName(memory.id, "memories")),
    onSuccess: () => {
      toast.success(t("toast.memoryLocked"));
      onMutated();
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("toast.memoryLockFailed"))),
  });

  const unpinMutation = useMutation({
    mutationFn: () => unpinMemory(stripResourceName(memory.id, "memories")),
    onSuccess: () => {
      toast.success(t("toast.memoryUnlocked"));
      onMutated();
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("toast.memoryUnlockFailed"))),
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveMemory(stripResourceName(memory.id, "memories")),
    onSuccess: () => {
      toast.success(t("toast.memoryArchived"));
      onMutated();
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("toast.memoryArchiveFailed"))),
  });

  const restoreMutation = useMutation({
    mutationFn: () => restoreMemory(stripResourceName(memory.id, "memories")),
    onSuccess: () => {
      toast.success(t("toast.memoryRestored"));
      onMutated();
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("toast.memoryRestoreFailed"))),
  });

  const promoteMutation = useMutation({
    mutationFn: () =>
      promoteMemoryToMemo(stripResourceName(memory.id, "memories")),
    onSuccess: () => {
      toast.success(t("toast.saved"));
      onMutated();
      void queryClient.invalidateQueries({ queryKey: ["memos"] });
      void queryClient.invalidateQueries({ queryKey: ["memo-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["tag-hierarchy"] });
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("toast.memoryPromoteFailed"))),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteMemory(stripResourceName(memory.id, "memories")),
    onSuccess: () => {
      toast.success(t("toast.memoryDeleted"));
      onMutated();
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("toast.memoryDeleteFailed"))),
  });

  const id = stripResourceName(memory.id, "memories");

  // Authority Badge Label (Natural language dictionary §III)
  const authorityBadge = (() => {
    switch (memory.verification) {
      case "locked":
        return { label: t("memory.pinned"), variant: "default" as const };
      case "confirmed":
        return { label: t("memory.confirmedBadge"), variant: "brand" as const };
      case "observed":
        return {
          label: t("memory.observedBadge"),
          variant: "secondary" as const,
        };
      case "inferred":
        return {
          label: t("memory.inferredBadge"),
          variant: "outline" as const,
        };
      default:
        return { label: memory.verification, variant: "outline" as const };
    }
  })();

  // Status Indicator
  const statusIndicator = (() => {
    if (memory.status === "superseded") {
      return (
        <span className="flex items-center gap-1 text-xs text-amber-500">
          <span className="inline-block size-1.5 rounded-full bg-amber-500" />
          {t("memory.status.supersededShort")}
        </span>
      );
    }
    if (memory.status === "archived") {
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="inline-block size-1.5 rounded-full bg-muted-foreground" />
          {t("memory.status.archivedShort")}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-500">
        <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
        {t("memory.status.current")}
      </span>
    );
  })();

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm whitespace-pre-wrap">{memory.content}</p>
          <div className="shrink-0">{statusIndicator}</div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={authorityBadge.variant}>{authorityBadge.label}</Badge>

          {/* Non-hierarchical topic tags without '#' (§III) */}
          {Array.isArray(memory.tags) &&
            memory.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}

          <Badge variant="outline">{t(`memory.type.${memory.type}`)}</Badge>
          <Badge variant="outline">{t(`memory.kind.${memory.kind}`)}</Badge>
          <Badge variant="secondary">
            {t(`memory.scope.${memory.scope_type}`)}
          </Badge>
          {memory.tier === "core" && <Badge>{t("memory.tier.core")}</Badge>}

          {showSource && memory.source_agent && (
            <span className="text-xs text-muted-foreground">
              {t("memory.sourceAgent")}: {memory.source_agent}
            </span>
          )}
          {review && memory.review_reason && (
            <span className="text-xs text-amber-500 font-medium">
              {t("memory.pendingDecision")} ({memory.review_reason})
            </span>
          )}
        </div>

        {/* Evidence preview line (§V.2) */}
        {memory.evidence && memory.evidence.length > 0 && (
          <div className="text-xs text-muted-foreground flex items-center gap-1 border-t pt-2">
            <span>{t("memory.evidenceLabel")}:</span>
            <span className="truncate max-w-[400px]">
              {memory.evidence[0].excerpt ||
                `${t("memory.evidenceFrom")} ${memory.evidence[0].source_type}`}
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {review || memory.needs_review ? (
            <>
              <Button
                size="sm"
                variant="default"
                onClick={() => confirmMutation.mutate()}
                disabled={confirmMutation.isPending}
              >
                <CheckIcon data-icon="inline-start" />
                {t("memory.acceptProposal")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => rejectMutation.mutate()}
                disabled={rejectMutation.isPending}
              >
                <XIcon data-icon="inline-start" />
                {t("memory.rejectProposal")}
              </Button>
            </>
          ) : (
            <>
              {memory.verification !== "locked" &&
                memory.verification !== "confirmed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => confirmMutation.mutate()}
                  >
                    <CheckIcon data-icon="inline-start" />
                    {t("memory.confirm")}
                  </Button>
                )}
              {memory.verification === "locked" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => unpinMutation.mutate()}
                >
                  <PinOffIcon data-icon="inline-start" />
                  {t("memory.unpin")}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => pinMutation.mutate()}
                >
                  <PinIcon data-icon="inline-start" />
                  {t("memory.pin")}
                </Button>
              )}
              {memory.status === "active" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => archiveMutation.mutate()}
                >
                  <ArchiveIcon data-icon="inline-start" />
                  {t("memory.archive")}
                </Button>
              )}
              {memory.status === "archived" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => restoreMutation.mutate()}
                >
                  <CornerUpLeftIcon data-icon="inline-start" />
                  {t("memory.restore")}
                </Button>
              )}
            </>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label={t("common.actions")}
                  className="ml-auto"
                  size="icon-sm"
                  variant="ghost"
                >
                  <MoreHorizontalIcon />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditing(true)}>
                <PencilIcon />
                {t("common.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowRevisions((value) => !value)}
              >
                {t("memory.revisions")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => promoteMutation.mutate()}>
                <NotebookPenIcon />
                {t("memory.toMemo")}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2Icon />
                {t("common.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {showRevisions && <MemoryRevisions memoryId={id} />}

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("memory.deleteConfirm")}</AlertDialogTitle>
              <AlertDialogDescription>
                {memory.content.slice(0, 80)}
                {memory.content.length > 80 ? "…" : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel variant="ghost">
                {t("common.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => deleteMutation.mutate()}
              >
                {t("common.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <MemoryFormDialog
          key={[
            memory.id,
            memory.content,
            memory.type,
            memory.kind,
            memory.scope_type,
            memory.scope_key ?? "",
            memory.importance,
          ].join("|")}
          memory={memory}
          open={editing}
          onOpenChange={setEditing}
          onSaved={onMutated}
        />
      </CardContent>
    </Card>
  );
}
