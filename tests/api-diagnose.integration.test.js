import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import { validateDiagnosisResult } from "../src/lib/diagnostics.js";
import {
  createFiberOpsConfig,
  handleFiberOpsRequest
} from "../src/lib/server-app.js";

test("bootstrap publishes capabilities, compatibility metadata, and contract endpoints", async () => {
  const fixture = await createServerFixture();
  const response = await fixture.request({
    method: "GET",
    url: "/api/bootstrap"
  });
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.capabilities.multiNodeLive, true);
  assert.equal(payload.data.capabilities.machineExports, true);
  assert.equal(payload.data.capabilities.observability, true);
  assert.equal(payload.data.contracts.compatibility.current, "2026-07-12");
  assert.equal(payload.data.runtime.persistence.enabled, true);
  assert.equal(payload.data.runtime.observability.enabled, true);
  assert.equal(
    payload.data.contracts.endpoints.rules,
    "/api/contracts/diagnose/rules"
  );
  assert.equal(payload.meta.route, "/api/bootstrap");
  assert.match(payload.meta.requestId, /^req-/);
});

test("api diagnose returns the full contract-backed result", async () => {
  const fixture = await createServerFixture();
  const response = await fixture.request({
    method: "POST",
    url: "/api/diagnose",
    body: {
      mode: "demo",
      scenarioId: "route-build-failure"
    }
  });
  const payload = JSON.parse(response.body);
  const validation = validateDiagnosisResult(payload.data);

  assert.equal(response.statusCode, 200);
  assert.equal(payload.ok, true);
  assert.equal(validation.ok, true, validation.errors.join("; "));
  assert.equal(payload.data.contract.version, "2026-07-12");
  assert.equal(payload.data.contract.compatibility.current, "2026-07-12");
  assert.equal(payload.data.diagnosis.category, "route_unavailable");
  assert.equal(payload.meta.route, "/api/diagnose");
  assert.match(payload.meta.requestId, /^req-/);
});

test("api diagnose validates payloads and supports operator export mode", async () => {
  const fixture = await createServerFixture();

  const invalidResponse = await fixture.request({
    method: "POST",
    url: "/api/diagnose",
    body: {
      mode: "demo",
      outputMode: "spreadsheet"
    }
  });

  const invalidPayload = JSON.parse(invalidResponse.body);
  assert.equal(invalidResponse.statusCode, 400);
  assert.equal(invalidPayload.ok, false);
  assert.equal(invalidPayload.error.code, "INVALID_REQUEST");
  assert.ok(Array.isArray(invalidPayload.error.details?.details));
  assert.match(invalidPayload.error.details.details[0], /outputMode/i);

  const response = await fixture.request({
    method: "POST",
    url: "/api/diagnose",
    body: {
      mode: "demo",
      scenarioId: "preflight-liquidity-block",
      outputMode: "operator"
    }
  });
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.outputMode, "operator");
  assert.equal(payload.data.incident.category, "insufficient_liquidity");
  assert.equal(typeof payload.data.triage.primaryAction, "string");
});

test("api diagnose rejects malformed endpoints and invalid live field combinations", async () => {
  const fixture = await createServerFixture();

  const malformedEndpoint = await fixture.request({
    method: "POST",
    url: "/api/diagnose",
    body: {
      mode: "live",
      endpoint: "not-a-url"
    }
  });
  const malformedPayload = JSON.parse(malformedEndpoint.body);
  assert.equal(malformedEndpoint.statusCode, 400);
  assert.equal(malformedPayload.error.code, "INVALID_REQUEST");
  assert.match(malformedPayload.error.details.details.join(" "), /endpoint/i);

  const invalidCombination = await fixture.request({
    method: "POST",
    url: "/api/diagnose",
    body: {
      mode: "live",
      scenarioId: "preflight-liquidity-block",
      amount: "1500"
    }
  });
  const invalidCombinationPayload = JSON.parse(invalidCombination.body);
  assert.equal(invalidCombination.statusCode, 400);
  assert.equal(invalidCombinationPayload.error.code, "INVALID_REQUEST");
  assert.match(
    invalidCombinationPayload.error.details.details.join(" "),
    /scenarioId|targetPubkey/i
  );
});

