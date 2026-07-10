const DEFAULT_TIMEOUT_MS = 10000;

export class FiberRpcError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "FiberRpcError";
    Object.assign(this, details);
  }
}

export class FiberRpcClient {
  constructor({ endpoint = "http://127.0.0.1:8227", token = "", timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.endpoint = endpoint;
    this.token = token;
    this.timeoutMs = timeoutMs;
  }

  async call(method, params) {
    const requestBody = {
      jsonrpc: "2.0",
      id: globalThis.crypto?.randomUUID?.() ?? Date.now(),
      method,
      params: params === undefined ? [] : [params]
    };

    let response;

    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers: buildHeaders(this.token),
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (error) {
      throw new FiberRpcError("Unable to reach Fiber RPC endpoint.", {
        code: "TRANSPORT_ERROR",
        method,
        endpoint: this.endpoint,
        cause: error
      });
    }

    const responseText = await response.text();
    let payload = null;

    try {
      payload = responseText ? JSON.parse(responseText) : null;
    } catch (error) {
      throw new FiberRpcError("Fiber RPC returned a non-JSON response.", {
        code: "INVALID_RESPONSE",
        method,
        endpoint: this.endpoint,
        status: response.status,
        raw: responseText,
        cause: error
      });
    }

    if (!response.ok) {
      throw new FiberRpcError(payload?.error?.message ?? `Fiber RPC request failed with HTTP ${response.status}.`, {
        code: payload?.error?.code ?? response.status,
        data: payload?.error?.data,
        method,
        endpoint: this.endpoint,
        status: response.status,
        raw: payload
      });
    }

    if (payload?.error) {
      throw new FiberRpcError(payload.error.message ?? "Fiber RPC returned an error.", {
        code: payload.error.code,
        data: payload.error.data,
        method,
        endpoint: this.endpoint,
        status: response.status,
        raw: payload
      });
    }

    return payload?.result;
  }
}

export function isUnauthorizedError(error) {
  return error?.code === -32999 || /unauthorized/i.test(error?.message ?? "");
}

function buildHeaders(token) {
  const headers = {
    "content-type": "application/json"
  };

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  return headers;
}
