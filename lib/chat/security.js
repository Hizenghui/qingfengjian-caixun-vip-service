import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

const CONVERSATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_MESSAGE_ID_PATTERN = /^cm_[A-Za-z0-9_-]{16,80}$/;

export function createConversation(signingSecret) {
  const conversationId = randomUUID();
  return {
    conversationId,
    token: signConversation(conversationId, signingSecret),
  };
}

export function signConversation(conversationId, signingSecret) {
  return createHmac("sha256", signingSecret).update(conversationId).digest("base64url");
}

export function verifyConversation(conversationId, token, signingSecret) {
  if (!isConversationId(conversationId) || !token) return false;
  return safeEqual(signConversation(conversationId, signingSecret), token);
}

export function isConversationId(value) {
  return CONVERSATION_ID_PATTERN.test(String(value || ""));
}

export function isClientMessageId(value) {
  return CLIENT_MESSAGE_ID_PATTERN.test(String(value || ""));
}

export function createMessageId(prefix = "sm") {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(9).toString("base64url")}`;
}

export function hashKeyPart(value, signingSecret) {
  return createHmac("sha256", signingSecret).update(String(value || "unknown")).digest("hex").slice(0, 24);
}

export function hashText(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

export function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
