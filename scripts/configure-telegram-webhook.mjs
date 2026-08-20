const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const secret = String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
const siteUrl = String(process.env.SITE_URL || "https://www.ifollow.me").trim().replace(/\/$/, "");

if (!token || !secret) {
  console.error("请先设置 TELEGRAM_BOT_TOKEN 和 TELEGRAM_WEBHOOK_SECRET。\n");
  process.exit(1);
}

if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
  console.error("TELEGRAM_WEBHOOK_SECRET 只能包含字母、数字、下划线和连字符。\n");
  process.exit(1);
}

const endpoint = `https://api.telegram.org/bot${token}`;
const webhookUrl = `${siteUrl}/api/telegram/webhook`;

async function call(method, payload = {}) {
  const response = await fetch(`${endpoint}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(result.description || `${method} failed`);
  }
  return result.result;
}

try {
  const bot = await call("getMe");
  await call("setWebhook", {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
  const info = await call("getWebhookInfo");
  console.log(`Telegram Bot：@${bot.username}`);
  console.log(`Webhook：${info.url}`);
  console.log(`待处理更新：${info.pending_update_count}`);
} catch (error) {
  console.error(`Webhook 配置失败：${error.message}`);
  process.exit(1);
}
