import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowDownUpIcon,
  BellRingIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileUpIcon,
  GaugeIcon,
  LogOutIcon,
  type LucideIcon,
  MicIcon,
  PaintbrushIcon,
  PuzzleIcon,
  SunMoonIcon,
  UsersIcon,
  WebhookIcon,
  XIcon,
} from "lucide-react";
import { lazy, type ReactNode, Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  changeEmail,
  createExportTask,
  createPersonalAccessToken,
  deleteAccount,
  deleteAvatar,
  deletePersonalAccessToken,
  getAdminBranding,
  getAdminPluginSettings,
  getAppInfo,
  getCloudflareUsage,
  getCurrentFlareMoUser,
  getVectorUsage,
  getVoiceSettings,
  listAdminUsers,
  listDataTasks,
  listPersonalAccessTokens,
  revokePersonalAccessToken,
  updateCurrentUserProfile,
  uploadAvatar,
} from "@/api";
import { authClient } from "@/auth-client";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/lib/error";
import { cn } from "@/lib/utils";
import { AccountPanel, MIN_PASSWORD_LENGTH } from "./account/account-panel";
import { AppearancePanel } from "./account/appearance-panel";
import { SettingsRow, SettingsSectionGroup } from "./account/apple-settings-ui";
import {
  EmailSettingsCard,
  OauthSettingsCard,
} from "./account/integrations-card";
import { PushPanel } from "./account/push-panel";
import { TransferPanel } from "./account/transfer-panel";
import { UploadsPanel } from "./account/uploads-panel";
import { UsagePanel } from "./account/usage-panel";
import { PluginsCard } from "./admin/plugins-card";
import { AdminPanel, BrandingCard } from "./admin-page";

const VoicePanel = lazy(() =>
  import("./account/voice-panel").then((module) => ({
    default: module.VoicePanel,
  })),
);

type SettingsSection =
  | "account"
  | "appearance"
  | "uploads"
  | "push"
  | "voice"
  | "usage"
  | "transfer"
  | "team"
  | "branding"
  | "plugins"
  | "integrations";

type NavItem = {
  id: SettingsSection;
  icon: LucideIcon;
  iconBg: string;
  label: string;
};

type NavGroup = {
  titleKey?: "settings.group.preferences" | "settings.group.admin";
  items: NavItem[];
};

function VoicePanelSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
    </div>
  );
}

