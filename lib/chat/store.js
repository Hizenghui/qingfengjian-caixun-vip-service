import { CHAT_TTL_SECONDS, MAX_MESSAGES } from "./config.js";
import { redisCommand, redisPipeline } from "./redis.js";

const PREFIX = "qfj:chat";

function messagesKey(conversationId) {
  return `${PREFIX}:messages:${conversationId}`;
}

function telegramMessageKey(messageId) {
  return `${PREFIX}:telegram:${messageId}`;
}

function clientMessageKey(conversationId, clientMessageId) {
  return `${PREFIX}:client:${conversationId}:${clientMessageId}`;
}

function updateKey(updateId) {
  return `${PREFIX}:update:${updateId}`;
}

function parseStoredMessage(value) {
  if (!value || value === "pending") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function listMessages(config, conversationId, after = 0) {
  const values = await redisCommand(config, ["LRANGE", messagesKey(conversationId), 0, -1]);
  if (!Array.isArray(values)) return [];

  return values
    .map(parseStoredMessage)
    .filter(Boolean)
    .filter((message) => Number(message.createdAt) > after)
    .slice(-MAX_MESSAGES);
}

export async function getStoredClientMessage(config, conversationId, clientMessageId) {
  const value = await redisCommand(config, ["GET", clientMessageKey(conversationId, clientMessageId)]);
  return parseStoredMessage(value);
}

export async function acquireClientMessage(config, conversationId, clientMessageId) {
  const result = await redisCommand(config, [
    "SET",
    clientMessageKey(conversationId, clientMessageId),
    "pending",
    "NX",
    "EX",
    60,
  ]);
  return result === "OK";
}

export async function releaseClientMessage(config, conversationId, clientMessageId) {
  await redisCommand(config, ["DEL", clientMessageKey(conversationId, clientMessageId)]);
}

export async function commitVisitorMessage(config, conversationId, message, telegramMessageId) {
  const serialized = JSON.stringify(message);
  const key = messagesKey(conversationId);
  await redisPipeline(config, [
    ["RPUSH", key, serialized],
    ["LTRIM", key, -MAX_MESSAGES, -1],
    ["EXPIRE", key, CHAT_TTL_SECONDS],
    ["SET", telegramMessageKey(telegramMessageId), conversationId, "EX", CHAT_TTL_SECONDS],
    ["SET", clientMessageKey(conversationId, message.id), serialized, "EX", CHAT_TTL_SECONDS],
  ]);
}

export async function getConversationForTelegramMessage(config, telegramMessageId) {
  return redisCommand(config, ["GET", telegramMessageKey(telegramMessageId)]);
}

export async function commitSupportMessage(config, conversationId, message, telegramMessageId) {
  const key = messagesKey(conversationId);
  await redisPipeline(config, [
    ["RPUSH", key, JSON.stringify(message)],
    ["LTRIM", key, -MAX_MESSAGES, -1],
    ["EXPIRE", key, CHAT_TTL_SECONDS],
    ["SET", telegramMessageKey(telegramMessageId), conversationId, "EX", CHAT_TTL_SECONDS],
  ]);
}

export async function acquireTelegramUpdate(config, updateId) {
  const result = await redisCommand(config, ["SET", updateKey(updateId), "processing", "NX", "EX", 60]);
  return result === "OK";
}

export async function completeTelegramUpdate(config, updateId) {
  await redisCommand(config, ["SET", updateKey(updateId), "done", "EX", CHAT_TTL_SECONDS]);
}

export async function releaseTelegramUpdate(config, updateId) {
  await redisCommand(config, ["DEL", updateKey(updateId)]);
}
