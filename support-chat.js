const panel = document.querySelector("[data-support-chat]");
const backdrop = document.querySelector(".support-chat-backdrop");
const closeButtons = Array.from(document.querySelectorAll("[data-chat-close]"));
const statusText = document.querySelector("[data-chat-status]");
const messagesElement = document.querySelector("[data-chat-messages]");
const scrollElement = document.querySelector("[data-chat-scroll]");
const noticeElement = document.querySelector("[data-chat-notice]");
const form = document.querySelector("[data-chat-form]");
const input = document.querySelector("[data-chat-input]");
const sendButton = document.querySelector("[data-chat-send]");

const STORAGE_KEY = "qfj_support_session_v1";
const SESSION_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const welcomeMessage = {
  id: "welcome",
  role: "support",
  text: "你好，欢迎咨询青峰见财讯VIP服务。请留下你的问题，我们会尽快回复。",
  createdAt: Date.now(),
};

const state = {
  open: false,
  initialized: false,
  session: null,
  messages: new Map([[welcomeMessage.id, welcomeMessage]]),
  pollTimer: 0,
  pollFailures: 0,
  requestInFlight: false,
};

function readStoredSession() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!SESSION_PATTERN.test(value?.conversationId || "") || !value?.token) return null;
    return value;
  } catch {
    return null;
  }
}

function storeSession(session) {
  state.session = session;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Private browsing can make storage unavailable; the in-memory session still works.
  }
}

function clearSession() {
  state.session = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing else is required when storage is unavailable.
  }
}

function setStatus(label, mode = "connecting") {
  if (statusText) statusText.textContent = label;
  panel?.setAttribute("data-chat-state", mode);
}

function showNotice(message, tone = "neutral") {
  if (!noticeElement) return;
  noticeElement.textContent = message;
  noticeElement.dataset.tone = tone;
  noticeElement.hidden = !message;
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatTime(timestamp) {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(timestamp));
  } catch {
    return "";
  }
}

function messageNode(message) {
  const article = createElement("article", `support-message is-${message.role}`);
  article.dataset.messageId = message.id;
  const bubble = createElement("div", "support-message-bubble", message.text);
  const meta = createElement("div", "support-message-meta");
  const time = createElement("time", "", formatTime(message.createdAt));
  time.dateTime = new Date(message.createdAt).toISOString();
  meta.appendChild(time);

  if (message.status === "sending") {
    meta.appendChild(createElement("span", "support-message-state", "发送中"));
  }

  if (message.status === "failed") {
    const retry = createElement("button", "support-message-retry", "重新发送");
    retry.type = "button";
    retry.dataset.retryMessage = message.id;
    meta.appendChild(retry);
  }

  article.append(bubble, meta);
  return article;
}

function renderMessages(forceScroll = false) {
  if (!messagesElement || !scrollElement) return;
  const nearBottom = scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight < 90;
  const messages = Array.from(state.messages.values()).sort((left, right) => left.createdAt - right.createdAt);
  const fragment = document.createDocumentFragment();
  messages.forEach((message) => fragment.appendChild(messageNode(message)));
  messagesElement.replaceChildren(fragment);

  if (forceScroll || nearBottom) {
    window.requestAnimationFrame(() => {
      scrollElement.scrollTop = scrollElement.scrollHeight;
    });
  }
}

function mergeMessages(messages) {
  let changed = false;
  messages.forEach((message) => {
    if (!message?.id || !message?.text || !["visitor", "support"].includes(message.role)) return;
    const previous = state.messages.get(message.id);
    const next = { ...message, status: undefined };
    if (!previous || previous.status || previous.text !== next.text) changed = true;
    state.messages.set(message.id, next);
  });
  if (changed) renderMessages();
  return changed;
}

function createClientMessageId() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `cm_${value}`;
}

async function requestJson(url, options = {}, timeout = 10_000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      const error = new Error(payload.error || "REQUEST_FAILED");
      error.code = payload.error || "REQUEST_FAILED";
      error.status = response.status;
      error.retryAfter = payload.retryAfter;
      throw error;
    }
    return payload;
  } finally {
    window.clearTimeout(timer);
  }
}

async function createSession() {
  const payload = await requestJson("/api/chat/session", { method: "POST", body: "{}" });
  const session = { conversationId: payload.conversationId, token: payload.token };
  storeSession(session);
  return session;
}

async function ensureSession() {
  if (state.session) return state.session;
  const stored = readStoredSession();
  if (stored) {
    state.session = stored;
    return stored;
  }
  return createSession();
}

function authorizationHeaders() {
  return { Authorization: `Bearer ${state.session.token}` };
}

function latestServerTimestamp() {
  return Math.max(
    0,
    ...Array.from(state.messages.values())
      .filter((message) => message.id !== "welcome" && message.status !== "failed")
      .map((message) => Number(message.createdAt) || 0)
  );
}

