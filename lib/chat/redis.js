const REQUEST_TIMEOUT_MS = 5000;

function storageError(message) {
  const error = new Error(message);
  error.code = "STORAGE_UNAVAILABLE";
  return error;
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    throw storageError(`Redis request failed with status ${response.status}`);
  }
  return payload;
}

export async function redisCommand(config, command) {
  try {
    const response = await fetch(config.redisUrl.replace(/\/$/, ""), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.redisToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const payload = await parseResponse(response);
    if (payload.error) throw storageError("Redis command was rejected");
    return payload.result;
  } catch (error) {
    if (error?.code === "STORAGE_UNAVAILABLE") throw error;
    throw storageError("Redis request could not be completed");
  }
}

export async function redisPipeline(config, commands) {
  try {
    const response = await fetch(`${config.redisUrl.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.redisToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const payload = await parseResponse(response);
    if (!Array.isArray(payload) || payload.some((item) => item?.error)) {
      throw storageError("Redis pipeline was rejected");
    }
    return payload.map((item) => item.result);
  } catch (error) {
    if (error?.code === "STORAGE_UNAVAILABLE") throw error;
    throw storageError("Redis pipeline could not be completed");
  }
}

export async function consumeRateLimit(config, key, limit, windowSeconds) {
  const [count] = await redisPipeline(config, [
    ["INCR", key],
    ["EXPIRE", key, windowSeconds],
  ]);

  if (Number(count) > limit) {
    const error = new Error("Rate limit exceeded");
    error.code = "RATE_LIMITED";
    error.retryAfter = windowSeconds;
    throw error;
  }

  return Number(count);
}
