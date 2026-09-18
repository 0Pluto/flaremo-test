import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EyeIcon,
  EyeOffIcon,
  ImageUpIcon,
  KeyRoundIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  UserCogIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  type AdminBranding,
  type AdminUser,
  type BrandingMarkVariant,
  clearAdminBrandingMark,
  createAdminUser,
  deleteAdminUser,
  getAdminBranding,
  getCurrentFlareMoUser,
  listAdminUsers,
  requestAdminPasswordReset,
  revokeAdminUserReader,
  setAdminUserReader,
  updateAdminBrandingAccent,
  updateAdminBrandingProductName,
  updateAdminUserRole,
  uploadAdminBrandingMark,
} from "@/api";
import {
  BRANDING_ACCENT_CHOICES,
  type BrandingAccent,
  setAccentAttribute,
} from "@/branding";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { TranslationKey } from "@/i18n/key";
import { normalizeHexColor } from "@/lib/brand-ramp";
import { errorMessage } from "@/lib/error";

export function AdminPanel() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);

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

  const createUserMutation = useMutation({
    mutationFn: createAdminUser,
    onSuccess: () => {
      setName("");
      setEmail("");
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
  const deleteUserMutation = useMutation({
    mutationFn: deleteAdminUser,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: "admin" | "member" }) =>
      updateAdminUserRole(id, role),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({
        queryKey: ["current-flaremo-user"],
      });
    },
  });
  const setReaderMutation = useMutation({
    mutationFn: ({ id, expiresAt }: { id: string; expiresAt: string | null }) =>
      setAdminUserReader(id, expiresAt),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({
        queryKey: ["current-flaremo-user"],
      });
    },
  });
  const revokeReaderMutation = useMutation({
    mutationFn: (id: string) => revokeAdminUserReader(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      void queryClient.invalidateQueries({
        queryKey: ["current-flaremo-user"],
      });
    },
  });

  const handleCreateUser = async () => {
    setCreateError(null);
    try {
      const result = await createUserMutation.mutateAsync({
        name: name.trim(),
        email: email.trim(),
      });
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

  // Renewal extends from max(now, current expiry) so topping up an active
  // seat never discards the days already paid for.
  const readerExpiryBase = (user: AdminUser): number => {
    const current = user.reader_expires_at
      ? new Date(user.reader_expires_at).getTime()
      : Number.NaN;
    return Number.isNaN(current) ? Date.now() : Math.max(Date.now(), current);
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

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("admin.usersTitle")}</CardTitle>
          <Button
            size="sm"
            type="button"
            onClick={() => {
              setCreateError(null);
              setCreatedLink(null);
              setCreateOpen(true);
            }}
          >
            <PlusIcon data-icon="inline-start" />
            {t("admin.createUser")}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="border-t pt-4">
            {usersQuery.isLoading && (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            )}
            {usersQuery.isError && (
              <p className="text-sm text-destructive">
                {t("admin.usersLoadFailed")}
              </p>
            )}
            {usersQuery.data && (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {t("admin.userCount", {
                      count: String(
                        filterMembers(usersQuery.data.users, memberSearch)
                          .length,
                      ),
                    })}
                  </p>
                  <div className="relative w-full max-w-64">
                    <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      aria-label={t("admin.memberSearchPlaceholder")}
                      className="h-8 pl-8"
                      placeholder={t("admin.memberSearchPlaceholder")}
                      value={memberSearch}
                      onChange={(event) => {
                        setMemberSearch(event.target.value);
                        setVisibleCount(MEMBER_PAGE_SIZE);
                      }}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {filterMembers(usersQuery.data.users, memberSearch)
                    .slice(0, visibleCount)
                    .map((user) => (
                      <div
                        key={user.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-3"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-medium">
                              {user.name}
                            </p>
                            <Badge variant="secondary">@{user.username}</Badge>
                            <Badge
                              variant={
                                user.role !== "member" ? "default" : "outline"
                              }
                            >
                              {user.role === "owner"
                                ? t("admin.role.owner")
                                : user.role === "admin"
                                  ? t("admin.role.admin")
                                  : user.role === "reader"
                                    ? t("admin.role.reader")
                                    : t("admin.role.member")}
                            </Badge>
                          </div>
                          {user.role === "reader" && user.reader_expires_at && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {t("admin.readerExpiry", {
                                date: formatDate(user.reader_expires_at),
                              })}
                            </p>
                          )}
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {user.email}
                          </p>
                        </div>
                        {user.role !== "owner" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button
                                  aria-label={t("admin.memberActions")}
                                  size="icon-sm"
                                  type="button"
                                  variant="ghost"
                                >
                                  <MoreHorizontalIcon />
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
                                    onClick={() =>
                                      void handleSetReader(user, 30)
                                    }
                                  >
                                    <EyeIcon />
                                    {user.role === "reader"
                                      ? t("admin.renewReader30")
                                      : t("admin.makeReader30")}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      void handleSetReader(user, 365)
                                    }
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
                    ))}
                  {filterMembers(usersQuery.data.users, memberSearch).length ===
                    0 && (
                    <p className="text-sm text-muted-foreground">
                      {t("admin.memberSearchEmpty")}
                    </p>
                  )}
                </div>
                {filterMembers(usersQuery.data.users, memberSearch).length >
                  visibleCount && (
                  <Button
                    className="mt-3"
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setVisibleCount((count) => count + MEMBER_PAGE_SIZE)
                    }
                  >
                    {t("admin.showMore")}
                  </Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

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

const ACCEPTED_MARK_TYPES = "image/png,image/webp,image/svg+xml";
const MEMBER_PAGE_SIZE = 20;

/** Swatch dots are fixed hex so the palette reads the same in any theme. */
const ACCENT_SWATCH_HEX: Record<Exclude<BrandingAccent, "custom">, string> = {
  flame: "#ff6a00",
  ocean: "#0090ff",
  indigo: "#3e63dd",
  iris: "#5b5bd6",
  jade: "#29a383",
  teal: "#12a594",
  crimson: "#e93d82",
  amber: "#ffc53d",
};

function accentSummaryLabel(
  accent: string | null | undefined,
  accentHex: string | null | undefined,
  t: (key: TranslationKey) => string,
): string {
  if (accent === "custom") {
    const base = t("admin.branding.accentCustom");
    return accentHex ? `${base} · ${accentHex}` : base;
  }
  const preset = accent ?? "flame";
  return t(`admin.branding.accent_${preset}` as TranslationKey);
}

function AccentPicker({
  value,
  customHex,
  disabled,
  onSelect,
}: {
  value: string;
  customHex: string | null;
  disabled: boolean;
  onSelect: (accent: BrandingAccent) => void;
}) {
  const { t } = useI18n();
  const isCustom = value === "custom";
  return (
    <fieldset
      aria-label={t("admin.branding.accent")}
      className="flex flex-wrap gap-2 border-0 p-0"
    >
      {BRANDING_ACCENT_CHOICES.map((accent) => {
        if (accent === "custom") {
          return (
            <button
              key={accent}
              aria-label={t("admin.branding.accentCustom")}
              aria-pressed={isCustom}
              className="size-6 shrink-0 rounded-full border transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 data-[active=true]:ring-[2px] data-[active=true]:ring-ring data-[active=true]:ring-offset-2 data-[active=true]:ring-offset-background"
              data-active={isCustom}
              disabled={disabled}
              style={{
                background:
                  isCustom && customHex
                    ? customHex
                    : "conic-gradient(from 140deg, #f43f5e, #f97316, #facc15, #4ade80, #22d3ee, #818cf8, #e879f9, #f43f5e)",
              }}
              title={t("admin.branding.accentCustom")}
              type="button"
              onClick={() => onSelect(accent)}
            />
          );
        }
        const active = accent === value;
        return (
          <button
            key={accent}
            aria-label={t(`admin.branding.accent_${accent}`)}
            aria-pressed={active}
            className="size-6 shrink-0 rounded-full border transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 data-[active=true]:ring-[2px] data-[active=true]:ring-ring data-[active=true]:ring-offset-2 data-[active=true]:ring-offset-background"
            data-active={active}
            disabled={disabled}
            style={{ backgroundColor: ACCENT_SWATCH_HEX[accent] }}
            title={t(`admin.branding.accent_${accent}`)}
            type="button"
            onClick={() => onSelect(accent)}
          />
        );
      })}
    </fieldset>
  );
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function filterMembers(users: AdminUser[], search: string): AdminUser[] {
  const query = search.trim().toLowerCase();
  if (!query) return users;
  return users.filter((user) =>
    [user.name, user.email, user.username].some((value) =>
      value?.toLowerCase().includes(query),
    ),
  );
}

/**
 * Seed-color editor for the custom accent. Any valid 6-digit hex applies to
 * the whole page instantly (the derived ramp paints live); the PUT is
 * debounced, and closing the dialog flushes a valid unsaved draft.
 */
function CustomAccentDialog({
  draft,
  onDraftChange,
  onOpenChange,
  onSave,
  open,
}: {
  draft: string;
  onDraftChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSave: (hex: string) => Promise<unknown>;
  open: boolean;
}) {
  const { t } = useI18n();
  const lastSavedRef = useRef<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  useEffect(() => {
    if (!open) return undefined;
    const hex = normalizeHexColor(draft);
    if (!hex) return undefined;
    // Live preview beats the network: repaint the whole page immediately,
    // persist on a debounce so typing never floods the API.
    setAccentAttribute("custom", hex);
    if (hex === lastSavedRef.current) return undefined;
    const timer = setTimeout(() => {
      lastSavedRef.current = hex;
      void saveRef.current(hex);
    }, 600);
    return () => clearTimeout(timer);
  }, [draft, open]);

  const flush = () => {
    const hex = normalizeHexColor(draftRef.current);
    if (hex && hex !== lastSavedRef.current) {
      lastSavedRef.current = hex;
      void onSave(hex);
    }
  };

  const valid = normalizeHexColor(draft);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) flush();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("admin.branding.accentCustom")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <input
              aria-label={t("admin.branding.accentPick")}
              className="size-12 shrink-0 cursor-pointer rounded-lg border bg-transparent p-1"
              type="color"
              value={valid ?? "#ff6a00"}
              onChange={(event) => onDraftChange(event.target.value)}
            />
            <Input
              aria-label={t("admin.branding.accentHex")}
              autoComplete="off"
              className="font-mono"
              placeholder="#7c3aed"
              spellCheck={false}
              value={draft}
              aria-invalid={draft.length > 0 && !valid}
              onChange={(event) => onDraftChange(event.target.value)}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            {valid
              ? t("admin.branding.accentHint")
              : t("admin.branding.accentHexHint")}
          </p>
        </div>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BrandingCard() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const [productName, setProductName] = useState("");
  const lightInputRef = useRef<HTMLInputElement>(null);
  const darkInputRef = useRef<HTMLInputElement>(null);

  const brandingQuery = useQuery({
    queryKey: ["admin-branding"],
    queryFn: getAdminBranding,
    retry: false,
  });

  useEffect(() => {
    if (brandingQuery.data) {
      setProductName(brandingQuery.data.product_name ?? "");
    }
  }, [brandingQuery.data]);

  const saveNameMutation = useMutation({
    mutationFn: () =>
      updateAdminBrandingProductName(productName.trim() || null),
    onSuccess: () => {
      toast.success(t("admin.branding.saved"));
      void queryClient.invalidateQueries({ queryKey: ["admin-branding"] });
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("admin.branding.failed"))),
  });

  const saveAccentMutation = useMutation({
    mutationFn: ({
      accent,
      accentHex,
    }: {
      accent: BrandingAccent;
      accentHex?: string | null;
    }) => updateAdminBrandingAccent(accent, accentHex ?? null),
    onMutate: ({ accent, accentHex }) => {
      // Swatches are instant-apply: paint the choice while the PUT runs.
      setAccentAttribute(accent, accentHex ?? undefined);
    },
    onSuccess: (_data, { accent, accentHex }) => {
      queryClient.setQueryData<AdminBranding>(["admin-branding"], (current) =>
        current
          ? { ...current, accent, accent_hex: accentHex ?? null }
          : current,
      );
      setAccentAttribute(accent, accentHex ?? undefined);
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("admin.branding.failed"))),
  });

  const uploadMarkMutation = useMutation({
    mutationFn: ({
      variant,
      file,
    }: {
      variant: BrandingMarkVariant;
      file: File;
    }) => uploadAdminBrandingMark(variant, file),
    onSuccess: () => {
      toast.success(t("admin.branding.markUploaded"));
      void queryClient.invalidateQueries({ queryKey: ["admin-branding"] });
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("admin.branding.failed"))),
  });

  const clearMarkMutation = useMutation({
    mutationFn: (variant: BrandingMarkVariant) =>
      clearAdminBrandingMark(variant),
    onSuccess: () => {
      toast.success(t("admin.branding.markRemoved"));
      void queryClient.invalidateQueries({ queryKey: ["admin-branding"] });
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("admin.branding.failed"))),
  });

  const handleFileChange = (
    variant: BrandingMarkVariant,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      void uploadMarkMutation.mutateAsync({ variant, file });
    }
  };

  const renderMarkRow = (
    variant: BrandingMarkVariant,
    label: string,
    url: string | null,
    inputRef: React.RefObject<HTMLInputElement | null>,
  ) => (
    <div className="flex items-center gap-3">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border bg-muted/40 dark:bg-muted/20">
        {url ? (
          <img alt="" className="size-8 object-contain" src={url} />
        ) : (
          <ImageUpIcon className="size-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <div className="mt-1 flex gap-2">
          <input
            accept={ACCEPTED_MARK_TYPES}
            className="hidden"
            ref={inputRef}
            type="file"
            onChange={(event) => handleFileChange(variant, event)}
          />
          <Button
            disabled={uploadMarkMutation.isPending}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => inputRef.current?.click()}
          >
            {url ? t("admin.branding.replace") : t("admin.branding.upload")}
          </Button>
          {url && (
            <Button
              disabled={clearMarkMutation.isPending}
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => void clearMarkMutation.mutateAsync(variant)}
            >
              <Trash2Icon data-icon="inline-start" />
              {t("admin.branding.remove")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("admin.branding.title")}</CardTitle>
        <Button
          size="sm"
          type="button"
          variant="outline"
          onClick={() => setEditOpen(true)}
        >
          <PencilIcon data-icon="inline-start" />
          {t("common.edit")}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{t("admin.branding.accent")}</p>
            <div className="flex flex-wrap items-center gap-3">
              <AccentPicker
                customHex={brandingQuery.data?.accent_hex ?? null}
                disabled={saveAccentMutation.isPending}
                value={brandingQuery.data?.accent ?? "flame"}
                onSelect={(accent) => {
                  if (accent === "custom") {
                    setCustomDraft(
                      brandingQuery.data?.accent_hex ??
                        (brandingQuery.data?.accent
                          ? (ACCENT_SWATCH_HEX[
                              brandingQuery.data
                                .accent as keyof typeof ACCENT_SWATCH_HEX
                            ] ?? "#ff6a00")
                          : "#ff6a00"),
                    );
                    setCustomOpen(true);
                    return;
                  }
                  void saveAccentMutation.mutateAsync({ accent });
                }}
              />
              <span className="text-muted-foreground text-sm">
                {accentSummaryLabel(
                  brandingQuery.data?.accent,
                  brandingQuery.data?.accent_hex,
                  t,
                )}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">
              {t("admin.branding.identity")}
            </p>
            <div className="flex items-center gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border bg-muted/40 dark:bg-muted/20">
                {brandingQuery.data?.mark_dark_url ? (
                  <img
                    alt=""
                    className="size-8 object-contain"
                    src={brandingQuery.data.mark_dark_url}
                  />
                ) : (
                  <ImageUpIcon className="size-4 text-muted-foreground" />
                )}
              </div>
              <p className="min-w-0 truncate text-sm">
                {brandingQuery.data?.product_name ||
                  t("admin.branding.statusDefault")}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("admin.branding.title")}</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void saveNameMutation.mutateAsync();
            }}
          >
            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="branding-product-name"
            >
              {t("admin.branding.productName")}
              <Input
                autoComplete="off"
                id="branding-product-name"
                maxLength={40}
                placeholder={t("admin.branding.productNamePlaceholder")}
                value={productName}
                onChange={(event) => setProductName(event.target.value)}
              />
            </label>
            {saveNameMutation.isError && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
                {t("admin.branding.failed")}
              </p>
            )}
            <DialogFooter>
              <Button
                disabled={
                  saveNameMutation.isPending ||
                  productName.trim() ===
                    (brandingQuery.data?.product_name ?? "")
                }
                type="submit"
              >
                {saveNameMutation.isPending && (
                  <Loader2Icon
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                )}
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
          <div className="flex flex-col gap-3 border-t pt-3">
            {renderMarkRow(
              "light",
              t("admin.branding.markLight"),
              brandingQuery.data?.mark_light_url ?? null,
              lightInputRef,
            )}
            {renderMarkRow(
              "dark",
              t("admin.branding.markDark"),
              brandingQuery.data?.mark_dark_url ?? null,
              darkInputRef,
            )}
          </div>
        </DialogContent>
      </Dialog>
      <CustomAccentDialog
        draft={customDraft}
        onDraftChange={setCustomDraft}
        onOpenChange={setCustomOpen}
        open={customOpen}
        onSave={(hex) =>
          saveAccentMutation.mutateAsync({ accent: "custom", accentHex: hex })
        }
      />
    </Card>
  );
}