export function AccountSettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { locale, t } = useI18n();
  const navigate = useNavigate({ from: "/account" });
  const queryClient = useQueryClient();
  const session = authClient.useSession();
  const [section, setSection] = useState<SettingsSection>("account");
  const [mobileView, setMobileView] = useState<"master" | "detail">("master");

  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailCurrentPassword, setEmailCurrentPassword] = useState("");
  const [tokenName, setTokenName] = useState("");
  const [tokenExpiryDays, setTokenExpiryDays] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailVerificationPending, setEmailVerificationPending] =
    useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset mobile view to master whenever the dialog opens fresh
  useEffect(() => {
    if (open) {
      setMobileView("master");
    }
  }, [open]);

  useEffect(() => {
    if (session.data?.user.username) {
      setUsername(session.data.user.username);
    }
  }, [session.data?.user.username]);

  const deleteAccountMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: async () => {
      queryClient.clear();
      await authClient.signOut().catch(() => undefined);
      await navigate({ replace: true, to: "/login" });
    },
  });

  const tokensQuery = useQuery({
    queryKey: ["personal-access-tokens"],
    queryFn: listPersonalAccessTokens,
    retry: false,
    enabled: open,
  });

  const meQuery = useQuery({
    queryKey: ["current-flaremo-user"],
    queryFn: getCurrentFlareMoUser,
    retry: false,
    enabled: open,
  });

  useEffect(() => {
    if (meQuery.data?.name) {
      setName(meQuery.data.name);
    } else if (session.data?.user.name) {
      setName(session.data.user.name);
    }
  }, [meQuery.data?.name, session.data?.user.name]);

  const updateProfileMutation = useMutation({
    mutationFn: updateCurrentUserProfile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["current-flaremo-user"],
      });
      await session.refetch();
    },
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: uploadAvatar,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["current-flaremo-user"],
      });
      await session.refetch();
    },
  });

  const deleteAvatarMutation = useMutation({
    mutationFn: deleteAvatar,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["current-flaremo-user"],
      });
      await session.refetch();
    },
  });

  const showVoiceSettings = meQuery.data?.can_manage_voice_service === true;

  const appInfoQuery = useQuery({
    queryKey: ["app-info"],
    queryFn: getAppInfo,
    staleTime: 10 * 60 * 1000,
    retry: false,
    enabled: open,
  });

  const vectorUsageQuery = useQuery({
    queryKey: ["vector-usage"],
    queryFn: getVectorUsage,
    retry: false,
    enabled: open,
    refetchInterval: 120_000,
  });

  const cfUsageQuery = useQuery({
    queryKey: ["cloudflare-usage"],
    queryFn: getCloudflareUsage,
    retry: false,
    enabled: open,
    // The worker caches analytics for an hour; polling harder is waste.
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  const dataTasksQuery = useQuery({
    queryKey: ["data-tasks"],
    queryFn: listDataTasks,
    retry: false,
    enabled: open,
    refetchInterval: (query) => {
      const tasks = query.state.data?.tasks ?? [];
      return tasks.some(
        (task) => task.status === "queued" || task.status === "running",
      )
        ? 5_000
        : false;
    },
  });

  const retryExportMutation = useMutation({
    mutationFn: createExportTask,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["data-tasks"] });
    },
    onError: (error) =>
      toast.error(errorMessage(error, t("transfer.retryFailed"))),
  });

  const updateUsernameMutation = useMutation({
    mutationFn: async (nextUsername: string) => {
      const result = await authClient.updateUser({ username: nextUsername });
      if (result.error) throw result.error;
    },
    onSuccess: async () => {
      await session.refetch();
      await queryClient.invalidateQueries({
        queryKey: ["current-flaremo-user"],
      });
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (input: {
      currentPassword: string;
      newPassword: string;
    }) => {
      const result = await authClient.changePassword({
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
        revokeOtherSessions: true,
      });
      if (result.error) throw result.error;
    },
  });

  const changeEmailMutation = useMutation({
    mutationFn: changeEmail,
    onSuccess: async (result) => {
      setEmailVerificationPending(result.verification_sent === true);
      await session.refetch();
    },
  });

  const createTokenMutation = useMutation({
    mutationFn: createPersonalAccessToken,
    onSuccess: async (result) => {
      setCreatedToken(result.token);
      setCopied(false);
      setTokenName("");
      setTokenExpiryDays("");
      await queryClient.invalidateQueries({
        queryKey: ["personal-access-tokens"],
      });
    },
  });

  const revokeTokenMutation = useMutation({
    mutationFn: revokePersonalAccessToken,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["personal-access-tokens"],
      });
    },
  });

  const deleteTokenMutation = useMutation({
    mutationFn: deletePersonalAccessToken,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["personal-access-tokens"],
      });
    },
  });

  const handleNameSubmit = async () => {
    setNameError(null);
    try {
      await updateProfileMutation.mutateAsync({ name: name.trim() });
    } catch (error) {
      setNameError(errorMessage(error, t("auth.nameUpdateFailed")));
    }
  };

  const handleAvatarUpload = async (file: File) => {
    setAvatarError(null);
    try {
      await uploadAvatarMutation.mutateAsync(file);
    } catch (error) {
      setAvatarError(errorMessage(error, t("auth.avatarUpdateFailed")));
    }
  };

  const handleAvatarUrlSubmit = async (url: string) => {
    setAvatarError(null);
    try {
      await updateProfileMutation.mutateAsync({ avatar_url: url.trim() });
    } catch (error) {
      setAvatarError(errorMessage(error, t("auth.avatarUpdateFailed")));
    }
  };

  const handleAvatarDelete = async () => {
    setAvatarError(null);
    try {
      await deleteAvatarMutation.mutateAsync();
    } catch (error) {
      setAvatarError(errorMessage(error, t("auth.avatarUpdateFailed")));
    }
  };

  const handleUsernameSubmit = async () => {
    setAccountError(null);
    try {
      await updateUsernameMutation.mutateAsync(username.trim());
    } catch (error) {
      setAccountError(errorMessage(error, t("auth.usernameUpdateFailed")));
    }
  };

  const handlePasswordSubmit = async () => {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(t("auth.passwordLength"));
      return;
    }
    if (newPassword !== newPasswordConfirmation) {
      setPasswordError(t("auth.passwordMismatch"));
      return;
    }
    setPasswordError(null);
    try {
      await changePasswordMutation.mutateAsync({
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirmation("");
    } catch (error) {
      setPasswordError(errorMessage(error, t("auth.passwordUpdateFailed")));
    }
  };

  const handleEmailSubmit = async () => {
    setEmailError(null);
    setEmailVerificationPending(false);
    try {
      await changeEmailMutation.mutateAsync({
        current_password: emailCurrentPassword,
        new_email: newEmail.trim(),
      });
      setNewEmail("");
      setEmailCurrentPassword("");
    } catch (error) {
      setEmailError(errorMessage(error, t("auth.emailUpdateFailed")));
    }
  };

  const handleCreateToken = async () => {
    const normalizedDays = tokenExpiryDays.trim();
    const expiresInDays = Number(normalizedDays);
    if (
      !tokenName.trim() ||
      (normalizedDays &&
        (!Number.isInteger(expiresInDays) ||
          expiresInDays < 1 ||
          expiresInDays > 365))
    ) {
      setTokenError(t("auth.tokenValidation"));
      return;
    }
    setTokenError(null);
    try {
      await createTokenMutation.mutateAsync({
        expires_in_days: normalizedDays ? expiresInDays : null,
        name: tokenName.trim(),
      });
    } catch (error) {
      setTokenError(errorMessage(error, t("auth.tokenCreateFailed")));
    }
  };

  const handleCopyToken = async () => {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken);
      setCopied(true);
    } catch {
      setTokenError(t("auth.copyFailed"));
    }
  };

  const handleRevokeToken = async (id: string) => {
    setTokenError(null);
    try {
      await revokeTokenMutation.mutateAsync(id);
    } catch (error) {
      setTokenError(errorMessage(error, t("auth.tokenRevokeFailed")));
    }
  };

  const handleDeleteToken = async (id: string) => {
    setTokenError(null);
    try {
      await deleteTokenMutation.mutateAsync(id);
    } catch (error) {
      setTokenError(errorMessage(error, t("auth.tokenDeleteFailed")));
    }
  };

  const handleDeleteAccount = () => {
    setDeleteError(null);
    return deleteAccountMutation
      .mutateAsync(deletePassword)
      .then(() => setDeletePassword(""))
      .catch((error: unknown) => {
        setDeleteError(errorMessage(error, t("auth.deleteAccountFailed")));
      });
  };

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
    } catch {
      // Ignore offline sign out failure
    }
    queryClient.clear();
    await navigate({ replace: true, to: "/login" });
  };

  const isTeamAdmin =
    meQuery.data?.role === "owner" || meQuery.data?.role === "admin";
  const isInstanceOwner = meQuery.data?.is_instance_owner === true;

  useEffect(() => {
    if (!open || !isTeamAdmin) return undefined;
    void queryClient.prefetchQuery({
      queryKey: ["admin-branding"],
      queryFn: getAdminBranding,
    });
    void queryClient.prefetchQuery({
      queryKey: ["admin-plugins"],
      queryFn: getAdminPluginSettings,
    });
    void queryClient.prefetchQuery({
      queryKey: ["admin-users"],
      queryFn: listAdminUsers,
    });
    return undefined;
  }, [isTeamAdmin, open, queryClient]);

  useEffect(() => {
    if (!open || meQuery.data?.can_manage_voice_service !== true) {
      return undefined;
    }
    void queryClient.prefetchQuery({
      queryKey: ["voice-settings"],
      queryFn: getVoiceSettings,
    });
    return undefined;
  }, [meQuery.data?.can_manage_voice_service, open, queryClient]);

  const navGroups: NavGroup[] = [
    {
      titleKey: "settings.group.preferences",
      items: [
        {
          icon: SunMoonIcon,
          iconBg: "bg-muted text-muted-foreground",
          id: "appearance",
          label: t("settings.nav.appearance"),
        },
        {
          icon: FileUpIcon,
          iconBg: "bg-muted text-muted-foreground",
          id: "uploads",
          label: t("settings.nav.uploads"),
        },
        {
          icon: BellRingIcon,
          iconBg: "bg-muted text-muted-foreground",
          id: "push",
          label: t("settings.nav.push"),
        },
        ...(showVoiceSettings
          ? [
              {
                icon: MicIcon,
                iconBg: "bg-muted text-muted-foreground",
                id: "voice" as const,
                label: t("settings.nav.voice"),
              },
            ]
          : []),
        {
          icon: GaugeIcon,
          iconBg: "bg-muted text-muted-foreground",
          id: "usage",
          label: t("auth.tab.usage"),
        },
        {
          icon: ArrowDownUpIcon,
          iconBg: "bg-muted text-muted-foreground",
          id: "transfer",
          label: t("settings.nav.transfer"),
        },
      ],
    },
    ...(isTeamAdmin
      ? [
          {
            titleKey: "settings.group.admin" as const,
            items: [
              {
                icon: UsersIcon,
                iconBg: "bg-muted text-muted-foreground",
                id: "team" as const,
                label: t("auth.tab.admin"),
              },
              ...(isInstanceOwner
                ? [
                    {
                      icon: PaintbrushIcon,
                      iconBg: "bg-muted text-muted-foreground",
                      id: "branding" as const,
                      label: t("auth.tab.branding"),
                    },
                    {
                      icon: PuzzleIcon,
                      iconBg: "bg-muted text-muted-foreground",
                      id: "plugins" as const,
                      label: t("auth.tab.plugins"),
                    },
                    {
                      icon: WebhookIcon,
                      iconBg: "bg-muted text-muted-foreground",
                      id: "integrations" as const,
                      label: t("settings.nav.integrations"),
                    },
                  ]
                : []),
            ],
          },
        ]
      : []),
  ];

  const allItems = navGroups.flatMap((group) => group.items);
  const activeSection = allItems.find((item) => item.id === section);
  const activeLabel = activeSection?.label ?? t("settings.group.account");

  const contentBySection: Record<SettingsSection, ReactNode> = {
    account: (
      <AccountPanel
        currentAvatarUrl={
          meQuery.data?.avatar_url ?? session.data?.user.image ?? null
        }
        currentName={
          meQuery.data?.name ??
          session.data?.user.name ??
          session.data?.user.username ??
          ""
        }
        name={name}
        setName={setName}
        onNameSubmit={handleNameSubmit}
        updateNameIsPending={updateProfileMutation.isPending}
        nameError={nameError}
        avatarError={avatarError}
        avatarIsPending={
          uploadAvatarMutation.isPending ||
          deleteAvatarMutation.isPending ||
          updateProfileMutation.isPending
        }
        onAvatarUpload={handleAvatarUpload}
        onAvatarUrlSubmit={handleAvatarUrlSubmit}
        onAvatarDelete={handleAvatarDelete}
        accountError={accountError}
        changeEmailIsPending={changeEmailMutation.isPending}
        changePasswordIsPending={changePasswordMutation.isPending}
        copied={copied}
        createTokenIsPending={createTokenMutation.isPending}
        createdToken={createdToken}
        currentEmail={session.data?.user.email ?? ""}
        currentPassword={currentPassword}
        currentUsername={session.data?.user.username ?? ""}
        deleteAccountIsPending={deleteAccountMutation.isPending}
        deleteError={deleteError}
        deletePassword={deletePassword}
        deletingTokenId={
          deleteTokenMutation.isPending
            ? deleteTokenMutation.variables
            : undefined
        }
        emailCurrentPassword={emailCurrentPassword}
        emailError={emailError}
        emailProviderDisabled={appInfoQuery.data?.email_provider === "none"}
        emailVerificationPending={emailVerificationPending}
        isOwner={isInstanceOwner}
        locale={locale}
        newEmail={newEmail}
        newPassword={newPassword}
        newPasswordConfirmation={newPasswordConfirmation}
        passwordError={passwordError}
        readerExpiry={
          meQuery.data?.role === "reader"
            ? (meQuery.data.reader_expires_at ?? null)
            : null
        }
        revokingTokenId={
          revokeTokenMutation.isPending
            ? revokeTokenMutation.variables
            : undefined
        }
        setCurrentPassword={setCurrentPassword}
        setDeletePassword={setDeletePassword}
        setEmailCurrentPassword={setEmailCurrentPassword}
        setNewEmail={setNewEmail}
        setNewPassword={setNewPassword}
        setNewPasswordConfirmation={setNewPasswordConfirmation}
        setTokenExpiryDays={setTokenExpiryDays}
        setTokenName={setTokenName}
        setUsername={setUsername}
        t={t}
        tokenError={tokenError}
        tokenExpiryDays={tokenExpiryDays}
        tokenName={tokenName}
        tokensQuery={tokensQuery}
        updateUsernameIsPending={updateUsernameMutation.isPending}
        username={username}
        onCopyToken={handleCopyToken}
        onCreateToken={handleCreateToken}
        onDeleteAccount={handleDeleteAccount}
        onDeleteToken={handleDeleteToken}
        onEmailSubmit={handleEmailSubmit}
        onHideCreatedToken={() => setCreatedToken(null)}
        onPasswordSubmit={handlePasswordSubmit}
        onRevokeToken={handleRevokeToken}
        onUsernameSubmit={handleUsernameSubmit}
      />
    ),
    appearance: <AppearancePanel t={t} />,
    uploads: <UploadsPanel />,
    push: <PushPanel />,
    voice: showVoiceSettings ? (
      <Suspense fallback={<VoicePanelSkeleton />}>
        <VoicePanel key={session.data?.user.id} />
      </Suspense>
    ) : null,
    usage: (
      <UsagePanel
        t={t}
        vectorUsageQuery={vectorUsageQuery}
        cfUsageQuery={cfUsageQuery}
      />
    ),
    transfer: (
      <TransferPanel
        dataTasksQuery={dataTasksQuery}
        createExportIsPending={retryExportMutation.isPending}
        retryExportIsPending={retryExportMutation.isPending}
        t={t}
        onCreateExport={() => retryExportMutation.mutate()}
        onRetryExport={() => retryExportMutation.mutate()}
      />
    ),
    team: isTeamAdmin ? <AdminPanel /> : null,
    branding: isInstanceOwner ? <BrandingCard /> : null,
    plugins: isInstanceOwner ? <PluginsCard /> : null,
    integrations: isInstanceOwner ? (
      <div className="flex flex-col gap-5">
        <EmailSettingsCard />
        <OauthSettingsCard />
      </div>
    ) : null,
  };

  const roleLabel =
    meQuery.data?.role === "owner"
      ? "所有者"
      : meQuery.data?.role === "admin"
        ? "管理员"
        : meQuery.data?.role === "reader"
          ? "读者"
          : "成员";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex h-svh max-h-svh w-full max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[min(46rem,calc(100svh-4rem))] sm:max-h-[calc(100svh-4rem)] sm:max-w-4xl sm:flex-row sm:rounded-2xl sm:border"
      >
        {/* ========================================================================= */}
        {/* 1. NARROW SCREEN / MOBILE: MASTER VIEW (一级主菜单)                         */}
        {/* ========================================================================= */}
        <div
          className={cn(
            "flex flex-1 flex-col overflow-hidden bg-background sm:hidden",
            mobileView === "detail" && "hidden",
            mobileView === "master" && "motion-safe:animate-fade",
          )}
        >
          {/* Mobile Master Navigation Bar */}
          <div className="flex shrink-0 items-center justify-between border-b bg-background/90 px-4 py-3 backdrop-blur-md">
            <DialogTitle className="text-lg font-semibold tracking-tight">
              {t("settings.title")}
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 px-2.5 font-medium text-primary hover:bg-accent/50"
            >
              {t("settings.done")}
            </Button>
          </div>

          {/* Mobile Master List */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
            {/* Apple ID Style Account Header */}
            <button
              type="button"
              onClick={() => {
                setSection("account");
                setMobileView("detail");
              }}
              className="flex w-full items-center justify-between gap-3.5 rounded-2xl border border-border/60 bg-card p-4 text-left shadow-2xs cursor-pointer hover:bg-accent/40 active:bg-accent/60 transition-colors"
            >
              <div className="flex min-w-0 items-center gap-3.5">
                <Avatar
                  src={
                    meQuery.data?.avatar_url ?? session.data?.user.image ?? null
                  }
                  name={
                    meQuery.data?.name ??
                    session.data?.user.name ??
                    session.data?.user.username ??
                    ""
                  }
                  size="xl"
                />
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-foreground">
                    {meQuery.data?.name ??
                      session.data?.user.name ??
                      session.data?.user.username}
                  </div>
                  <div className="truncate text-xs text-muted-foreground mt-0.5">
                    {session.data?.user.username
                      ? `@${session.data.user.username}`
                      : session.data?.user.email}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Badge
                      variant="secondary"
                      className="h-4 px-1.5 text-xs font-normal"
                    >
                      {roleLabel}
                    </Badge>
                  </div>
                </div>
              </div>
              <ChevronRightIcon className="size-5 text-muted-foreground/40 shrink-0" />
            </button>

            {/* Mobile Nav Groups */}
            {navGroups.map((group) => (
              <SettingsSectionGroup
                key={group.titleKey ?? "default"}
                title={group.titleKey ? t(group.titleKey) : undefined}
              >
                {group.items.map((item) => (
                  <SettingsRow
                    key={item.id}
                    icon={item.icon}
                    iconColor={item.iconBg}
                    label={item.label}
                    chevron
                    onClick={() => {
                      setSection(item.id);
                      setMobileView("detail");
                    }}
                  />
                ))}
              </SettingsSectionGroup>
            ))}

            {/* Mobile Sign Out */}
            <SettingsSectionGroup>
              <SettingsRow
                destructive
                icon={LogOutIcon}
                label={t("auth.signOut")}
                onClick={() => void handleSignOut()}
              />
            </SettingsSectionGroup>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 2. NARROW SCREEN / MOBILE: DETAIL VIEW (二级详情页)                         */}
        {/* ========================================================================= */}
        <div
          className={cn(
            "flex flex-1 flex-col overflow-hidden bg-background sm:hidden",
            mobileView === "master" && "hidden",
            mobileView === "detail" && "motion-safe:animate-fade",
          )}
        >
          {/* Mobile Detail Navigation Bar */}
          <div className="flex shrink-0 items-center justify-between border-b bg-background/90 px-2 py-2 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setMobileView("master")}
              className="flex items-center gap-1 text-sm font-medium text-primary hover:opacity-80 transition-opacity py-1 px-2 -ml-1"
            >
              <ChevronLeftIcon className="size-5" />
              <span>{t("settings.title")}</span>
            </button>
            <h2 className="font-heading text-sm font-semibold tracking-tight truncate px-2 text-foreground">
              {activeLabel}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 px-2.5 font-medium text-primary hover:bg-accent/50"
            >
              {t("settings.done")}
            </Button>
          </div>

          {/* Mobile Detail Body */}
          <div className="flex-1 overflow-y-auto p-4">
            <div
              className="flex flex-col gap-4 motion-safe:animate-fade"
              key={section}
            >
              {contentBySection[section]}
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 3. WIDE SCREEN / DESKTOP: macOS STYLE SPLIT VIEW (宽屏双栏分栏)            */}
        {/* ========================================================================= */}
        <aside className="hidden shrink-0 flex-col border-r bg-muted/30 p-3 sm:flex sm:w-64">
          <div className="flex items-center justify-between px-2 pt-1 pb-2">
            <DialogTitle className="text-base font-semibold tracking-tight text-foreground">
              {t("settings.title")}
            </DialogTitle>
          </div>

          {/* Compact User Header in Sidebar */}
          <button
            type="button"
            onClick={() => setSection("account")}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-all cursor-pointer mb-2 border",
              section === "account"
                ? "bg-accent/80 border-border/60 shadow-2xs text-foreground"
                : "border-transparent hover:bg-accent/40 text-foreground",
            )}
          >
            <Avatar
              src={meQuery.data?.avatar_url ?? session.data?.user.image ?? null}
              name={
                meQuery.data?.name ??
                session.data?.user.name ??
                session.data?.user.username ??
                ""
              }
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-semibold leading-tight text-foreground">
                  {meQuery.data?.name ??
                    session.data?.user.name ??
                    session.data?.user.username}
                </p>
                <Badge
                  variant="secondary"
                  className="h-4 px-1.5 text-xs font-normal"
                >
                  {roleLabel}
                </Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground mt-0.5">
                {session.data?.user.username
                  ? `@${session.data.user.username}`
                  : t("settings.group.account")}
              </p>
            </div>
          </button>

          {/* Sidebar Nav Items */}
          <nav className="flex-1 overflow-y-auto flex flex-col gap-3 py-1">
            {navGroups.map((group) => (
              <div
                key={group.titleKey ?? "default"}
                className="flex flex-col gap-0.5"
              >
                {group.titleKey && (
                  <div className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">
                    {t(group.titleKey)}
                  </div>
                )}
                {group.items.map((item) => {
                  const active = section === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      aria-current={active ? "true" : undefined}
                      onClick={() => setSection(item.id)}
                      className={cn(
                        "flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm transition-colors text-left",
                        active
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="truncate flex-1">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Desktop Sign Out */}
          <div className="mt-auto pt-3 border-t border-border/40">
            <Button
              className="h-9 w-full justify-start gap-3 px-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => void handleSignOut()}
              variant="ghost"
            >
              <LogOutIcon
                data-icon="inline-start"
                className="size-4 shrink-0"
              />
              {t("auth.signOut")}
            </Button>
          </div>
        </aside>

        {/* Desktop Detail Pane */}
        <section className="hidden min-w-0 flex-1 flex-col overflow-hidden sm:flex">
          {/* Desktop Detail Header */}
          <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
            <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">
              {activeLabel}
            </h2>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              className="size-7 rounded-md text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-4" />
            </Button>
          </div>

          {/* Desktop Detail Body */}
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-2xl px-6 py-6">
              <div
                className="flex flex-col gap-4 motion-safe:animate-fade"
                key={section}
              >
                {contentBySection[section]}
              </div>
            </div>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}

export function AccountPage() {
  const navigate = useNavigate({ from: "/account" });
  return (
    <AccountSettingsDialog
      open
      onClose={() =>
        void navigate({
          search: {
            compose: undefined,
            q: undefined,
            space: undefined,
            tag: undefined,
            untagged: undefined,
            view: undefined,
          },
          to: "/",
        })
      }
    />
  );
}
