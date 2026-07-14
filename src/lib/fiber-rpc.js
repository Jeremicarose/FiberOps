const DEFAULT_TIMEOUT_MS = 10000;

export const RPC_ERROR_CODES = {
  TRANSPORT: "RPC_TRANSPORT_ERROR",
  UNAUTHORIZED: "RPC_UNAUTHORIZED",
  INVALID_RESPONSE: "RPC_INVALID_RESPONSE"
};

export class FiberRpcError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "FiberRpcError";
    Object.assign(this, details);
  }
}

export class FiberRpcClient {
  constructor({
    endpoint = "http://127.0.0.1:8227",
    token = "",
    timeoutMs = DEFAULT_TIMEOUT_MS
  } = {}) {
    this.endpoint = endpoint;
    this.token = token;
    this.timeoutMs = timeoutMs;
  }

  async call(method, params, options = {}) {
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
        signal: composeAbortSignal(options.signal, this.timeoutMs)
      });
    } catch (error) {
      throw new FiberRpcError("Unable to reach Fiber RPC endpoint.", {
        code: RPC_ERROR_CODES.TRANSPORT,
        method,
        endpoint: this.endpoint,
        cause: error,
        details: {
          reason: error?.name || "TransportError"
        }
      });
    }

    const { payload, raw } = await readResponsePayload(response);

    if (!response.ok) {
      const unauthorized =
        response.status === 401 ||
        response.status === 403 ||
        isUnauthorizedPayload(payload?.error);
      throw new FiberRpcError(
        payload?.error?.message ??
          `Fiber RPC request failed with HTTP ${response.status}.`,
        {
          code: unauthorized
            ? RPC_ERROR_CODES.UNAUTHORIZED
            : (payload?.error?.code ?? response.status),
          data: payload?.error?.data,
          method,
          endpoint: this.endpoint,
          status: response.status,
          raw,
          details: {
            rpcCode: payload?.error?.code ?? null,
            httpStatus: response.status
          }
        }
      );
    }

    if (payload?.error) {
      const unauthorized = isUnauthorizedPayload(payload.error);
      throw new FiberRpcError(
        payload.error.message ?? "Fiber RPC returned an error.",
        {
          code: unauthorized
            ? RPC_ERROR_CODES.UNAUTHORIZED
            : payload.error.code,
          data: payload.error.data,
          method,
          endpoint: this.endpoint,
          status: response.status,
          raw: payload,
          details: {
            rpcCode: payload.error.code ?? null,
            httpStatus: response.status
          }
        }
      );
    }

    if (!payload || typeof payload !== "object" || !("result" in payload)) {
      throw new FiberRpcError(
        "Fiber RPC response did not include a result field.",
        {
          code: RPC_ERROR_CODES.INVALID_RESPONSE,
          method,
          endpoint: this.endpoint,
          status: response.status,
          raw,
          details: {
            httpStatus: response.status
          }
        }
      );
    }

    return payload?.result;
  }

  async getNodeInfo(options) {
    return this.call("node_info", undefined, options);
  }

  async listChannels(params = {}, options) {
    return this.call("list_channels", params, options);
  }

  async parseInvoice(invoice, options) {
    return this.call("parse_invoice", { invoice }, options);
  }

  async getPayment(paymentHash, options) {
    return this.call("get_payment", { payment_hash: paymentHash }, options);
  }

  async graphNodes(params = {}, options) {
    return this.call("graph_nodes", params, options);
  }

  async graphChannels(params = {}, options) {
    return this.call("graph_channels", params, options);
  }

  async buildRouter(
    { amount, hopsInfo, finalTlcExpiryDelta, udtTypeScript } = {},
    options
  ) {
    return this.call(
      "build_router",
      pruneUndefined({
        amount,
        hops_info: hopsInfo,
        final_tlc_expiry_delta: finalTlcExpiryDelta,
        udt_type_script: udtTypeScript
      }),
      options
    );
  }

  async probeRoute(
    {
      invoice,
      targetPubkey,
      amount,
      maxFeeAmount,
      maxFeeRate,
      hopHints,
      trampolineHops,
      finalTlcExpiryDelta,
      tlcExpiryLimit,
      timeout,
      udtTypeScript,
      customRecords,
      allowSelfPayment,
      keysend
    } = {},
    options
  ) {
    const params = pruneUndefined({
      invoice,
      target_pubkey: targetPubkey,
      amount,
      max_fee_amount: maxFeeAmount,
      max_fee_rate: maxFeeRate,
      hop_hints: hopHints,
      trampoline_hops: trampolineHops,
      final_tlc_expiry_delta: finalTlcExpiryDelta,
      tlc_expiry_limit: tlcExpiryLimit,
      timeout,
      udt_type_script: udtTypeScript,
      custom_records: customRecords,
      allow_self_payment: allowSelfPayment,
      keysend,
      dry_run: true
    });

    return this.call("send_payment", params, options);
  }

  async sendPaymentWithRouter(
    {
      router,
      paymentHash,
      invoice,
      keysend,
      dryRun,
      customRecords,
      udtTypeScript
    } = {},
    options
  ) {
    return this.call(
      "send_payment_with_router",
      pruneUndefined({
        router,
        payment_hash: paymentHash,
        invoice,
        keysend,
        dry_run: dryRun,
        custom_records: customRecords,
        udt_type_script: udtTypeScript
      }),
      options
    );
  }
}

export function isUnauthorizedError(error) {
  return (
    error?.code === RPC_ERROR_CODES.UNAUTHORIZED ||
    error?.code === -32999 ||
    /unauthorized/i.test(error?.message ?? "")
  );
}

export function isMethodNotFoundError(error) {
  return (
    error?.code === -32601 ||
    /method not found/i.test(error?.message ?? "") ||
    /unknown method/i.test(error?.message ?? "")
  );
}

function composeAbortSignal(signal, timeoutMs) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!signal) {
    return timeoutSignal;
  }

  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([signal, timeoutSignal]);
  }

  const controller = new globalThis.AbortController();
  const abort = (eventSignal) => {
    if (!controller.signal.aborted) {
      controller.abort(eventSignal?.reason);
    }
  };

  signal.addEventListener("abort", () => abort(signal), { once: true });
  timeoutSignal.addEventListener("abort", () => abort(timeoutSignal), {
    once: true
  });

  return controller.signal;
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

function pruneUndefined(source) {
  return Object.fromEntries(
    Object.entries(source).filter(
      ([, value]) => value !== undefined && value !== null && value !== ""
    )
  );
}

async function readResponsePayload(response) {
  if (typeof response.text === "function") {
    const responseText = await response.text();

    try {
      return {
        payload: responseText ? JSON.parse(responseText) : null,
        raw: responseText
      };
    } catch (error) {
      throw new FiberRpcError("Fiber RPC returned a non-JSON response.", {
        code: RPC_ERROR_CODES.INVALID_RESPONSE,
        status: response.status,
        raw: responseText,
        cause: error,
        details: {
          httpStatus: response.status
        }
      });
    }
  }

  if (typeof response.json === "function") {
    const payload = await response.json();
    return {
      payload,
      raw: payload
    };
  }

  throw new FiberRpcError(
    "Fiber RPC response did not expose text() or json().",
    {
      code: RPC_ERROR_CODES.INVALID_RESPONSE,
      status: response.status,
      details: {
        httpStatus: response.status
      }
    }
  );
}

function isUnauthorizedPayload(errorPayload) {
  return (
    errorPayload?.code === -32999 ||
    /unauthorized/i.test(errorPayload?.message ?? "")
  );
}
