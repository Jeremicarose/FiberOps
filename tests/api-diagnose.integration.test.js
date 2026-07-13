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

test("bootstrap publishes capabilities and contract endpoints", async () => {
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
  assert.equal(
    payload.data.contracts.endpoints.rules,
    "/api/contracts/diagnose/rules"
  );
  assert.equal(payload.meta.route, "/api/bootstrap");
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
  assert.equal(payload.data.diagnosis.category, "route_unavailable");
  assert.equal(payload.meta.route, "/api/diagnose");
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

test("contracts endpoint exposes the published rule catalog", async () => {
  const fixture = await createServerFixture();
  const response = await fixture.request({
    method: "GET",
    url: "/api/contracts/diagnose/rules"
  });
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.version, "2026-07-12");
  assert.ok(Array.isArray(payload.data.rules));
  assert.ok(
    payload.data.rules.some((rule) => rule.id === "insufficient_liquidity")
  );
});

test("health endpoint returns explicit success envelope", async () => {
  const fixture = await createServerFixture();
  const response = await fixture.request({
    method: "GET",
    url: "/api/health"
  });
  const payload = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.data.service, "fiberops");
  assert.equal(typeof payload.data.defaultEndpoint, "string");
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
    port: 0,
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
