import type { UseQueryResult } from "@tanstack/react-query";
import {
  KeyRoundIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCcwIcon,
  ShieldCheckIcon,
  UserRoundIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PersonalAccessToken } from "@/api";
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
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Skeleton } from "@/components/ui/skeleton";
import type { TranslationKey, TranslationParams } from "@/i18n";
import { SettingsRow, SettingsSectionGroup } from "./apple-settings-ui";

export const MIN_PASSWORD_LENGTH = 8;

function useCloseOnSuccess(
  isPending: boolean,
  hasError: boolean,
  close: () => void,
) {
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && !hasError) close();
    wasPending.current = isPending;
  }, [isPending, hasError, close]);
}

export type AccountPanelProps = {
  // Username / Profile
  currentUsername: string;
  accountError: string | null;
  updateUsernameIsPending: boolean;
  readerExpiry?: string | null;
  setUsername: (value: string) => void;
  username: string;
  onUsernameSubmit: () => Promise<void>;

  // Email & Password & Delete
  changeEmailIsPending: boolean;
  changePasswordIsPending: boolean;
  currentEmail: string;
  emailProviderDisabled?: boolean;
  currentPassword: string;
  deleteAccountIsPending: boolean;
  deleteError: string | null;
  deletePassword: string;
  emailCurrentPassword: string;
  emailError: string | null;
  emailVerificationPending: boolean;
  isOwner: boolean;
  newPassword: string;
  newPasswordConfirmation: string;
  passwordError: string | null;
  setCurrentPassword: (value: string) => void;
  setDeletePassword: (value: string) => void;
  setEmailCurrentPassword: (value: string) => void;
  setNewEmail: (value: string) => void;
  setNewPassword: (value: string) => void;
  setNewPasswordConfirmation: (value: string) => void;
  newEmail: string;
  onEmailSubmit: () => Promise<void>;
  onPasswordSubmit: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;

  // Personal Access Tokens
  copied: boolean;
  createTokenIsPending: boolean;
  createdToken: string | null;
  deletingTokenId: string | undefined;
  locale: string;
  revokingTokenId: string | undefined;
  setTokenExpiryDays: (value: string) => void;
  setTokenName: (value: string) => void;
  tokenError: string | null;
  tokenExpiryDays: string;
  tokenName: string;
  tokensQuery: UseQueryResult<
    { personal_access_tokens: PersonalAccessToken[] },
    Error
  >;
  onCopyToken: () => Promise<void>;
  onCreateToken: () => Promise<void>;
  onRevokeToken: (id: string) => Promise<void>;
  onDeleteToken: (id: string) => Promise<void>;
  onHideCreatedToken: () => void;

  // i18n
  t: (key: TranslationKey, params?: TranslationParams) => string;
};

