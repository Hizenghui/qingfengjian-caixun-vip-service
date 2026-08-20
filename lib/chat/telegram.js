const TELEGRAM_TIMEOUT_MS = 7000;

function telegramError(message) {
  const error = new Error(message);
  error.code = "TELEGRAM_UNAVAILABLE";
  return error;
}

export async function telegramCall(config, method, payload) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok) {
      throw telegramError(`Telegram ${method} request failed`);
    }
    return result.result;
  } catch (error) {
    if (error?.code === "TELEGRAM_UNAVAILABLE") throw error;
    throw telegramError(`Telegram ${method} request could not be completed`);
  }
}

export async function sendVisitorMessage(config, conversationId, text) {
  const payload = {
    chat_id: config.telegramChatId,
    text: [
      "网站在线咨询",
      `会话：${conversationId.slice(0, 8)}`,
      "",
      text,
      "",
      "请直接回复本条消息，回复内容会同步到访客网页。",
    ].join("\n"),
    link_preview_options: { is_disabled: true },
  };

  if (config.telegramMessageThreadId) {
    payload.message_thread_id = Number(config.telegramMessageThreadId);
  }

  return telegramCall(config, "sendMessage", payload);
}
