import { MAX_MESSAGE_LENGTH, assertChatConfigured, getChatConfig } from "../../lib/chat/config.js";
import {
  getBearerToken,
  getClientIp,
  isSameOrigin,
  json,
  methodNotAllowed,
  publicError,
  readJson,
} from "../../lib/chat/http.js";
import { consumeRateLimit } from "../../lib/chat/redis.js";
import { hashKeyPart, isClientMessageId, isConversationId, verifyConversation } from "../../lib/chat/security.js";
import {
  acquireClientMessage,
  commitVisitorMessage,
  getStoredClientMessage,
  listMessages,
  releaseClientMessage,
} from "../../lib/chat/store.js";
import { sendVisitorMessage } from "../../lib/chat/telegram.js";

function authenticate(request, config, conversationId) {
  return verifyConversation(conversationId, getBearerToken(request), config.signingSecret);
}

async function handleGet(request, config) {
  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId") || "";
  if (!isConversationId(conversationId) || !authenticate(request, config, conversationId)) {
    return json({ ok: false, error: "INVALID_SESSION" }, 401);
  }

  const afterValue = Number(url.searchParams.get("after") || 0);
  const after = Number.isFinite(afterValue) && afterValue > 0 ? Math.floor(afterValue) : 0;
  const messages = await listMessages(config, conversationId, after);
  return json({ ok: true, messages });
}

async function handlePost(request, config) {
  const body = await readJson(request);
  const conversationId = String(body.conversationId || "");
  const clientMessageId = String(body.clientMessageId || "");
  const text = String(body.message || "").trim();

  if (!isConversationId(conversationId) || !authenticate(request, config, conversationId)) {
    return json({ ok: false, error: "INVALID_SESSION" }, 401);
  }

  if (!isClientMessageId(clientMessageId) || !text || text.length > MAX_MESSAGE_LENGTH) {
    return json({ ok: false, error: "INVALID_MESSAGE" }, 400);
  }

  const existing = await getStoredClientMessage(config, conversationId, clientMessageId);
  if (existing) return json({ ok: true, message: existing, duplicate: true });

  const rateKey = hashKeyPart(`${conversationId}:${getClientIp(request)}`, config.signingSecret);
  await consumeRateLimit(config, `qfj:chat:rate:message:${rateKey}`, 10, 60);

  const acquired = await acquireClientMessage(config, conversationId, clientMessageId);
  if (!acquired) {
    return json({ ok: false, error: "MESSAGE_PENDING", retryAfter: 2 }, 409, { "Retry-After": "2" });
  }

  let telegramMessageId = null;

  try {
    const telegramMessage = await sendVisitorMessage(config, conversationId, text);
    telegramMessageId = telegramMessage.message_id;
    const message = {
      id: clientMessageId,
      role: "visitor",
      text,
      createdAt: Date.now(),
    };
    await commitVisitorMessage(config, conversationId, message, telegramMessageId);
    return json({ ok: true, message }, 201);
  } catch (error) {
    if (!telegramMessageId) {
      await releaseClientMessage(config, conversationId, clientMessageId).catch(() => {});
    }
    throw error;
  }
}

export default {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "POST") {
      return methodNotAllowed(["GET", "POST"]);
    }
    if (!isSameOrigin(request)) return json({ ok: false, error: "ORIGIN_NOT_ALLOWED" }, 403);

    try {
      const config = assertChatConfigured(getChatConfig());
      return request.method === "GET" ? handleGet(request, config) : handlePost(request, config);
    } catch (error) {
      return publicError(error);
    }
  },
};
