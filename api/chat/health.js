import { assertChatConfigured, getChatConfig } from "../../lib/chat/config.js";
import { json, methodNotAllowed, publicError } from "../../lib/chat/http.js";
import { redisCommand } from "../../lib/chat/redis.js";

export default {
  async fetch(request) {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);

    try {
      const config = assertChatConfigured(getChatConfig());
      await redisCommand(config, ["PING"]);
      return json({ ok: true, service: "telegram-support-bridge", version: "1.3.0" });
    } catch (error) {
      return publicError(error);
    }
  },
};
