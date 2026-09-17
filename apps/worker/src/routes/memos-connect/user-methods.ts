import type { createDb } from "@flaremo/db";
import {
  beginFlaremoMemberRemoval,
  createUserWebhook,
  deleteUserNotification,
  deleteUserWebhook,
  finalizeFlaremoMemberRemoval,
  getMemoStats,
  getStoredSetting,
  getUserWebhookSigningSecret,
  isInstanceOwner,
  isTeamAdmin,
  listFlaremoUsers,
  listMemosPersonalAccessTokens,
  listMemoTotalsByUser,
  listUserNotifications,
  listUserWebhooks,
  memosWireRole,
  type PlanLimits,
  type UserNotificationDto,
  updateFlaremoUserProfile,
  updateUserNotification,
  updateUserWebhook,
  upsertStoredSetting,
} from "@flaremo/domain";
import { currentUserToDto } from "@flaremo/memos";
import { cleanupFlaremoArtifacts } from "../../artifact-cleanup";
import { createFlareMoAuth } from "../../auth";
import { getFlareMoRuntime } from "../../context";
import { getAuthUserCached } from "../../identity-cache";
import { CompatValidationError } from "../../memos-compat/errors";
import { registerCompatMember } from "../../memos-compat/member-service";
import { personalAccessTokenToDto } from "../../memos-compat/pat";
import { memosCompatUserDto } from "../../memos-compat/user-dto";
import type { BinaryTransport } from "../../memos-protobuf";
import {
  type ConnectContext,
  type ConnectRequestContext,
  connectSettingRecord,
  fieldMaskPaths,
  getUserByName,
  list,
  optionalString,
  pageSize,
  record,
  requiredString,
} from "./shared";
import { connectErrorForTransport, connectValue } from "./transport";

