import { assertChatConfigured, getChatConfig } from "../../lib/chat/config.js";
import { json, methodNotAllowed, publicError, readJson } from "../../lib/chat/http.js";
import { createMessageId, isConversationId, safeEqual } from "../../lib/chat/security.js";
import {
  acquireTelegramUpdate,
  commitSupportMessage,
  completeTelegramUpdate,
  getConversationForTelegramMessage,
  releaseTelegramUpdate,
} from "../../lib/chat/store.js";

async function processUpdate(config, update) {
  const message = update?.message;
  if (!message || message.from?.is_bot) return "ignored";
  if (String(message.chat?.id || "") !== config.telegramChatId) return "ignored";

  const text = String(message.text || message.caption || "").trim();
  const repliedMessageId = message.reply_to_message?.message_id;
  if (!text || !repliedMessageId) return "ignored";

  const conversationId = await getConversationForTelegramMessage(config, repliedMessageId);
  if (!isConversationId(conversationId)) return "unmapped";

  const supportMessage = {
    id: createMessageId("sm"),
    role: "support",
    text,
    createdAt: Number(message.date || 0) * 1000 || Date.now(),
  };
  await commitSupportMessage(config, conversationId, supportMessage, message.message_id);
  return "delivered";
}

export default {
  async fetch(request) {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);

    try {
      const config = assertChatConfigured(getChatConfig());
      const secret = request.headers.get("x-telegram-bot-api-secret-token") || "";
      if (!safeEqual(secret, config.telegramWebhookSecret)) {
        return json({ ok: false, error: "INVALID_WEBHOOK_SECRET" }, 401);
      }

      const update = await readJson(request, 1_000_000);
      const updateId = Number(update.update_id);
      if (!Number.isSafeInteger(updateId)) return json({ ok: true, status: "ignored" });

      const acquired = await acquireTelegramUpdate(config, updateId);
      if (!acquired) return json({ ok: true, status: "duplicate" });

      try {
        const status = await processUpdate(config, update);
        await completeTelegramUpdate(config, updateId);
        return json({ ok: true, status });
      } catch (error) {
        await releaseTelegramUpdate(config, updateId).catch(() => {});
        throw error;
      }
    } catch (error) {
      return publicError(error);
    }
  },
};
