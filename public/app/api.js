export async function requestApi(url, options) {
  let response;

  try {
    response = await fetch(url, options);
  } catch (error) {
    if (error?.name === "AbortError") {
      throw createClientError({
        code: "REQUEST_ABORTED",
        message: "Request was cancelled.",
        details: null,
        status: null,
        aborted: true
      });
    }

    throw createClientError({
      code: "NETWORK_ERROR",
      message: error?.message || "Network request failed.",
      details: null,
      status: null
    });
  }

  const payload = await parseJsonResponse(response);
  const envelope = unwrapEnvelope(response, payload);

  if (!response.ok) {
    throw createClientError({
      code: envelope.error?.code || `HTTP_${response.status}`,
      message:
        envelope.error?.message ||
        `Request failed with HTTP ${response.status}.`,
      details: envelope.error?.details || null,
      status: response.status
    });
  }

  if (!envelope.ok) {
    throw createClientError({
      code: envelope.error?.code || "API_ERROR",
      message: envelope.error?.message || "API request failed.",
      details: envelope.error?.details || null,
      status: response.status
    });
  }

  return envelope.data;
}

export async function parseJsonResponse(response) {
  let text;

  try {
    text = await response.text();
  } catch (error) {
    throw createClientError({
      code: "INVALID_RESPONSE",
      message: error?.message || "Failed to read API response.",
      details: null,
      status: response.status
    });
  }

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw createClientError({
      code: "INVALID_RESPONSE",
      message: "Server returned non-JSON response.",
      details: {
        body: text
      },
      status: response.status
    });
  }
}

export function unwrapEnvelope(response, payload) {
  if (payload && typeof payload === "object" && "ok" in payload) {
    return payload;
  }

  return response.ok
    ? { ok: true, data: payload, meta: {} }
    : {
        ok: false,
        error: {
          code: `HTTP_${response.status}`,
          message: "Server returned an unexpected response shape.",
          details: payload
        },
        meta: {}
      };
}

export function createClientError({
  code,
  message,
  details,
  status,
  aborted = false
}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  error.status = status;
  error.aborted = aborted;
  return error;
}
