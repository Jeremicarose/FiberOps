import test from "node:test";
import assert from "node:assert/strict";

import { buildDiagnosis, runDiagnosis } from "../src/lib/diagnostics.js";

test("classifies failed route construction", () => {
  const diagnosis = buildDiagnosis({
    source: "demo",
    request: {
      amount: "150"
    },
    context: {
      nodeInfo: {
        version: "v0.9.0-rc5"
      },
      channels: [
        {
          state: "Open",
          local_balance: "500"
        }
      ],
      payment: {
        status: "Failed",
        failedError: "Failed to build route: no route could be found"
      }
    }
  });

  assert.equal(diagnosis.category, "route_unavailable");
  assert.match(diagnosis.headline, /route/i);
});

test("flags insufficient outbound liquidity before a retry", () => {
  const diagnosis = buildDiagnosis({
    source: "demo",
    request: {
      amount: "900"
    },
    context: {
      nodeInfo: {
        version: "v0.9.0-rc5"
      },
      channels: [
        {
          state: "Open",
          local_balance: "250"
        }
      ]
    }
  });

  assert.equal(diagnosis.category, "insufficient_liquidity");
});

test("detects expired invoices", () => {
  const diagnosis = buildDiagnosis({
    source: "demo",
    request: {
      invoice: "expired-demo"
    },
    context: {
      nodeInfo: {
        version: "v0.9.0-rc5"
      },
      parsedInvoice: {
        timestamp: Math.floor(Date.now() / 1000) - 3600,
        expiry: 60
      }
    }
  });

  assert.equal(diagnosis.category, "invoice_expired");
});

test("treats unauthorized RPC access as critical", () => {
  const diagnosis = buildDiagnosis({
    source: "live",
    request: {
      endpoint: "http://127.0.0.1:8227"
    },
    context: {
      error: {
        code: -32999,
        message: "Unauthorized"
      }
    }
  });

  assert.equal(diagnosis.category, "rpc_unauthorized");
  assert.equal(diagnosis.severity, "critical");
});

test("flags a target that is missing from the network graph", () => {
  const diagnosis = buildDiagnosis({
    source: "live",
    request: {
      targetPubkey: "0xdeadbeef"
    },
    context: {
      nodeInfo: {
        version: "v0.9.0-rc5"
      },
      channels: [
        {
          state: "Open",
          local_balance: "1200"
        }
      ],
      graphNodes: {
        nodes: [
          {
            pubkey: "0xabc123"
          }
        ]
      }
    }
  });

  assert.equal(diagnosis.category, "target_not_in_graph");
});

test("treats a fresh node with zero channels as not payment-ready", () => {
  const diagnosis = buildDiagnosis({
    source: "live",
    request: {},
    context: {
      nodeInfo: {
        version: "0.9.0-rc5"
      },
      channels: {
        channels: []
      }
    }
  });

  assert.equal(diagnosis.category, "no_open_channels");
});

test("maps failed route with explicit insufficient balance to liquidity failure", () => {
  const diagnosis = buildDiagnosis({
    source: "live",
    request: {},
    context: {
      nodeInfo: {
        version: "0.9.0-rc5"
      },
      channels: [
        {
          state: "ChannelReady",
          local_balance: "30100000000"
        }
      ],
      payment: {
        status: "Failed",
        failedError:
          "Send payment error: Failed to build route, Insufficient balance: max outbound liquidity 30100000000 is insufficient, required amount: 35000000000"
      }
    }
  });

  assert.equal(diagnosis.category, "insufficient_liquidity");
});

test("treats nested ChannelReady state as an open channel", () => {
  const diagnosis = buildDiagnosis({
    source: "live",
    request: {
      amount: "100"
    },
    context: {
      nodeInfo: {
        version: "0.9.0-rc5"
      },
      channels: [
        {
          state: {
            state_name: "ChannelReady"
          },
          local_balance: "500"
        }
      ]
    }
  });

  const openChannelsEvidence = diagnosis.evidence.find((item) => item.label === "Open channels");
  assert.equal(openChannelsEvidence?.value, "1");
});

test("adds event envelope and route preview for demo runs", async () => {
  const result = await runDiagnosis({
    mode: "demo",
    scenarioId: "route-build-failure"
  });

  assert.equal(result.source, "demo");
  assert.ok(result.event.id);
  assert.equal(result.event.source, "demo");
  assert.equal(result.event.category, result.diagnosis.category);
  assert.equal(result.event.scenarioId, "route-build-failure");
  assert.equal(result.routePreview.mode, "heuristic");
  assert.equal(result.routePreview.status, "blocked");
  assert.ok(Array.isArray(result.event.tags));
});

test("adds event envelope for endpoint-scoped runs", async () => {
  const result = await runDiagnosis({
    mode: "demo",
    scenarioId: "rpc-unavailable"
  });

  assert.ok(result.event.timestamp);
  assert.equal(result.event.source, "demo");
  assert.equal(result.event.endpoint, "http://127.0.0.1:8227");
});

test("route preview blocks when liquidity is insufficient", async () => {
  const result = await runDiagnosis({
    mode: "demo",
    scenarioId: "preflight-liquidity-block"
  });

  assert.equal(result.diagnosis.category, "insufficient_liquidity");
  assert.equal(result.routePreview.status, "blocked");
  assert.match(result.routePreview.blockingReason, /outbound liquidity/i);
});

test("route preview blocks when target is missing from graph", async () => {
  const result = await runDiagnosis({
    mode: "demo",
    scenarioId: "target-missing-from-graph"
  });

  assert.equal(result.diagnosis.category, "target_not_in_graph");
  assert.equal(result.routePreview.status, "blocked");
  assert.match(result.routePreview.blockingReason, /not visible in the current graph/i);
});

test("generates alerts for rpc unavailable", async () => {
  const result = await runDiagnosis({
    mode: "demo",
    scenarioId: "rpc-unavailable"
  });

  assert.ok(result.alerts.some((alert) => alert.cause === "rpc_unavailable"));
});

test("generates alerts for unauthorized RPC", async () => {
  const result = await runDiagnosis({
    mode: "demo",
    scenarioId: "rpc-unauthorized"
  });

  assert.ok(result.alerts.some((alert) => alert.cause === "rpc_unauthorized"));
});

test("generates alerts for insufficient liquidity and channel not ready", async () => {
  const liquidityResult = await runDiagnosis({
    mode: "demo",
    scenarioId: "preflight-liquidity-block"
  });
  const channelResult = await runDiagnosis({
    mode: "demo",
    scenarioId: "channel-not-ready"
  });

  assert.ok(liquidityResult.alerts.some((alert) => alert.cause === "insufficient_liquidity"));
  assert.ok(channelResult.alerts.some((alert) => alert.cause === "channel_not_ready"));
});

test("summary includes broader monitoring fields", async () => {
  const result = await runDiagnosis({
    mode: "demo",
    scenarioId: "fee-too-high"
  });

  assert.equal(result.summary.totalChannels, 1);
  assert.equal(result.summary.openChannels, 1);
  assert.equal(result.summary.readyChannels, 0);
  assert.equal(result.summary.peerCount, 5);
  assert.equal(result.summary.partialErrorCount, 0);
  assert.ok(result.summary.paymentReadiness);
});