test("api diagnose parses boolean-like policy overrides safely", async () => {
  const fixture = await createServerFixture({
    allowExternalLiveEndpoints: "false",
    allowInsecureTokenForwarding: "0"
  });
  const response = await fixture.request({
    method: "POST",
    url: "/api/diagnose",
    body: {
      mode: "live",
      endpoint: "http://example.com:8227",
      token: "secret"
    }
  });
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 403);
  assert.equal(payload.error.code, "LIVE_ENDPOINT_NOT_ALLOWED");
});

test("contracts endpoint exposes the published rule catalog and compatibility metadata", async () => {
  const fixture = await createServerFixture();
  const response = await fixture.request({
    method: "GET",
    url: "/api/contracts/diagnose"
  });
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.version, "2026-07-12");
  assert.equal(payload.data.compatibility.current, "2026-07-12");
  assert.ok(Array.isArray(payload.data.rules));
  assert.ok(
    payload.data.rules.some((rule) => rule.id === "insufficient_liquidity")
  );
});

test("health endpoint returns operational state metadata", async () => {
  const fixture = await createServerFixture();
  await fixture.request({
    method: "POST",
    url: "/api/diagnose",
    body: {
      mode: "demo",
      scenarioId: "route-build-failure"
    }
  });
  const response = await fixture.request({
    method: "GET",
    url: "/api/health"
  });
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.service, "fiberops");
  assert.equal(typeof payload.data.defaultEndpoint, "string");
  assert.equal(payload.data.observability.enabled, true);
  assert.equal(payload.data.historyBackend.type, "json-file");
  assert.ok(payload.data.recentCounters.requests >= 1);
  assert.match(payload.meta.requestId, /^req-/);
});

test("metrics endpoint exposes request and run counters", async () => {
  const fixture = await createServerFixture();
  await fixture.request({
    method: "POST",
    url: "/api/diagnose",
    body: {
      mode: "demo",
      scenarioId: "route-build-failure"
    }
  });
  await fixture.requestRaw({
    method: "POST",
    url: "/api/diagnose",
    rawBody: '{"mode": "demo"'
  });
  const response = await fixture.request({
    method: "GET",
    url: "/api/metrics"
  });
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(payload.ok, true);
  assert.ok(payload.data.requests.total >= 2);
  assert.ok(payload.data.requests.errors >= 1);
  assert.ok(payload.data.runs.started >= 1);
  assert.ok(payload.data.runs.byCategory.route_unavailable >= 1);
});

test("api diagnose rejects malformed json with invalid request envelope", async () => {
  const fixture = await createServerFixture();
  const response = await fixture.requestRaw({
    method: "POST",
    url: "/api/diagnose",
    rawBody: '{"mode": "demo"'
  });
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 400);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "INVALID_REQUEST");
  assert.match(payload.error.message, /valid json/i);
});

test("api diagnose exposes structured rpc failures for client degraded states", async () => {
  const fixture = await createServerFixture({
    defaultEndpoint: "http://127.0.0.1:1",
    node2Endpoint: "http://127.0.0.1:2"
  });
  const response = await fixture.request({
    method: "POST",
    url: "/api/diagnose",
    body: {
      mode: "live",
      endpoint: "http://127.0.0.1:1"
    }
  });
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 500);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "RPC_TRANSPORT_ERROR");
  assert.equal(payload.meta.route, "/api/diagnose");
  assert.equal(typeof payload.error.message, "string");
  assert.equal(payload.error.details.rpc.nodeCount, 2);
});

test("api diagnose rejects invalid content type", async () => {
  const fixture = await createServerFixture();
  const response = await fixture.requestRaw({
    method: "POST",
    url: "/api/diagnose",
    rawBody: JSON.stringify({
      mode: "demo",
      scenarioId: "route-build-failure"
    }),
    headers: { "content-type": "text/plain" }
  });
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 415);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "INVALID_CONTENT_TYPE");
  assert.equal(payload.meta.route, "/api/diagnose");
});

test("api diagnose rejects oversized request bodies", async () => {
  const fixture = await createServerFixture({ maxJsonBodyBytes: 32 });
  const response = await fixture.requestRaw({
    method: "POST",
    url: "/api/diagnose",
    rawBody: JSON.stringify({ mode: "demo", scenarioId: "route-build-failure" })
  });
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 413);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "REQUEST_TOO_LARGE");
  assert.equal(payload.meta.route, "/api/diagnose");
});

