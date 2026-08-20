export const CHAT_TTL_SECONDS = 7 * 24 * 60 * 60;
export const MAX_MESSAGES = 200;
export const MAX_MESSAGE_LENGTH = 1000;

function clean(value) {
  return String(value || "").trim();
}

export function getChatConfig() {
  return {
    telegramBotToken: clean(process.env.TELEGRAM_BOT_TOKEN),
    telegramChatId: clean(process.env.TELEGRAM_CHAT_ID),
    telegramMessageThreadId: clean(process.env.TELEGRAM_MESSAGE_THREAD_ID),
    telegramWebhookSecret: clean(process.env.TELEGRAM_WEBHOOK_SECRET),
    signingSecret: clean(process.env.CHAT_SIGNING_SECRET),
    redisUrl: clean(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL),
    redisToken: clean(process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN),
    siteUrl: clean(process.env.SITE_URL) || "https://www.ifollow.me",
  };
}

export function getMissingConfig(config = getChatConfig()) {
  const missing = [];

  if (!config.telegramBotToken) missing.push("TELEGRAM_BOT_TOKEN");
  if (!config.telegramChatId) missing.push("TELEGRAM_CHAT_ID");
  if (!config.telegramWebhookSecret) missing.push("TELEGRAM_WEBHOOK_SECRET");
  if (!config.signingSecret) missing.push("CHAT_SIGNING_SECRET");
  if (!config.redisUrl) missing.push("UPSTASH_REDIS_REST_URL");
  if (!config.redisToken) missing.push("UPSTASH_REDIS_REST_TOKEN");

  return missing;
}

export function assertChatConfigured(config = getChatConfig()) {
  const missing = getMissingConfig(config);
  if (missing.length > 0) {
    const error = new Error(`Chat service configuration is incomplete: ${missing.join(", ")}`);
    error.code = "SERVICE_NOT_CONFIGURED";
    error.missing = missing;
    throw error;
  }

  if (!/^[A-Za-z0-9_-]{1,256}$/.test(config.telegramWebhookSecret)) {
    const error = new Error("TELEGRAM_WEBHOOK_SECRET contains unsupported characters");
    error.code = "SERVICE_NOT_CONFIGURED";
    throw error;
  }

  if (config.signingSecret.length < 32) {
    const error = new Error("CHAT_SIGNING_SECRET must contain at least 32 characters");
    error.code = "SERVICE_NOT_CONFIGURED";
    throw error;
  }

  return config;
}