export async function connectUserMethod(
  c: ConnectContext,
  context: ConnectRequestContext,
  method: string,
  value: unknown,
  transport?: BinaryTransport,
) {
  const body = record(value);
  const authUser = await getAuthUserCached(context.db, context.authUserId);
  switch (method) {
    case "ListUsers": {
      const filter = optionalString(body.filter);
      const users = await Promise.all(
        (await listFlaremoUsers(context.db)).map((user) =>
          memosCompatUserDto(context.db, user, context.user.id, authUser),
        ),
      );
      const matched = filter
        ? users.filter((user) => user.username.includes(filter))
        : users;
      return connectValue(
        c,
        { users: matched, totalSize: matched.length },
        transport,
      );
    }
    case "BatchGetUsers": {
      const usernames = list(body.usernames).filter(
        (username): username is string => typeof username === "string",
      );
      const all = await Promise.all(
        (await listFlaremoUsers(context.db)).map((user) =>
          memosCompatUserDto(context.db, user, context.user.id, authUser),
        ),
      );
      const users =
        usernames.length === 0
          ? all
          : all.filter((user) => usernames.includes(user.username));
      return connectValue(c, { users }, transport);
    }
    case "GetUser": {
      const user = await getUserByName(context.db, body.name);
      if (!user) throw new CompatValidationError("User not found");
      const dto = await memosCompatUserDto(
        context.db,
        user,
        context.user.id,
        authUser,
      );
      return connectValue(c, dto, transport);
    }
    case "CreateUser": {
      if (context.credential === "pat" || !isInstanceOwner(context.user)) {
        return connectErrorForTransport(
          c,
          transport,
          "permission_denied",
          "An owner session is required to create a user",
          403,
        );
      }
      const user = record(body.user);
      const username = requiredString(user.username, "user.username");
      const password = requiredString(user.password, "user.password");
      if (password.length < 8) {
        throw new CompatValidationError(
          "user.password must be at least 8 characters",
        );
      }
      const displayName =
        optionalString(user.displayName) ??
        optionalString(user.nickname) ??
        username;
      const email = `${username}@flaremo.local`;
      const created = await createConnectUser(
        c,
        context.db,
        {
          username,
          password,
          displayName,
          email,
        },
        context.limits,
      );
      return connectValue(c, created.dto, transport);
    }
    case "DeleteUser": {
      if (context.credential === "pat" || !isInstanceOwner(context.user)) {
        return connectErrorForTransport(
          c,
          transport,
          "permission_denied",
          "An owner session is required to delete a user",
          403,
        );
      }
      const target = await getUserByName(context.db, body.name);
      if (!target) throw new CompatValidationError("User not found");
      if (target.id === context.user.id) {
        throw new CompatValidationError("You cannot delete your own account");
      }
      const artifacts = await beginFlaremoMemberRemoval(context.db, target.id);
      await cleanupFlaremoArtifacts(c.env, artifacts);
      await finalizeFlaremoMemberRemoval(context.db, target.id, artifacts);
      return connectValue(c, {}, transport);
    }
    case "UpdateUser": {
      if (context.credential === "pat") {
        return connectErrorForTransport(
          c,
          transport,
          "permission_denied",
          "A session credential is required to update the user",
          403,
        );
      }
      const user = record(body.user);
      assertConnectUserPath(user.name, context.user.id);
      const fields = fieldMaskPaths(body.updateMask);
      if (fields.length === 0)
        throw new CompatValidationError("updateMask is required");
      let nextAuthUser = authUser;
      if (fields.includes("username")) {
        const username = requiredString(user.username, "user.username");
        await updateBetterAuthUsername(c, context, username);
        nextAuthUser = await getAuthUserCached(context.db, context.authUserId);
      }
      const updatedUser = await updateFlaremoUserProfile(
        context.db,
        context.user,
        {
          ...(fields.includes("displayName")
            ? { name: requiredString(user.displayName, "user.displayName") }
            : {}),
          ...(fields.includes("avatarUrl")
            ? { avatarUrl: optionalString(user.avatarUrl) ?? null }
            : {}),
        },
      );
      return connectValue(
        c,
        currentUserToDto(updatedUser, nextAuthUser),
        transport,
      );
    }
    case "GetUserStats": {
      assertConnectUserPath(body.name, context.user.id);
      const stats = await getMemoStats(context.db, context.user, {
        time_zone: "UTC",
      });
      return connectValue(
        c,
        userStatsFromMemoStats(context.user.id, stats),
        transport,
      );
    }
    case "ListAllUserStats": {
      // Team-wide stats are an administrative view; a member must not be able
      // to profile the whole instance.
      if (!isTeamAdmin(context.user)) {
        return connectErrorForTransport(
          c,
          transport,
          "permission_denied",
          "A team administrator is required to list all user stats",
          403,
        );
      }
      const [users, totals] = await Promise.all([
        listFlaremoUsers(context.db),
        listMemoTotalsByUser(context.db),
      ]);
      const stats = users.map((user) => {
        const entry = totals.get(user.id);
        return {
          name: user.id,
          memoTypeStats: {
            linkCount: 0,
            codeCount: 0,
            todoCount: 0,
            undoCount: 0,
          },
          tagCount: Object.fromEntries(entry?.tags ?? []),
          totalMemoCount: entry?.total ?? 0,
          pinnedMemos: [],
          memoCreatedTimestamps: [],
          memoUpdatedTimestamps: [],
        };
      });
      return connectValue(c, { stats }, transport);
    }
    case "GetUserSetting": {
      assertConnectUserSettingPath(body.name, context.user.id);
      return connectValue(
        c,
        userSettingResponse(context, requiredString(body.name, "name")),
        transport,
      );
    }
    case "ListUserSettings": {
      assertConnectUserPath(body.parent, context.user.id);
      const settings = await listConnectUserSettings(context);
      return connectValue(
        c,
        { settings, totalSize: settings.length },
        transport,
      );
    }
    case "UpdateUserSetting": {
      if (context.credential === "pat") {
        return connectErrorForTransport(
          c,
          transport,
          "permission_denied",
          "A session credential is required to update settings",
          403,
        );
      }
      const setting = connectSettingRecord(body.setting);
      assertConnectUserSettingPath(setting.name, context.user.id);
      const key = userSettingKey(requiredString(setting.name, "setting.name"));
      await upsertStoredSetting(
        context.db,
        context.user,
        `memos.user.${key}`,
        setting.value,
      );
      return connectValue(c, setting, transport);
    }
    case "ListLinkedIdentities":
      assertConnectUserPath(body.parent, context.user.id);
      return connectValue(c, { linkedIdentities: [] }, transport);
    case "CreateLinkedIdentity":
    case "GetLinkedIdentity":
    case "DeleteLinkedIdentity":
      return connectErrorForTransport(
        c,
        transport,
        "unimplemented",
        "SSO linked identities are not configured on FlareMo",
        501,
      );
    case "ListPersonalAccessTokens": {
      assertConnectUserPath(body.parent, context.user.id);
      const tokens = await listMemosPersonalAccessTokens(
        context.db,
        context.authUserId,
      );
      return connectValue(
        c,
        {
          personalAccessTokens: tokens.map((token) =>
            personalAccessTokenToDto(token, context.user.id),
          ),
          totalSize: tokens.length,
        },
        transport,
      );
    }
    case "CreatePersonalAccessToken": {
      if (context.credential === "pat") {
        return connectErrorForTransport(
          c,
          transport,
          "permission_denied",
          "A session credential is required to create a PAT",
          403,
        );
      }
      assertConnectUserPath(body.parent, context.user.id);
      const expiresInDays =
        body.expiresInDays === undefined ? 0 : Number(body.expiresInDays);
      if (
        !Number.isInteger(expiresInDays) ||
        expiresInDays < 0 ||
        expiresInDays > 365
      ) {
        throw new CompatValidationError(
          "expiresInDays must be an integer between 0 and 365",
        );
      }
      const created = await createFlareMoAuth(
        c.env,
        context.db,
      ).api.createApiKey({
        body: {
          configId: "memos",
          userId: context.authUserId,
          name: optionalString(body.description) ?? "Memos API token",
          expiresIn: expiresInDays === 0 ? null : expiresInDays * 24 * 60 * 60,
        },
      });
      return connectValue(
        c,
        {
          personalAccessToken: personalAccessTokenToDto(
            created,
            context.user.id,
          ),
          token: created.key,
        },
        transport,
      );
    }
    case "DeletePersonalAccessToken": {
      if (context.credential === "pat") {
        return connectErrorForTransport(
          c,
          transport,
          "permission_denied",
          "A session credential is required to revoke a PAT",
          403,
        );
      }
      assertConnectPatPath(body.name, context.user.id);
      const tokenId = requiredString(body.name, "name").split("/").at(-1) ?? "";
      const token = (
        await listMemosPersonalAccessTokens(context.db, context.authUserId)
      ).find((item) => item.id === tokenId);
      if (!token)
        throw new CompatValidationError("Personal access token not found");
      await getFlareMoRuntime(c.env).auth.api.updateApiKey({
        body: {
          configId: "memos",
          keyId: token.id,
          userId: context.authUserId,
          enabled: false,
        },
      });
      return connectValue(c, {}, transport);
    }
    case "ListUserWebhooks":
      assertConnectUserPath(body.parent, context.user.id);
      return connectValue(
        c,
        { webhooks: await listUserWebhooks(context.db, context.user) },
        transport,
      );
    case "CreateUserWebhook": {
      if (context.credential === "pat") {
        return connectErrorForTransport(
          c,
          transport,
          "permission_denied",
          "A session credential is required to create a webhook",
          403,
        );
      }
      assertConnectUserPath(body.parent, context.user.id);
      const webhook = record(body.webhook);
      const signingSecret = webhook.signingSecret;
      if (signingSecret !== undefined && typeof signingSecret !== "string") {
        throw new CompatValidationError(
          "webhook.signingSecret must be a string",
        );
      }
      return connectValue(
        c,
        {
          ...(await createUserWebhook(context.db, context.user, {
            url: requiredString(webhook.url, "webhook.url"),
            displayName: optionalString(webhook.displayName) ?? "",
            ...(signingSecret !== undefined ? { signingSecret } : {}),
          })),
        },
        transport,
      );
    }
    case "UpdateUserWebhook": {
      if (context.credential === "pat") {
        return connectErrorForTransport(
          c,
          transport,
          "permission_denied",
          "A session credential is required to update a webhook",
          403,
        );
      }
      const webhook = record(body.webhook);
      const signingSecret = webhook.signingSecret;
      if (signingSecret !== undefined && typeof signingSecret !== "string") {
        throw new CompatValidationError(
          "webhook.signingSecret must be a string",
        );
      }
      return connectValue(
        c,
        await updateUserWebhook(context.db, context.user, {
          name: requiredString(webhook.name, "webhook.name"),
          ...(webhook.url !== undefined ? { url: String(webhook.url) } : {}),
          ...(webhook.displayName !== undefined
            ? { displayName: String(webhook.displayName) }
            : {}),
          ...(signingSecret !== undefined ? { signingSecret } : {}),
          updateMask: fieldMaskPaths(body.updateMask),
        }),
        transport,
      );
    }
    case "DeleteUserWebhook": {
      if (context.credential === "pat") {
        return connectErrorForTransport(
          c,
          transport,
          "permission_denied",
          "A session credential is required to delete a webhook",
          403,
        );
      }
      await deleteUserWebhook(
        context.db,
        context.user,
        requiredString(body.name, "name"),
      );
      return connectValue(c, {}, transport);
    }
    case "GetUserWebhookSigningSecret": {
      if (context.credential === "pat") {
        return connectErrorForTransport(
          c,
          transport,
          "permission_denied",
          "A session credential is required to reveal a webhook secret",
          403,
        );
      }
      return connectValue(
        c,
        {
          signingSecret: await getUserWebhookSigningSecret(
            context.db,
            context.user,
            requiredString(body.name, "name"),
          ),
        },
        transport,
      );
    }
    case "ListUserNotifications": {
      assertConnectUserPath(body.parent, context.user.id);
      const result = await listUserNotifications(context.db, context.user, {
        pageSize:
          body.pageSize === undefined ? undefined : pageSize(body.pageSize),
        pageToken: optionalString(body.pageToken),
        filter: optionalString(body.filter),
        // FlareMo-only kinds such as daily_review have no upstream Memos type
        // mapping; hide them from third-party clients entirely.
        excludeTypes: ["daily_review"],
      });
      return connectValue(
        c,
        {
          notifications: result.notifications.map(connectNotificationToDto),
          ...(result.nextPageToken
            ? { nextPageToken: result.nextPageToken }
            : {}),
        },
        transport,
      );
    }
    case "UpdateUserNotification": {
      if (context.credential === "pat") {
        return connectErrorForTransport(
          c,
          transport,
          "permission_denied",
          "A session credential is required to update a notification",
          403,
        );
      }
      const notification = record(body.notification);
      return connectValue(
        c,
        connectNotificationToDto(
          await updateUserNotification(
            context.db,
            context.user,
            requiredString(notification.name, "notification.name"),
            notificationStatusFromDto(notification.status),
            fieldMaskPaths(body.updateMask),
          ),
        ),
        transport,
      );
    }
    case "DeleteUserNotification": {
      if (context.credential === "pat") {
        return connectErrorForTransport(
          c,
          transport,
          "permission_denied",
          "A session credential is required to delete a notification",
          403,
        );
      }
      await deleteUserNotification(
        context.db,
        context.user,
        requiredString(body.name, "name"),
      );
      return connectValue(c, {}, transport);
    }
    default:
      return connectErrorForTransport(
        c,
        transport,
        "unimplemented",
        `User method is not implemented: ${method}`,
        501,
      );
  }
}
function assertConnectUserPath(value: unknown, currentUserId: string) {
  const name = requiredString(value, "user");
  const normalized = name.startsWith("users/") ? name : `users/${name}`;
  if (normalized !== currentUserId) {
    throw new CompatValidationError(
      "Only the current FlareMo user is available",
    );
  }
}

