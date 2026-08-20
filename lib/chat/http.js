const DEFAULT_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...DEFAULT_HEADERS, ...headers },
  });
}

export function methodNotAllowed(allowed) {
  return json(
    { ok: false, error: "METHOD_NOT_ALLOWED" },
    405,
    { Allow: allowed.join(", ") }
  );
}

export function isSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function readJson(request, maxBytes = 12_000) {
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > maxBytes) {
    const error = new Error("Request body is too large");
    error.code = "PAYLOAD_TOO_LARGE";
    throw error;
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    const error = new Error("Request body is too large");
    error.code = "PAYLOAD_TOO_LARGE";
    throw error;
  }

  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    const error = new Error("Request body is not valid JSON");
    error.code = "INVALID_JSON";
    throw error;
  }
}

export function getBearerToken(request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

export function getClientIp(request) {
  return (
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    request.headers.get("x-real-ip") ||
    "unknown"
  ).trim();
}

export function publicError(error) {
  if (error?.code === "SERVICE_NOT_CONFIGURED") {
    return json({ ok: false, error: "SERVICE_NOT_CONFIGURED" }, 503);
  }

  if (error?.code === "PAYLOAD_TOO_LARGE") {
    return json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, 413);
  }

  if (error?.code === "INVALID_JSON") {
    return json({ ok: false, error: "INVALID_JSON" }, 400);
  }

  if (error?.code === "RATE_LIMITED") {
    return json(
      { ok: false, error: "RATE_LIMITED", retryAfter: error.retryAfter || 60 },
      429,
      { "Retry-After": String(error.retryAfter || 60) }
    );
  }

  if (error?.code === "TELEGRAM_UNAVAILABLE" || error?.code === "STORAGE_UNAVAILABLE") {
    return json({ ok: false, error: "SERVICE_TEMPORARILY_UNAVAILABLE" }, 503);
  }

  return json({ ok: false, error: "INTERNAL_ERROR" }, 500);
}
