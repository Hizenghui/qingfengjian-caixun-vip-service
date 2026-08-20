const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();

if (!token) {
  console.error("请先设置 TELEGRAM_BOT_TOKEN。\n");
  process.exit(1);
}

const endpoint = `https://api.telegram.org/bot${token}`;

async function call(method) {
  const response = await fetch(`${endpoint}/${method}`);
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.description || `${method} failed`);
  }
  return payload.result;
}

try {
  const bot = await call("getMe");
  const updates = await call("getUpdates");
  const chats = new Map();

  updates.forEach((update) => {
    const message = update.message || update.edited_message || update.channel_post;
    const chat = message?.chat;
    if (!chat?.id) return;
    chats.set(String(chat.id), {
      id: String(chat.id),
      type: chat.type || "unknown",
      title: chat.title || chat.username || [chat.first_name, chat.last_name].filter(Boolean).join(" ") || "未命名会话",
    });
  });

  console.log(`Telegram Bot：@${bot.username}`);
  if (chats.size === 0) {
    console.log("尚未发现会话。请将 Bot 加入私有客服群，并在群内发送 /start 后重试。");
    process.exit(2);
  }

  console.log("发现的会话：");
  chats.forEach((chat) => {
    console.log(`- ${chat.title} | ${chat.type} | ${chat.id}`);
  });
} catch (error) {
  console.error(`Telegram 检查失败：${error.message}`);
  process.exit(1);
}