export function AccountPanel({
  currentUsername,
  accountError,
  updateUsernameIsPending,
  readerExpiry,
  setUsername,
  username,
  onUsernameSubmit,

  changeEmailIsPending,
  changePasswordIsPending,
  currentEmail,
  emailProviderDisabled,
  currentPassword,
  deleteAccountIsPending,
  deleteError,
  deletePassword,
  emailCurrentPassword,
  emailError,
  emailVerificationPending,
  isOwner,
  newPassword,
  newPasswordConfirmation,
  passwordError,
  setCurrentPassword,
  setDeletePassword,
  setEmailCurrentPassword,
  setNewEmail,
  setNewPassword,
  setNewPasswordConfirmation,
  newEmail,
  onEmailSubmit,
  onPasswordSubmit,
  onDeleteAccount,

  copied,
  createTokenIsPending,
  createdToken,
  deletingTokenId,
  locale,
  revokingTokenId,
  setTokenExpiryDays,
  setTokenName,
  tokenError,
  tokenExpiryDays,
  tokenName,
  tokensQuery,
  onCopyToken,
  onCreateToken,
  onRevokeToken,
  onDeleteToken,
  onHideCreatedToken,

  t,
}: AccountPanelProps) {
  // Dialog visibility states
  const [usernameOpen, setUsernameOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [createTokenOpen, setCreateTokenOpen] = useState(false);

  // Auto-close dialogs on mutation success
  useCloseOnSuccess(updateUsernameIsPending, accountError !== null, () =>
    setUsernameOpen(false),
  );
  useCloseOnSuccess(changeEmailIsPending, emailError !== null, () =>
    setEmailOpen(false),
  );
  useCloseOnSuccess(changePasswordIsPending, passwordError !== null, () =>
    setPasswordOpen(false),
  );
  useCloseOnSuccess(createTokenIsPending, tokenError !== null, () =>
    setCreateTokenOpen(false),
  );

  const expiryDate = readerExpiry ? new Date(readerExpiry) : null;
  const expiryLabel =
    expiryDate && !Number.isNaN(expiryDate.getTime())
      ? expiryDate.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : null;

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Account & Credentials */}
      <SettingsSectionGroup title={t("settings.group.account")}>
        <SettingsRow
          icon={UserRoundIcon}
          label={
            <div className="flex items-center gap-1.5">
              <span>{t("auth.usernameHandle")}</span>
              {expiryLabel && (
                <InfoTip
                  text={t("account.readerUntil", { date: expiryLabel })}
                />
              )}
            </div>
          }
          value={currentUsername ? `@${currentUsername}` : "—"}
          chevron
          onClick={() => setUsernameOpen(true)}
        />
        <SettingsRow
          icon={ShieldCheckIcon}
          label={
            <div className="flex items-center gap-1.5">
              <span>{t("auth.emailTitle")}</span>
              {emailProviderDisabled && (
                <InfoTip text={t("auth.noEmailProviderNote")} />
              )}
            </div>
          }
          description={
            emailVerificationPending
              ? t("auth.emailChangeVerificationSent")
              : undefined
          }
          value={currentEmail || "—"}
          chevron
          onClick={() => setEmailOpen(true)}
        />
        <SettingsRow
          icon={KeyRoundIcon}
          label={t("auth.passwordTitle")}
          value="••••••••"
          chevron
          onClick={() => setPasswordOpen(true)}
        />
      </SettingsSectionGroup>

      {/* 2. Personal Access Tokens */}
      <SettingsSectionGroup
        title={
          <div className="flex items-center justify-between">
            <span>{t("auth.tokensTitle")}</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setCreateTokenOpen(true)}
            >
              <PlusIcon data-icon="inline-start" className="size-3.5" />
              {t("auth.createToken")}
            </Button>
          </div>
        }
      >
        {tokenError && (
          <div className="p-3">
            <p className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
              {tokenError}
            </p>
          </div>
        )}

        {tokensQuery.isLoading && <TokenListSkeleton />}
        {tokensQuery.isError && (
          <div className="p-4 text-sm text-destructive">
            {t("auth.tokensLoadFailed")}
          </div>
        )}
        {tokensQuery.data?.personal_access_tokens.length === 0 && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {t("auth.noTokens")}
          </div>
        )}
        {tokensQuery.data?.personal_access_tokens.map((token) => (
          <PersonalAccessTokenRow
            key={token.id}
            deleting={deletingTokenId === token.id}
            locale={locale}
            pending={revokingTokenId === token.id}
            token={token}
            onRevoke={() => onRevokeToken(token.id)}
            onDelete={() => onDeleteToken(token.id)}
            t={t}
          />
        ))}
      </SettingsSectionGroup>

      {/* 3. Danger Zone (Non-owner only) */}
      {!isOwner && (
        <SettingsSectionGroup title={t("common.actions")}>
          <SettingsRow
            destructive
            label={t("auth.deleteAccountTitle")}
            onClick={() => setDeleteOpen(true)}
          />
        </SettingsSectionGroup>
      )}

      {/* ========================================================================= */}
      {/* Dialogs & Action Modals                                                    */}
      {/* ========================================================================= */}

      {/* Username Edit Dialog */}
      <Dialog open={usernameOpen} onOpenChange={setUsernameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("auth.profileTitle")}</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void onUsernameSubmit();
            }}
          >
            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="account-username"
            >
              {t("auth.usernameHandle")}
              <Input
                autoCapitalize="none"
                autoComplete="username"
                disabled={updateUsernameIsPending}
                id="account-username"
                maxLength={30}
                minLength={3}
                pattern="[A-Za-z0-9_]+"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            {accountError && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
                {accountError}
              </p>
            )}
            <DialogFooter className="mt-2">
              <Button
                disabled={updateUsernameIsPending}
                type="button"
                variant="outline"
                onClick={() => setUsernameOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button disabled={updateUsernameIsPending} type="submit">
                {updateUsernameIsPending
                  ? t("auth.saving")
                  : t("auth.saveUsername")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Email Change Dialog */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("auth.emailTitle")}</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void onEmailSubmit();
            }}
          >
            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="account-email-password"
            >
              {t("auth.currentPassword")}
              <PasswordInput
                autoComplete="current-password"
                disabled={changeEmailIsPending}
                id="account-email-password"
                required
                value={emailCurrentPassword}
                onChange={(event) =>
                  setEmailCurrentPassword(event.target.value)
                }
              />
            </label>
            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="account-new-email"
            >
              {t("auth.newEmail")}
              <Input
                autoCapitalize="none"
                autoComplete="email"
                disabled={changeEmailIsPending}
                id="account-new-email"
                required
                type="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
              />
            </label>
            {emailError && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
                {emailError}
              </p>
            )}
            <DialogFooter className="mt-2">
              <Button
                disabled={changeEmailIsPending}
                type="button"
                variant="outline"
                onClick={() => setEmailOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button disabled={changeEmailIsPending} type="submit">
                {changeEmailIsPending && (
                  <RefreshCcwIcon
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                )}
                {t("auth.changeEmail")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Password Change Dialog */}
      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("auth.passwordTitle")}</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void onPasswordSubmit();
            }}
          >
            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="account-current-password"
            >
              {t("auth.currentPassword")}
              <PasswordInput
                autoComplete="current-password"
                disabled={changePasswordIsPending}
                id="account-current-password"
                required
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="account-new-password"
            >
              {t("auth.newPassword")}
              <PasswordInput
                autoComplete="new-password"
                disabled={changePasswordIsPending}
                id="account-new-password"
                minLength={MIN_PASSWORD_LENGTH}
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="account-password-confirmation"
            >
              {t("auth.confirmPassword")}
              <PasswordInput
                autoComplete="new-password"
                disabled={changePasswordIsPending}
                id="account-password-confirmation"
                minLength={MIN_PASSWORD_LENGTH}
                required
                value={newPasswordConfirmation}
                onChange={(event) =>
                  setNewPasswordConfirmation(event.target.value)
                }
              />
            </label>
            {passwordError && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
                {passwordError}
              </p>
            )}
            <DialogFooter className="mt-2">
              <Button
                disabled={changePasswordIsPending}
                type="button"
                variant="outline"
                onClick={() => setPasswordOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button disabled={changePasswordIsPending} type="submit">
                {changePasswordIsPending && (
                  <RefreshCcwIcon
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                )}
                {t("auth.changePassword")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Token Dialog */}
      <Dialog open={createTokenOpen} onOpenChange={setCreateTokenOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("auth.createToken")}</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void onCreateToken();
            }}
          >
            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="token-name"
            >
              {t("auth.tokenName")}
              <Input
                autoComplete="off"
                disabled={createTokenIsPending}
                id="token-name"
                maxLength={64}
                required
                value={tokenName}
                onChange={(event) => setTokenName(event.target.value)}
              />
            </label>
            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="token-expiry"
            >
              {t("auth.tokenExpiry")}
              <Input
                autoComplete="off"
                disabled={createTokenIsPending}
                id="token-expiry"
                max={365}
                min={1}
                placeholder={t("auth.never")}
                type="number"
                value={tokenExpiryDays}
                onChange={(event) => setTokenExpiryDays(event.target.value)}
              />
            </label>
            <DialogFooter className="mt-2">
              <Button
                disabled={createTokenIsPending}
                type="button"
                variant="outline"
                onClick={() => setCreateTokenOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button disabled={createTokenIsPending} type="submit">
                {createTokenIsPending && (
                  <Loader2Icon
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                )}
                {createTokenIsPending
                  ? t("auth.creatingToken")
                  : t("auth.createToken")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Secret Reveal Dialog (PAT once-only reveal) */}
      <SecretRevealDialog
        closeLabelKey="auth.hideToken"
        copied={copied}
        copyLabelKey="auth.copyToken"
        description={t("auth.tokenShownOnceDescription")}
        onCopy={() => void onCopyToken()}
        onOpenChange={(open) => {
          if (!open) onHideCreatedToken();
        }}
        open={createdToken !== null}
        t={t}
        titleKey="auth.tokenShownOnce"
        value={createdToken ?? ""}
      />

      {/* Delete Account Alert Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("auth.deleteAccountTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("auth.deleteAccountDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <label
              className="flex flex-col gap-1.5 text-sm font-medium"
              htmlFor="delete-account-password"
            >
              {t("auth.deleteAccountPassword")}
              <PasswordInput
                autoComplete="current-password"
                disabled={deleteAccountIsPending}
                id="delete-account-password"
                required
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
              />
            </label>
            {deleteError && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
                {deleteError}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deleteAccountIsPending}
              variant="ghost"
              onClick={() => {
                setDeletePassword("");
              }}
            >
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteAccountIsPending || !deletePassword}
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                void onDeleteAccount().then(() => {
                  if (!deleteError) setDeleteOpen(false);
                });
              }}
            >
              {deleteAccountIsPending && (
                <RefreshCcwIcon
                  className="animate-spin"
                  data-icon="inline-start"
                />
              )}
              {t("auth.deleteAccountSubmit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PersonalAccessTokenRow({
  deleting,
  locale,
  pending,
  t,
  token,
  onRevoke,
  onDelete,
}: {
  deleting: boolean;
  locale: string;
  pending: boolean;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  token: PersonalAccessToken;
  onRevoke: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const expiry = token.expires_at
    ? dateFormatter.format(new Date(token.expires_at))
    : t("auth.never");

  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-3 transition-colors hover:bg-accent/20">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">
            {token.name ?? t("auth.unnamedToken")}
          </p>
          <Badge
            variant={token.enabled ? "secondary" : "outline"}
            className="text-xs h-5 px-1.5"
          >
            {token.enabled ? t("auth.active") : t("auth.revoked")}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground truncate">
          {token.prefix ?? "memos_pat_"}
          {token.start ? `${token.start}…` : ""} · {t("auth.expires")}: {expiry}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {token.enabled && (
          <Button
            disabled={pending || deleting}
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={() => setConfirmingRevoke(true)}
          >
            {pending && (
              <Loader2Icon className="animate-spin" data-icon="inline-start" />
            )}
            {t("auth.revokeToken")}
          </Button>
        )}
        <Button
          disabled={pending || deleting}
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive"
          onClick={() => setConfirmingDelete(true)}
        >
          {deleting && (
            <Loader2Icon className="animate-spin" data-icon="inline-start" />
          )}
          {t("common.delete")}
        </Button>
      </div>

      <AlertDialog open={confirmingRevoke} onOpenChange={setConfirmingRevoke}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("auth.revokeToken")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("auth.revokeTokenConfirm", {
                name: token.name ?? t("auth.unnamedToken"),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="ghost">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                setConfirmingRevoke(false);
                void onRevoke();
              }}
            >
              {t("auth.revokeToken")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("auth.deleteToken")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("auth.deleteTokenConfirm", {
                name: token.name ?? t("auth.unnamedToken"),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="ghost">
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                setConfirmingDelete(false);
                void onDelete();
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TokenListSkeleton() {
  return (
    <div className="flex flex-col divide-y divide-border/40">
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  );
}
