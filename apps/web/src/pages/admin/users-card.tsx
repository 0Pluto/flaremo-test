import { useQuery } from "@tanstack/react-query";
import {
  CrownIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UserCogIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  type AdminUser,
  getCurrentFlareMoUser,
  listAdminUsers,
  requestAdminPasswordReset,
} from "@/api";
import { InfoTip } from "@/components/info-tip";
import { SecretRevealDialog } from "@/components/secret-reveal-dialog";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/lib/error";
import {
  getReaderStatus,
  readerExpiryBase,
  useAdminUserMutations,
} from "./use-admin-users";

export function AdminPanel() {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [memberSearch, setMemberSearch] = useState("");

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: listAdminUsers,
    retry: false,
  });
  const meQuery = useQuery({
    // Same key as the account page's viewer cache so both views invalidate
    // together after a role change.
    queryKey: ["current-flaremo-user"],
    queryFn: getCurrentFlareMoUser,
  });
  // The role matrix the server enforces: only the team owner changes roles,
  // and only the owner resets another administrator's password or removes one.
  const isTeamOwner = meQuery.data?.role === "owner";
  const isTeamAdmin = isTeamOwner || meQuery.data?.role === "admin";

  const {
    createUserMutation,
    deleteUserMutation,
    updateRoleMutation,
    setReaderMutation,
    revokeReaderMutation,
  } = useAdminUserMutations();

  const handleCreateUser = async () => {
    setCreateError(null);
    try {
      const result = await createUserMutation.mutateAsync({
        name: name.trim(),
        email: email.trim(),
      });
      setName("");
      setEmail("");
      setCreatedLink(`${window.location.origin}${result.activation_path}`);
      setCopied(false);
      setCreateOpen(false);
    } catch (error) {
      setCreateError(errorMessage(error, t("admin.userCreateFailed")));
    }
  };

  // Row-action failures surface as toasts: the create dialog's error slot is
  // only rendered while that dialog is open, so writing row failures there
  // made them invisible.
  const handleDeleteUser = async (user: AdminUser) => {
    try {
      await deleteUserMutation.mutateAsync(user.id);
    } catch (error) {
      toast.error(errorMessage(error, t("admin.userDeleteFailed")));
    }
  };

  const handleResetPassword = async (user: AdminUser) => {
    try {
      const result = await requestAdminPasswordReset(user.id);
      const base = window.location.origin;
      setResetLink(`${base}${result.reset_path}`);
      setCopied(false);
    } catch (error) {
      toast.error(errorMessage(error, t("admin.resetFailed")));
    }
  };

  const handleUpdateRole = async (user: AdminUser) => {
    if (!isTeamOwner) return;
    try {
      await updateRoleMutation.mutateAsync({
        id: user.id,
        role: user.role === "admin" ? "member" : "admin",
      });
    } catch (error) {
      toast.error(errorMessage(error, t("admin.roleUpdateFailed")));
    }
  };

  const handleSetReader = async (user: AdminUser, days: number) => {
    try {
      await setReaderMutation.mutateAsync({
        id: user.id,
        expiresAt: new Date(
          readerExpiryBase(user) + days * 86_400_000,
        ).toISOString(),
      });
    } catch (error) {
      toast.error(errorMessage(error, t("admin.readerSetFailed")));
    }
  };

  const handleRevokeReader = async (user: AdminUser) => {
    try {
      await revokeReaderMutation.mutateAsync(user.id);
    } catch (error) {
      toast.error(errorMessage(error, t("admin.readerRevokeFailed")));
    }
  };

  const handleCopyResetLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      toast.error(t("admin.resetCopyFailed"));
    }
  };

  const allUsers = useMemo(
    () => usersQuery.data?.users ?? [],
    [usersQuery.data?.users],
  );

  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return allUsers;
    const q = memberSearch.trim().toLowerCase();
    return allUsers.filter((user) => {
      return (
        user.name?.toLowerCase().includes(q) ||
        user.email?.toLowerCase().includes(q) ||
        user.username?.toLowerCase().includes(q)
      );
    });
  }, [allUsers, memberSearch]);

  return (
    <div className="flex flex-col gap-5">
      {/* Header: Title with member count & Add button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            {t("admin.usersTitle")}
          </h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {allUsers.length}
          </span>
        </div>
        {isTeamAdmin && (
          <Button
            size="sm"
            type="button"
            onClick={() => {
              setCreateError(null);
              setCreatedLink(null);
              setCreateOpen(true);
            }}
            className="cursor-pointer"
          >
            <PlusIcon data-icon="inline-start" />
            {t("admin.createUser")}
          </Button>
        )}
      </div>

      {/* Lightweight search input: visible if there are more than 3 members or already searching */}
      {(allUsers.length > 3 || memberSearch) && (
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={t("admin.memberSearchPlaceholder")}
            className="h-9 pl-9 pr-8 text-xs bg-muted/20 border-border/50 hover:border-border/80 focus:bg-background transition-colors"
            placeholder={t("admin.memberSearchPlaceholder")}
            value={memberSearch}
            onChange={(event) => setMemberSearch(event.target.value)}
          />
          {memberSearch && (
            <button
              type="button"
              onClick={() => setMemberSearch("")}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer p-0.5"
            >
              <XIcon className="size-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Grouped Member List */}
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card divide-y divide-border/40 shadow-2xs">
        {usersQuery.isLoading && (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        )}

        {usersQuery.isError && (
          <p className="p-4 text-xs text-destructive">
            {t("admin.usersLoadFailed")}
          </p>
        )}

        {usersQuery.data &&
          filteredMembers.map((user) => {
            const readerStatus = getReaderStatus(user);
            const isSelf = meQuery.data?.id === user.id;

            return (
              <div
                key={user.id}
                className="flex items-center justify-between gap-3 px-3.5 py-3 transition-colors hover:bg-accent/30"
              >
                {/* Left: Avatar & Identity */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {(user.name || user.username || "?")
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-medium text-foreground">
                        {user.name || user.username}
                      </span>
                      {isSelf && (
                        <span className="rounded bg-primary/10 px-1 py-0.5 text-xs font-normal text-primary">
                          {t("admin.selfBadge")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground truncate mt-0.5">
                      <span>@{user.username}</span>
                      <span>·</span>
                      <span className="truncate">{user.email}</span>
                    </div>
                  </div>
                </div>

                {/* Right: Role & Status & Actions */}
                <div className="flex shrink-0 items-center gap-2">
                  {user.role === "owner" ? (
                    <Badge
                      variant="secondary"
                      className="gap-1 border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium text-xs"
                    >
                      <CrownIcon className="size-3" />
                      <span>{t("admin.role.owner")}</span>
                    </Badge>
                  ) : user.role === "admin" ? (
                    <Badge
                      variant="secondary"
                      className="gap-1 border-primary/20 bg-primary/10 text-primary font-medium text-xs"
                    >
                      <ShieldCheckIcon className="size-3" />
                      <span>{t("admin.role.admin")}</span>
                    </Badge>
                  ) : user.role === "reader" ? (
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant="secondary"
                        className="gap-1 border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium text-xs"
                      >
                        <EyeIcon className="size-3" />
                        <span>{t("admin.role.reader")}</span>
                      </Badge>
                      {readerStatus &&
                        (readerStatus.expired ? (
                          <Badge
                            variant="destructive"
                            className="h-5 px-1.5 text-xs"
                          >
                            {t("admin.expired")}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground hidden sm:inline">
                            {t("admin.daysLeft", {
                              days: String(readerStatus.days),
                            })}
                          </span>
                        ))}
                    </div>
                  ) : (
                    <Badge
                      variant="outline"
                      className="gap-1 text-muted-foreground font-normal text-xs"
                    >
                      <UserIcon className="size-3" />
                      <span>{t("admin.role.member")}</span>
                    </Badge>
                  )}

                  {/* Actions Dropdown */}
                  {user.role !== "owner" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            aria-label={t("admin.memberActions")}
                            size="icon-sm"
                            type="button"
                            variant="ghost"
                            className="size-7 text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            <MoreHorizontalIcon className="size-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        {isTeamOwner && (
                          <DropdownMenuItem
                            onClick={() => void handleUpdateRole(user)}
                          >
                            <UserCogIcon />
                            {user.role === "admin"
                              ? t("admin.makeMember")
                              : t("admin.makeAdmin")}
                          </DropdownMenuItem>
                        )}
                        {(user.role === "member" ||
                          user.role === "reader" ||
                          user.role === null) && (
                          <>
                            <DropdownMenuItem
                              onClick={() => void handleSetReader(user, 30)}
                            >
                              <EyeIcon />
                              {user.role === "reader"
                                ? t("admin.renewReader30")
                                : t("admin.makeReader30")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => void handleSetReader(user, 365)}
                            >
                              <EyeIcon />
                              {user.role === "reader"
                                ? t("admin.renewReader365")
                                : t("admin.makeReader365")}
                            </DropdownMenuItem>
                          </>
                        )}
                        {user.role === "reader" && (
                          <DropdownMenuItem
                            onClick={() => void handleRevokeReader(user)}
                          >
                            <EyeOffIcon />
                            {t("admin.revokeReader")}
                          </DropdownMenuItem>
                        )}
                        {(isTeamOwner || user.role === "member") && (
                          <DropdownMenuItem
                            onClick={() => void handleResetPassword(user)}
                          >
                            <KeyRoundIcon />
                            {t("admin.resetPassword")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleteTarget(user)}
                        >
                          <Trash2Icon />
                          {t("admin.deleteUser")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })}

        {/* Empty state when searching */}
        {usersQuery.data && filteredMembers.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <UsersIcon className="size-7 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">
              {t("admin.memberSearchEmpty")}
            </p>
            {memberSearch && (
              <Button
                size="xs"
                variant="outline"
                onClick={() => setMemberSearch("")}
                className="cursor-pointer"
              >
                {t("admin.clearFilters")}
              </Button>
            )}
          </div>
        )}
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.deleteUser")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("admin.deleteConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="ghost">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteTarget) void handleDeleteUser(deleteTarget);
              }}
            >
              {t("admin.deleteUser")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.createUser")}</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreateUser();
            }}
          >
            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="admin-name"
            >
              {t("auth.displayName")}
              <Input
                autoFocus
                autoComplete="off"
                disabled={createUserMutation.isPending}
                id="admin-name"
                maxLength={80}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="admin-email"
            >
              {t("auth.email")}
              <Input
                autoComplete="off"
                disabled={createUserMutation.isPending}
                id="admin-email"
                maxLength={320}
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <p className="flex items-center gap-1 text-xs leading-5 text-muted-foreground">
              <InfoTip text={t("admin.activationDescription")} />
              <span className="sr-only">
                {t("admin.activationDescription")}
              </span>
            </p>
            {createError && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
                {createError}
              </p>
            )}
            <DialogFooter>
              <Button
                disabled={createUserMutation.isPending}
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button disabled={createUserMutation.isPending} type="submit">
                {createUserMutation.isPending && (
                  <Loader2Icon
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                )}
                {createUserMutation.isPending
                  ? t("admin.creatingUser")
                  : t("admin.createUser")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <SecretRevealDialog
        closeLabelKey="common.close"
        copied={copied}
        copyLabelKey="admin.copyResetLink"
        description={t("admin.activationDescription")}
        onCopy={() => {
          if (createdLink) void handleCopyResetLink(createdLink);
        }}
        onOpenChange={(open) => {
          if (!open) setCreatedLink(null);
        }}
        open={createdLink !== null}
        t={t}
        titleKey="admin.userCreatedTitle"
        value={createdLink ?? ""}
      />

      <SecretRevealDialog
        closeLabelKey="admin.hideResetLink"
        copied={copied}
        copyLabelKey="admin.copyResetLink"
        description={t("admin.resetLinkDescription")}
        onCopy={() => {
          if (resetLink) void handleCopyResetLink(resetLink);
        }}
        onOpenChange={(open) => {
          if (!open) setResetLink(null);
        }}
        open={resetLink !== null}
        t={t}
        titleKey="admin.resetLinkTitle"
        value={resetLink ?? ""}
      />
    </div>
  );
}