function assertConnectUserSettingPath(value: unknown, currentUserId: string) {
  const name = requiredString(value, "setting");
  const prefix = `${currentUserId}/settings/`;
  if (!name.startsWith(prefix) || name.slice(prefix.length).includes("/")) {
    throw new CompatValidationError(
      "Only the current FlareMo user settings are available",
    );
  }
}

function assertConnectPatPath(value: unknown, currentUserId: string) {
  const name = requiredString(value, "name");
  if (!name.startsWith(`${currentUserId}/personalAccessTokens/`)) {
    throw new CompatValidationError(
      "Only the current FlareMo user's PATs are available",
    );
  }
}
function userSettingKey(name: string) {
  return name.split("/").at(-1) ?? "GENERAL";
}

async function userSettingResponse(
  context: ConnectRequestContext,
  name: string,
) {
  const key = userSettingKey(name);
  const stored = await getStoredSetting(
    context.db,
    context.user,
    `memos.user.${key}`,
  );
  return {
    name,
    value:
      stored?.value && typeof stored.value === "object"
        ? stored.value
        : { case: "generalSetting", value: {} },
  };
}

async function listConnectUserSettings(context: ConnectRequestContext) {
  const username =
    (await getAuthUserCached(context.db, context.authUserId))?.username ??
    "owner";
  const generalName = `${context.user.id}/settings/GENERAL`;
  const stored = await getStoredSetting(
    context.db,
    context.user,
    "memos.user.GENERAL",
  );
  return [
    {
      name: generalName.replace(context.user.id, `users/${username}`),
      value:
        stored?.value && typeof stored.value === "object"
          ? stored.value
          : { case: "generalSetting", value: {} },
    },
  ];
}
function userStatsFromMemoStats(
  userId: string,
  stats: Awaited<ReturnType<typeof getMemoStats>>,
) {
  return {
    name: userId,
    memoTypeStats: { linkCount: 0, codeCount: 0, todoCount: 0, undoCount: 0 },
    tagCount: Object.fromEntries(
      stats.tags.map((tag) => [tag.name, tag.count]),
    ),
    totalMemoCount: stats.counts.total,
    pinnedMemos: [],
    memoCreatedTimestamps: [],
    memoUpdatedTimestamps: [],
  };
}