test("api diagnose blocks non-loopback live endpoints by default", async () => {
  const fixture = await createServerFixture();
  const response = await fixture.request({
    method: "POST",
    url: "/api/diagnose",
    body: {
      mode: "live",
      endpoint: "http://example.com:8227"
    }
  });
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 403);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "LIVE_ENDPOINT_NOT_ALLOWED");
  assert.equal(payload.meta.route, "/api/diagnose");
});

test("api diagnose validates the resolved execution node set, not only the requested endpoint", async () => {
  const fixture = await createServerFixture({
    nodeSet: [
      {
        id: "node1",
        name: "node1",
        endpoint: "http://127.0.0.1:8227",
        primary: true
      },
      {
        id: "node2",
        name: "node2",
        endpoint: "http://example.com:8227",
        primary: false
      }
    ]
  });
  const response = await fixture.request({
    method: "POST",
    url: "/api/diagnose",
    body: {
      mode: "live",
      endpoint: "http://127.0.0.1:8227"
    }
  });
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 403);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "LIVE_ENDPOINT_NOT_ALLOWED");
});

test("api diagnose normalizes configured endpoints before execution-plan matching", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options) => {
    const endpoint = String(url);
    const payload = JSON.parse(options.body);

    if (payload.method === "node_info") {
      return jsonRpcResponse({
        version: "0.9.0-rc5",
        pubkey:
          endpoint === "http://node2.test"
            ? "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
            : "02942f9602e5afe0287879b829306d35804c8a2d28ace1d8248b553f580850d696"
      });
    }

    if (payload.method === "list_channels") {
      return jsonRpcResponse({ channels: [] });
    }

    if (payload.method === "send_payment") {
      return jsonRpcResponse({ payment_hash: "0xprobe", status: "Created" });
    }

    if (payload.method === "graph_nodes" || payload.method === "graph_channels") {
      return jsonRpcResponse({ nodes: [], channels: [] });
    }

    throw new Error(`Unexpected method ${payload.method} for ${endpoint}`);
  };

  try {
    const fixture = await createServerFixture({
      defaultEndpoint: "http://node1.test",
      nodeSet: [
        {
          id: "node1",
          name: "node1",
          endpoint: "http://node1.test/",
          primary: true
        },
        {
          id: "node2",
          name: "node2",
          endpoint: "http://node2.test/",
          primary: false
        }
      ],
      allowExternalLiveEndpoints: true
    });
    const response = await fixture.request({
      method: "POST",
      url: "/api/diagnose",
      body: {
        mode: "live",
        endpoint: "http://node2.test",
        amount: "1000",
        targetPubkey:
          "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
      }
    });
    const payload = JSON.parse(response.body);

    assert.equal(response.statusCode, 200);
    assert.equal(payload.data.execution.selectedNodeId, "node2");
    assert.equal(payload.data.execution.nodes[0].id, "node2");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("api diagnose returns execution metadata for the selected configured node", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options) => {
    const endpoint = String(url);
    const payload = JSON.parse(options.body);

    if (payload.method === "node_info") {
      return jsonRpcResponse({
        version: "0.9.0-rc5",
        pubkey:
          endpoint === "http://node2.test"
            ? "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
            : "02942f9602e5afe0287879b829306d35804c8a2d28ace1d8248b553f580850d696"
      });
    }

    if (payload.method === "list_channels") {
      return jsonRpcResponse({
        channels: [
          {
            state: { state_name: "ChannelReady" },
            local_balance:
              endpoint === "http://node2.test" ? "5000000000" : "1000000000",
            channel_id: endpoint === "http://node2.test" ? "0xnode2" : "0xnode1"
          }
        ]
      });
    }

    if (payload.method === "graph_nodes") {
      return jsonRpcResponse({
        nodes: [
          {
            pubkey:
              "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
          }
        ]
      });
    }

    if (payload.method === "graph_channels") {
      return jsonRpcResponse({
        channels: [
          {
            node1:
              endpoint === "http://node2.test"
                ? "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
                : "02942f9602e5afe0287879b829306d35804c8a2d28ace1d8248b553f580850d696",
            node2:
              "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
          }
        ]
      });
    }

    if (payload.method === "send_payment") {
      if (endpoint === "http://node1.test") {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              error: {
                code: -1,
                message: "Insufficient balance"
              }
            });
          }
        };
      }

      return jsonRpcResponse({
        payment_hash: "0xnode2probe",
        status: "Created"
      });
    }

    throw new Error(`Unexpected method ${payload.method} for ${endpoint}`);
  };

  try {
    const fixture = await createServerFixture({
      defaultEndpoint: "http://node1.test",
      node2Endpoint: "http://node2.test",
      allowExternalLiveEndpoints: true,
      nodeSet: [
        {
          id: "node1",
          name: "node1",
          endpoint: "http://node1.test",
          primary: true
        },
        {
          id: "node2",
          name: "node2",
          endpoint: "http://node2.test",
          primary: false
        }
      ]
    });
    const response = await fixture.request({
      method: "POST",
      url: "/api/diagnose",
      body: {
        mode: "live",
        endpoint: "http://node2.test",
        amount: "1000000000",
        targetPubkey:
          "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
      }
    });
    const payload = JSON.parse(response.body);

    assert.equal(response.statusCode, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.data.selectedNodeId, "node2");
    assert.equal(payload.data.aggregateStatus, "mixed");
    assert.equal(payload.data.summary.endpoint, "http://node2.test");
    assert.equal(payload.data.execution.selectedNodeId, "node2");
    assert.equal(payload.data.execution.nodes[0].selected, true);
    assert.equal(payload.data.execution.nodes[0].endpoint, "http://node2.test");
    assert.equal(
      payload.data.diagnosis.category,
      payload.data.nodes[0].diagnosis.category
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("api diagnose blocks insecure bearer token forwarding", async () => {
  const fixture = await createServerFixture({
    allowExternalLiveEndpoints: true
  });
  const response = await fixture.request({
    method: "POST",
    url: "/api/diagnose",
    body: {
      mode: "live",
      endpoint: "http://example.com:8227",
      token: "secret"
    }
  });
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 403);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "INSECURE_TOKEN_TRANSPORT");
  assert.equal(payload.meta.route, "/api/diagnose");
});

