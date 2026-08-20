import { assertChatConfigured, getChatConfig } from "../../lib/chat/config.js";
import { getClientIp, isSameOrigin, json, methodNotAllowed, publicError } from "../../lib/chat/http.js";
import { consumeRateLimit } from "../../lib/chat/redis.js";
import { createConversation, hashKeyPart } from "../../lib/chat/security.js";

export default {
  async fetch(request) {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    if (!isSameOrigin(request)) return json({ ok: false, error: "ORIGIN_NOT_ALLOWED" }, 403);

    try {
      const config = assertChatConfigured(getChatConfig());
      const ipKey = hashKeyPart(getClientIp(request), config.signingSecret);
      await consumeRateLimit(config, `qfj:chat:rate:session:${ipKey}`, 12, 60 * 60);

      return json({ ok: true, ...createConversation(config.signingSecret) }, 201);
    } catch (error) {
      return publicError(error);
    }
  },
};