async function fetchMessages() {
  const session = await ensureSession();
  const after = Math.max(0, latestServerTimestamp() - 5000);
  const query = new URLSearchParams({ conversationId: session.conversationId, after: String(after) });

  try {
    const payload = await requestJson(`/api/chat/messages?${query}`, {
      headers: authorizationHeaders(),
    });
    return mergeMessages(payload.messages || []);
  } catch (error) {
    if (error.status === 401) {
      clearSession();
      await createSession();
      return false;
    }
    throw error;
  }
}

function schedulePoll(delay) {
  window.clearTimeout(state.pollTimer);
  if (!state.open) return;
  state.pollTimer = window.setTimeout(pollMessages, delay);
}

async function pollMessages() {
  if (!state.open || state.requestInFlight) return;
  if (document.visibilityState === "hidden" || !navigator.onLine) {
    schedulePoll(8000);
    return;
  }

  state.requestInFlight = true;
  try {
    const changed = await fetchMessages();
    state.pollFailures = 0;
    setStatus("消息通道已连接", "online");
    schedulePoll(changed ? 3500 : 7000);
  } catch {
    state.pollFailures += 1;
    setStatus("正在重新连接", "connecting");
    schedulePoll(Math.min(18_000, 5000 + state.pollFailures * 2500));
  } finally {
    state.requestInFlight = false;
  }
}

async function initializeChat() {
  if (state.initialized) {
    schedulePoll(800);
    return;
  }

  state.initialized = true;
  setStatus("正在连接", "connecting");
  showNotice("");

  try {
    await ensureSession();
    await fetchMessages();
    setStatus("消息通道已连接", "online");
    schedulePoll(4500);
  } catch (error) {
    state.initialized = false;
    setStatus("暂时无法连接", "offline");
    showNotice(
      error.code === "SERVICE_NOT_CONFIGURED"
        ? "在线客服正在接入中，请先通过下方 Telegram 联系。"
        : "连接暂时中断，请检查网络后重试。",
      "error"
    );
  }
}

function resizeInput() {
  if (!input) return;
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 96)}px`;
}

async function submitMessage(message) {
  const session = await ensureSession();
  message.status = "sending";
  state.messages.set(message.id, message);
  renderMessages(true);
  showNotice("");
  if (sendButton) sendButton.disabled = true;

  try {
    const payload = await requestJson("/api/chat/messages", {
      method: "POST",
      headers: authorizationHeaders(),
      body: JSON.stringify({
        conversationId: session.conversationId,
        clientMessageId: message.id,
        message: message.text,
      }),
    });
    state.messages.set(message.id, { ...payload.message, status: undefined });
    setStatus("消息通道已连接", "online");
    renderMessages(true);
    schedulePoll(2500);
  } catch (error) {
    message.status = "failed";
    state.messages.set(message.id, message);
    renderMessages(true);
    setStatus(navigator.onLine ? "发送失败" : "网络已断开", "offline");
    showNotice(
      error.code === "RATE_LIMITED" ? "发送较频繁，请稍后再试。" : "消息未发送，请重试或通过 Telegram 联系。",
      "error"
    );
  } finally {
    if (sendButton) sendButton.disabled = false;
  }
}

function closeSupportChat() {
  if (!state.open || !panel) return;
  state.open = false;
  window.clearTimeout(state.pollTimer);
  panel.classList.remove("is-open");
  backdrop?.classList.remove("is-open");
  panel.setAttribute("aria-hidden", "true");
  document.body.classList.remove("support-chat-open");
  window.setTimeout(() => {
    if (state.open) return;
    panel.hidden = true;
    if (backdrop) backdrop.hidden = true;
  }, 190);
}

export function openSupportChat() {
  if (!panel) return;
  state.open = true;
  panel.hidden = false;
  if (backdrop) backdrop.hidden = false;
  panel.setAttribute("aria-hidden", "false");
  document.body.classList.add("support-chat-open");
  renderMessages(true);

  window.requestAnimationFrame(() => {
    panel.classList.add("is-open");
    backdrop?.classList.add("is-open");
    window.setTimeout(() => input?.focus({ preventScroll: true }), 180);
  });

  initializeChat();
}

closeButtons.forEach((button) => button.addEventListener("click", closeSupportChat));

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input?.value.trim() || "";
  if (!text) return;
  const message = {
    id: createClientMessageId(),
    role: "visitor",
    text,
    createdAt: Date.now(),
  };
  input.value = "";
  resizeInput();
  submitMessage(message);
});

input?.addEventListener("input", resizeInput);
input?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    form?.requestSubmit();
  }
});

messagesElement?.addEventListener("click", (event) => {
  const retryButton = event.target.closest("[data-retry-message]");
  if (!retryButton) return;
  const message = state.messages.get(retryButton.dataset.retryMessage);
  if (message) submitMessage(message);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.open) closeSupportChat();
});

document.addEventListener("visibilitychange", () => {
  if (state.open && document.visibilityState === "visible") schedulePoll(400);
});

window.addEventListener("online", () => {
  if (state.open) {
    setStatus("正在重新连接", "connecting");
    schedulePoll(200);
  }
});

window.addEventListener("offline", () => {
  if (state.open) setStatus("网络已断开", "offline");
});