async function updateBetterAuthUsername(
  c: ConnectContext,
  _context: ConnectRequestContext,
  username: string,
) {
  if (!c.req.raw.headers.get("cookie")) {
    throw new CompatValidationError(
      "A Better Auth cookie session is required to update the username",
    );
  }
  const headers = new Headers(c.req.raw.headers);
  headers.set("content-type", "application/json");
  const request = new Request(new URL("/api/auth/update-user", c.req.url), {
    method: "POST",
    headers,
    body: JSON.stringify({ username }),
  });
  const response = await getFlareMoRuntime(c.env).auth.handler(request);
  if (response.ok) return;
  let message = "Better Auth rejected the username update";
  try {
    const payload = (await response.json()) as { message?: unknown };
    if (typeof payload.message === "string" && payload.message) {
      message = payload.message;
    }
  } catch {
    // Keep the stable compatibility error when Better Auth did not return JSON.
  }
  throw new CompatValidationError(message);
}
function connectNotificationToDto(notification: UserNotificationDto) {
  const sender = notification.senderUser;
  const senderUser = {
    name: sender.id,
    role: memosWireRole(sender),
    username: notification.senderUsername ?? sender.id.replace(/^users\//u, ""),
    email: notification.senderEmail ?? sender.email,
    displayName: sender.name,
    ...(sender.avatarUrl ? { avatarUrl: sender.avatarUrl } : {}),
    state: "NORMAL",
    createTime: sender.createdAt,
    updateTime: sender.updatedAt,
  };
  const payload = {
    memo: notification.memo,
    relatedMemo: notification.relatedMemo ?? "",
    memoSnippet: notification.memoSnippet,
    relatedMemoSnippet: notification.relatedMemoSnippet,
  };
  return {
    name: notification.name,
    sender: notification.sender,
    senderUser,
    status: notification.status === "unread" ? "UNREAD" : "ARCHIVED",
    createTime: notification.createTime,
    type:
      notification.type === "memo_comment" ? "MEMO_COMMENT" : "MEMO_MENTION",
    ...(notification.type === "memo_comment"
      ? { memoComment: payload }
      : { memoMention: payload }),
  };
}

function notificationStatusFromDto(value: unknown) {
  if (value === "UNREAD" || value === "unread") return "unread" as const;
  if (value === "ARCHIVED" || value === "archived") return "archived" as const;
  throw new CompatValidationError(
    "notification.status must be UNREAD or ARCHIVED",
  );
}
export async function createConnectUser(
  c: ConnectContext,
  db: ReturnType<typeof createDb>,
  input: {
    username: string;
    password: string;
    displayName: string;
    email: string;
  },
  limits: PlanLimits,
) {
  const { authUserId, user } = await registerCompatMember({
    env: c.env,
    db,
    limits,
    ...input,
  });
  return {
    authUserId,
    user,
    dto: currentUserToDto(user, await getAuthUserCached(db, authUserId)),
  };
}
