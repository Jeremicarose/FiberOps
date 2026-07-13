const DEFAULT_MAX_JSON_BODY_BYTES = 64 * 1024;

function parseBooleanValue(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return undefined;
}

export const REQUEST_POLICY_ERROR_CODES = {
  INVALID_CONTENT_TYPE: "INVALID_CONTENT_TYPE",
  REQUEST_TOO_LARGE: "REQUEST_TOO_LARGE",
  INVALID_REQUEST: "INVALID_REQUEST",
  LIVE_ENDPOINT_NOT_ALLOWED: "LIVE_ENDPOINT_NOT_ALLOWED",
  INSECURE_TOKEN_TRANSPORT: "INSECURE_TOKEN_TRANSPORT",
  REQUEST_ABORTED: "REQUEST_ABORTED"
};

export class RequestPolicyError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "RequestPolicyError";
    Object.assign(this, details);
  }
}

export function createRequestPolicy(overrides = {}) {
  return {
    maxJsonBodyBytes:
      Number(overrides.maxJsonBodyBytes) > 0
        ? Number(overrides.maxJsonBodyBytes)
        : DEFAULT_MAX_JSON_BODY_BYTES,
    allowExternalLiveEndpoints:
      parseBooleanValue(overrides.allowExternalLiveEndpoints) ?? false,
    allowInsecureTokenForwarding:
      parseBooleanValue(overrides.allowInsecureTokenForwarding) ?? false,
    routeProbeEnabled: parseBooleanValue(overrides.routeProbeEnabled) ?? true
  };
}

export async function readJsonBody(request, options = {}) {
  const maxBytes =
    Number(options.maxBytes) > 0
      ? Number(options.maxBytes)
      : DEFAULT_MAX_JSON_BODY_BYTES;
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;

    if (totalBytes > maxBytes) {
      throw new RequestPolicyError(
        `Request body exceeds the ${maxBytes} byte limit.`,
        {
          code: REQUEST_POLICY_ERROR_CODES.REQUEST_TOO_LARGE,
          statusCode: 413,
          details: {
            maxBytes,
            receivedBytes: totalBytes
          }
        }
      );
    }

    chunks.push(buffer);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");

  try {
    return rawBody ? JSON.parse(rawBody) : {};
  } catch (error) {
    throw new RequestPolicyError(
      `Request body must be valid JSON: ${error.message}`,
      {
        code: REQUEST_POLICY_ERROR_CODES.INVALID_REQUEST,
        statusCode: 400
      }
    );
  }
}

export function requireJsonContentType(request) {
  const contentType = String(request.headers?.["content-type"] || "");
  const mediaType = contentType.split(";")[0].trim().toLowerCase();

  if (mediaType === "application/json") {
    return;
  }

  throw new RequestPolicyError(
    'This endpoint requires content-type "application/json".',
    {
      code: REQUEST_POLICY_ERROR_CODES.INVALID_CONTENT_TYPE,
      statusCode: 415,
      details: {
        expected: "application/json",
        received: contentType || null
      }
    }
  );
}

export function validateLiveEndpointPolicy(payload, policy, options = {}) {
  const endpoint = normalizeEndpoint(
    payload.endpoint || options.defaultEndpoint
  );
  const token = typeof payload.token === "string" ? payload.token.trim() : "";

  if (!endpoint) {
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(endpoint);
  } catch {
    return;
  }

  const isLoopback = isLoopbackAddress(parsedUrl.hostname);
  const isSecureTransport = parsedUrl.protocol === "https:" || isLoopback;

  if (!isLoopback && !policy.allowExternalLiveEndpoints) {
    throw new RequestPolicyError(
      "Live diagnostics only allow loopback/local lab endpoints unless external access is explicitly enabled.",
      {
        code: REQUEST_POLICY_ERROR_CODES.LIVE_ENDPOINT_NOT_ALLOWED,
        statusCode: 403,
        details: {
          endpoint,
          allowExternalLiveEndpoints: false
        }
      }
    );
  }

  if (token && !isSecureTransport && !policy.allowInsecureTokenForwarding) {
    throw new RequestPolicyError(
      "Bearer tokens are blocked for non-HTTPS live endpoints unless insecure token forwarding is explicitly enabled.",
      {
        code: REQUEST_POLICY_ERROR_CODES.INSECURE_TOKEN_TRANSPORT,
        statusCode: 403,
        details: {
          endpoint,
          protocol: parsedUrl.protocol,
          allowInsecureTokenForwarding: false
        }
      }
    );
  }
}

export function createRequestAbortSignal(request) {
  const controller = new globalThis.AbortController();
  const abort = () => {
    if (!controller.signal.aborted) {
      controller.abort(
        new RequestPolicyError("The client aborted the request.", {
          code: REQUEST_POLICY_ERROR_CODES.REQUEST_ABORTED,
          statusCode: 499
        })
      );
    }
  };

  if (typeof request?.once === "function") {
    request.once("aborted", abort);
    request.once("close", () => {
      if (request.aborted) {
        abort();
      }
    });
  }

  return controller.signal;
}

export function normalizeEndpoint(endpoint) {
  if (typeof endpoint !== "string" || !endpoint.trim()) {
    return null;
  }

  const trimmed = endpoint.trim();
  try {
    const url = new URL(trimmed);
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString().replace(/\/$/, url.pathname === "/" ? "/" : "");
  } catch {
    return trimmed;
  }
}

export function isLoopbackAddress(hostname) {
  if (!hostname) {
    return false;
  }

  const value = String(hostname).trim().toLowerCase();
  return (
    value === "localhost" ||
    value === "127.0.0.1" ||
    value === "::1" ||
    value.startsWith("127.")
  );
}