test("static traversal attempts return forbidden", async () => {
  const fixture = await createServerFixture();
  const response = await fixture.requestRaw({
    method: "GET",
    url: "/../package.json"
  });
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 403);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "FORBIDDEN");
});

test("missing static assets return 404 instead of html fallback", async () => {
  const fixture = await createServerFixture();
  const response = await fixture.requestRaw({
    method: "GET",
    url: "/missing.js"
  });
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 404);
  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "STATIC_ASSET_NOT_FOUND");
  assert.equal(payload.meta.route, "/missing.js");
});

async function createServerFixture(overrides = {}) {
  const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "fiberops-server-"));
  const config = createFiberOpsConfig({
    host: "127.0.0.1",
    port: overrides.port ?? 1,
    runtimeDir,
    historyPath: path.join(runtimeDir, "diagnostic-history.json"),
    ...overrides
  });

  return {
    async request({ method, url, body = null }) {
      return this.requestRaw({
        method,
        url,
        rawBody: body ? JSON.stringify(body) : "",
        headers: body ? { "content-type": "application/json" } : {}
      });
    },

    async requestRaw({ method, url, rawBody = "", headers = {} }) {
      const request = Readable.from(rawBody ? [rawBody] : []);
      request.method = method;
      request.url = url;
      request.headers =
        Object.keys(headers).length > 0
          ? headers
          : rawBody && method === "POST"
            ? { "content-type": "application/json" }
            : {};

      let statusCode = 200;
      let responseHeaders = {};
      let responseBody = "";
      let complete;
      const finished = new Promise((resolve) => {
        complete = resolve;
      });

      const response = {
        writeHead(nextStatusCode, nextHeaders) {
          statusCode = nextStatusCode;
          responseHeaders = nextHeaders;
        },
        end(chunk = "") {
          responseBody += chunk ? String(chunk) : "";
          complete();
        }
      };

      await handleFiberOpsRequest(request, response, config);
      await finished;

      return {
        statusCode,
        headers: responseHeaders,
        body: responseBody
      };
    }
  };
}

function jsonRpcResponse(result) {
  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({ result });
    }
  };
}
