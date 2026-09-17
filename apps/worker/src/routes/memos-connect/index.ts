import { currentUserToDto } from "@flaremo/memos";
import { Hono } from "hono";
import {
  assertRequestCredentialBoundary,
  getOptionalRequestContext,
  getRequestContext,
  type HonoBindings,
} from "../../context";
import {
  decodeBinaryRequest,
  detectBinaryTransport,
} from "../../memos-protobuf";
import { connectAttachmentMethod } from "./attachment-methods";
import {
  connectAuthRefresh,
  connectAuthSignIn,
  connectAuthSignOut,
  connectAuthSignUp,
} from "./auth-methods";
import {
  connectIdentityProviderMethod,
  connectInstanceMethod,
} from "./instance-methods";
import {
  connectBatchGetLinkMetadata,
  connectGetLinkMetadata,
  connectGetSharedMemo,
  connectPublicMemoRead,
  createConnectMemo,
  createConnectMemoComment,
  createConnectMemoShare,
  deleteConnectMemo,
  deleteConnectMemoReaction,
  deleteConnectMemoShare,
  getConnectMemo,
  isPublicMemoReadMethod,
  listConnectAttachments,
  listConnectMemoComments,
  listConnectMemoReactions,
  listConnectMemoShares,
  listConnectMemos,
  listConnectRelations,
  setConnectAttachments,
  setConnectRelations,
  updateConnectMemo,
  upsertConnectMemoReaction,
} from "./memo-methods";
import {
  type ConnectRequestContext,
  getAuthUserForContext,
  getPublicInstanceContext,
} from "./shared";
import { connectShortcutMethod } from "./shortcut-methods";
import {
  connectError,
  connectErrorForTransport,
  connectErrorFrom,
  connectValue,
} from "./transport";
import { connectUserMethod } from "./user-methods";

/**
 * Connect's JSON protocol is HTTP unary RPC: the request and response body are
 * the protobuf-JSON message itself.  It is separate from the REST adapter so
 * Connect clients can use the canonical service/method paths without relying
 * on a vendor header or a REST-shaped URL.
 *
 * The core MemoService supports Connect JSON plus protobuf unary frames for
 * Connect, gRPC, and gRPC-Web. Service coverage remains explicit below so an
 * unimplemented upstream RPC cannot be mistaken for a generic transport win.
 */
export const memosConnectApi = new Hono<HonoBindings>();

const memoService = "memos.api.v1.MemoService";

