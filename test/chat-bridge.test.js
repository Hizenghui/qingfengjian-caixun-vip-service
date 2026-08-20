import assert from "node:assert/strict";
import test from "node:test";

import healthRoute from "../api/chat/health.js";
import messagesRoute from "../api/chat/messages.js";
import sessionRoute from "../api/chat/session.js";
import webhookRoute from "../api/telegram/webhook.js";

const originalFetch = globalThis.fetch;
const strings = new Map();
const lists = new Map();
const telegramMessages = [];

function redisResult(result) {
  return new Response(JSON.stringify({ result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function executeRedis(command) {
  const [nameValue, ...args] = command;
  const name = String(nameValue).toUpperCase();

  if (name === "PING") return "PONG";
  if (name === "GET") return strings.get(String(args[0])) ?? null;
  if (name === "DEL") {
    const deleted = strings.delete(String(args[0]));
    lists.delete(String(args[0]));
    return deleted ? 1 : 0;
  }
  if (name === "INCR") {
    const key = String(args[0]);
    const next = Number(strings.get(key) || 0) + 1;
    strings.set(key, String(next));
    return next;
  }
  if (name === "EXPIRE") return 1;
  if (name === "SET") {
    const [keyValue, value, ...options] = args;
    const key = String(keyValue);
    const normalizedOptions = options.map((option) => String(option).toUpperCase());
    if (normalizedOptions.includes("NX") && strings.has(key)) return null;
    strings.set(key, String(value));
    return "OK";
  }
  if (name === "RPUSH") {
    const key = String(args[0]);
    const list = lists.get(key) || [];
    list.push(...args.slice(1).map(String));
    lists.set(key, list);
    return list.length;
  }
  if (name === "LTRIM") {
    const key = String(args[0]);
    const list = lists.get(key) || [];
    const startValue = Number(args[1]);
    const endValue = Number(args[2]);
    const start = startValue < 0 ? Math.max(0, list.length + startValue) : startValue;
    const end = endValue < 0 ? list.length + endValue : endValue;
    lists.set(key, list.slice(start, end + 1));
    return "OK";
  }
  if (name === "LRANGE") {
    const key = String(args[0]);
    return [...(lists.get(key) || [])];
  }

  throw new Error(`Unsupported Redis command in test: ${name}`);
}

function installMockServices() {
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);

    if (url === "https://redis.test" || url === "https://redis.test/") {
      return redisResult(executeRedis(JSON.parse(init.body)));
    }

    if (url === "https://redis.test/pipeline") {
      const results = JSON.parse(init.body).map((command) => ({ result: executeRedis(command) }));
      return new Response(JSON.stringify(results), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("api.telegram.org") && url.endsWith("/sendMessage")) {
      const payload = JSON.parse(init.body);
      telegramMessages.push(payload);
      return new Response(
        JSON.stringify({ ok: true, result: { message_id: 501 + telegramMessages.length - 1 } }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unexpected request in test: ${url}`);
  };
}

function apiRequest(path, options = {}) {
  return new Request(`https://www.ifollow.me${path}`, {
    ...options,
    headers: {
      Origin: "https://www.ifollow.me",
      "x-forwarded-for": "203.0.113.8",
      ...options.headers,
    },
  });
}

test("visitor messages and Telegram replies complete the two-way bridge", { concurrency: false }, async (t) => {
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_CHAT_ID = "-1001234567890";
  process.env.TELEGRAM_WEBHOOK_SECRET = "telegram_webhook_secret_1234567890";
  process.env.CHAT_SIGNING_SECRET = "chat_signing_secret_that_is_long_enough_123456";
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
  process.env.UPSTASH_REDIS_REST_TOKEN = "redis-token";
  installMockServices();

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const healthResponse = await healthRoute.fetch(apiRequest("/api/chat/health"));
  assert.equal(healthResponse.status, 200);
  assert.equal((await healthResponse.json()).ok, true);

  const sessionResponse = await sessionRoute.fetch(
    apiRequest("/api/chat/session", { method: "POST", body: "{}" })
  );
  assert.equal(sessionResponse.status, 201);
  const session = await sessionResponse.json();
  assert.match(session.conversationId, /^[0-9a-f-]{36}$/i);
  assert.ok(session.token.length > 30);

  const clientMessageId = "cm_0123456789abcdef0123456789abcdef";
  const sendOptions = {
    method: "POST",
    headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      conversationId: session.conversationId,
      clientMessageId,
      message: "你好，我想了解年费服务。",
    }),
  };
  const sendResponse = await messagesRoute.fetch(apiRequest("/api/chat/messages", sendOptions));
  assert.equal(sendResponse.status, 201);
  assert.equal(telegramMessages.length, 1);
  assert.match(telegramMessages[0].text, /年费服务/);

  const duplicateResponse = await messagesRoute.fetch(apiRequest("/api/chat/messages", sendOptions));
  assert.equal(duplicateResponse.status, 200);
  assert.equal((await duplicateResponse.json()).duplicate, true);
  assert.equal(telegramMessages.length, 1);

  const invalidWebhook = await webhookRoute.fetch(
    apiRequest("/api/telegram/webhook", {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": "wrong-secret" },
      body: JSON.stringify({ update_id: 1 }),
    })
  );
  assert.equal(invalidWebhook.status, 401);

  const webhookResponse = await webhookRoute.fetch(
    apiRequest("/api/telegram/webhook", {
      method: "POST",
      headers: {
        "x-telegram-bot-api-secret-token": process.env.TELEGRAM_WEBHOOK_SECRET,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        update_id: 2001,
        message: {
          message_id: 800,
          date: 1_786_000_000,
          chat: { id: Number(process.env.TELEGRAM_CHAT_ID) },
          from: { id: 99, is_bot: false },
          reply_to_message: { message_id: 501 },
          text: "您好，年费服务包含禁言群和交流群。",
        },
      }),
    })
  );
  assert.equal(webhookResponse.status, 200);
  assert.equal((await webhookResponse.json()).status, "delivered");

  const query = new URLSearchParams({ conversationId: session.conversationId });
  const messagesResponse = await messagesRoute.fetch(
    apiRequest(`/api/chat/messages?${query}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    })
  );
  assert.equal(messagesResponse.status, 200);
  const payload = await messagesResponse.json();
  assert.deepEqual(payload.messages.map((message) => message.role), ["visitor", "support"]);
  assert.match(payload.messages[1].text, /禁言群和交流群/);
});