memosConnectApi.post("/:service/:method", async (c) => {
  const contentType = c.req.header("content-type")?.toLowerCase() ?? "";
  const binaryTransport = detectBinaryTransport(contentType);
  if (!contentType.includes("application/json") && !binaryTransport) {
    return connectError(
      c,
      "unsupported_media_type",
      "Connect JSON or protobuf is required",
      415,
    );
  }

  let body: unknown;
  try {
    body = binaryTransport
      ? decodeBinaryRequest(
          c.req.param("service"),
          c.req.param("method"),
          new Uint8Array(await c.req.raw.arrayBuffer()),
          binaryTransport,
        )
      : await c.req.json();
  } catch (error) {
    if (binaryTransport) {
      return connectErrorFrom(c, error, binaryTransport);
    }
    return connectError(
      c,
      "invalid_argument",
      "Request body must be JSON",
      400,
    );
  }

  try {
    assertRequestCredentialBoundary(c);
    const service = c.req.param("service") ?? "";
    const method = c.req.param("method") ?? "";
    if (service === "memos.api.v1.AuthService" && method === "SignIn") {
      return connectAuthSignIn(c, body, binaryTransport);
    }
    if (service === "memos.api.v1.AuthService" && method === "SignUp") {
      return await connectAuthSignUp(c, body, binaryTransport);
    }
    if (service === "memos.api.v1.AuthService" && method === "RefreshToken") {
      return connectAuthRefresh(c, binaryTransport);
    }
    if (
      service === memoService &&
      (method === "GetMemoByShare" || method === "GetSharedMemo")
    ) {
      return await connectGetSharedMemo(c, body, binaryTransport);
    }
    if (service === memoService && isPublicMemoReadMethod(method)) {
      return await connectPublicMemoRead(
        c,
        await getOptionalRequestContext(c),
        method,
        body,
        binaryTransport,
      );
    }
    if (
      service === "memos.api.v1.IdentityProviderService" &&
      method === "ListIdentityProviders"
    ) {
      return connectValue(c, { identityProviders: [] }, binaryTransport);
    }
    if (
      service === "memos.api.v1.InstanceService" &&
      [
        "GetInstanceProfile",
        "GetInstanceSetting",
        "BatchGetInstanceSettings",
      ].includes(method)
    ) {
      const optionalContext = await getOptionalRequestContext(c);
      return await connectInstanceMethod(
        c,
        optionalContext.user
          ? (optionalContext as ConnectRequestContext)
          : await getPublicInstanceContext(c),
        method,
        body,
        binaryTransport,
      );
    }
    const context = await getRequestContext(c);
    // Server-side URL fetching is a probing primitive; keep it behind auth.
    if (service === memoService && method === "GetLinkMetadata") {
      return await connectGetLinkMetadata(c, body, binaryTransport);
    }
    if (service === memoService && method === "BatchGetLinkMetadata") {
      return await connectBatchGetLinkMetadata(c, body, binaryTransport);
    }
    if (service === "memos.api.v1.AuthService" && method === "GetCurrentUser") {
      const authUser = await getAuthUserForContext(context);
      return connectValue(
        c,
        { user: currentUserToDto(context.user, authUser) },
        binaryTransport,
      );
    }
    if (service === "memos.api.v1.AuthService" && method === "SignOut") {
      return connectAuthSignOut(c, context, binaryTransport);
    }
    if (service === "memos.api.v1.AttachmentService") {
      return await connectAttachmentMethod(
        c,
        context,
        method,
        body,
        binaryTransport,
      );
    }
    if (service === "memos.api.v1.UserService") {
      return await connectUserMethod(c, context, method, body, binaryTransport);
    }
    if (service === "memos.api.v1.InstanceService") {
      return await connectInstanceMethod(
        c,
        context,
        method,
        body,
        binaryTransport,
      );
    }
    if (service === "memos.api.v1.IdentityProviderService") {
      return await connectIdentityProviderMethod(
        c,
        context,
        method,
        body,
        binaryTransport,
      );
    }
    if (service === "memos.api.v1.AIService") {
      return connectErrorForTransport(
        c,
        binaryTransport,
        "unimplemented",
        "AI transcription is not configured on FlareMo",
        501,
      );
    }
    if (service === "memos.api.v1.ShortcutService") {
      return await connectShortcutMethod(
        c,
        context,
        method,
        body,
        binaryTransport,
      );
    }
    if (service !== memoService) {
      return connectErrorForTransport(
        c,
        binaryTransport,
        "unimplemented",
        `Memos Connect service is not implemented: ${service}`,
        501,
      );
    }
    switch (method) {
      case "CreateMemo":
        return connectValue(
          c,
          await createConnectMemo(context, body),
          binaryTransport,
        );
      case "ListMemos":
        return connectValue(
          c,
          await listConnectMemos(context, body),
          binaryTransport,
        );
      case "GetMemo":
        return connectValue(
          c,
          await getConnectMemo(context, body),
          binaryTransport,
        );
      case "UpdateMemo":
        return connectValue(
          c,
          await updateConnectMemo(context, body),
          binaryTransport,
        );
      case "DeleteMemo":
        await deleteConnectMemo(context, c.env, body);
        return connectValue(c, {}, binaryTransport);
      case "SetMemoAttachments":
        await setConnectAttachments(context, body);
        return connectValue(c, {}, binaryTransport);
      case "ListMemoAttachments":
        return connectValue(
          c,
          await listConnectAttachments(context, body),
          binaryTransport,
        );
      case "SetMemoRelations":
        await setConnectRelations(context, body);
        return connectValue(c, {}, binaryTransport);
      case "ListMemoRelations":
        return connectValue(
          c,
          await listConnectRelations(context, body),
          binaryTransport,
        );
      case "CreateMemoComment":
        return connectValue(
          c,
          await createConnectMemoComment(context, body),
          binaryTransport,
        );
      case "ListMemoComments":
        return connectValue(
          c,
          await listConnectMemoComments(context, body),
          binaryTransport,
        );
      case "ListMemoReactions":
        return connectValue(
          c,
          await listConnectMemoReactions(context, body),
          binaryTransport,
        );
      case "UpsertMemoReaction":
        return connectValue(
          c,
          await upsertConnectMemoReaction(context, body),
          binaryTransport,
        );
      case "DeleteMemoReaction":
        await deleteConnectMemoReaction(context, body);
        return connectValue(c, {}, binaryTransport);
      case "CreateMemoShare":
        return connectValue(
          c,
          await createConnectMemoShare(context, body),
          binaryTransport,
        );
      case "ListMemoShares":
        return connectValue(
          c,
          await listConnectMemoShares(context, body),
          binaryTransport,
        );
      case "DeleteMemoShare":
        await deleteConnectMemoShare(context, body);
        return connectValue(c, {}, binaryTransport);
      default:
        return connectErrorForTransport(
          c,
          binaryTransport,
          "unimplemented",
          `Memos Connect method is not implemented: ${method}`,
          501,
        );
    }
  } catch (error) {
    if (binaryTransport) return connectErrorFrom(c, error, binaryTransport);
    return connectErrorFrom(c, error);
  }
});
