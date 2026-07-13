import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";

import {
  buildDiagnosis,
  buildRoutePreview,
  deriveRouteProbeInput,
  getBootstrapData,
  runDiagnosis
} from "../src/lib/diagnostics.js";
import { buildEventEnvelope } from "../src/lib/diagnostics/events.js";
import { summarizeContext } from "../src/lib/diagnostics/summaries.js";

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

test("route probe success upgrades diagnosis to route_probe_ready", () => {
  const diagnosis = buildDiagnosis({
    source: "live",
    request: {
      amount: "10000000000",
      targetPubkey:
        "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
    },
    context: {
      nodeInfo: {
        version: "0.9.0-rc5"
      },
      channels: [
        {
          state: { state_name: "ChannelReady" },
          local_balance: "30100000000"
        }
      ],
      routeProbe: {
        supported: true,
        result: {
          payment_hash: "0xprobehash"
        }
      }
    }
  });

  assert.equal(diagnosis.category, "route_probe_ready");
});

test("route probe failure upgrades diagnosis using real rpc error", () => {
  const diagnosis = buildDiagnosis({
    source: "live",
    request: {
      amount: "35000000000",
      targetPubkey:
        "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
    },
    context: {
      nodeInfo: {
        version: "0.9.0-rc5"
      },
      channels: [
        {
          state: { state_name: "ChannelReady" },
          local_balance: "30100000000"
        }
      ],
      routeProbe: {
        supported: true,
        error: {
          message:
            "Send payment error: Failed to build route, Insufficient balance: max outbound liquidity 30100000000 is insufficient, required amount: 35000000000"
        }
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

  const openChannelsEvidence = diagnosis.evidence.find(
    (item) => item.label === "Open channels"
  );
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
  assert.equal(result.routePreview.evidenceSource, "heuristic inference");
  assert.ok(Array.isArray(result.routePreview.limitations));
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
  assert.match(
    result.routePreview.blockingReason,
    /not visible in the current graph/i
  );
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

  assert.ok(
    liquidityResult.alerts.some(
      (alert) => alert.cause === "insufficient_liquidity"
    )
  );
  assert.ok(
    channelResult.alerts.some((alert) => alert.cause === "channel_not_ready")
  );
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

test("derives route probe input from parsed invoice", () => {
  const probe = deriveRouteProbeInput(
    {},
    {
      amount: "0x2540be400",
      data: {
        attrs: [
          {
            payee_public_key:
              "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
          }
        ]
      }
    }
  );

  assert.equal(probe.amount, "0x2540be400");
  assert.equal(
    probe.targetPubkey,
    "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
  );
});

test("route preview uses rpc probe success when available", () => {
  const preview = buildRoutePreview({
    request: {
      amount: "10000000000",
      targetPubkey:
        "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
    },
    context: {
      channels: [
        {
          state: { state_name: "ChannelReady" },
          local_balance: "30100000000",
          channel_id: "0xabc"
        }
      ],
      routeProbe: {
        supported: true,
        result: {
          payment_hash: "0xprobehash",
          status: "Created"
        }
      }
    },
    diagnosis: {
      category: "needs_more_context"
    },
    summary: {}
  });

  assert.equal(preview.mode, "dry_run");
  assert.equal(preview.status, "ready");
  assert.equal(preview.confidence, "high");
  assert.equal(preview.evidenceSource, "send_payment(dry_run)");
  assert.equal(preview.probeMethod, "send_payment(dry_run)");
  assert.equal(preview.probePaymentHash, "0xprobehash");
});

test("route preview uses rpc probe failure when available", () => {
  const preview = buildRoutePreview({
    request: {
      amount: "35000000000",
      targetPubkey:
        "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
    },
    context: {
      channels: [
        {
          state: { state_name: "ChannelReady" },
          local_balance: "30100000000",
          channel_id: "0xabc"
        }
      ],
      routeProbe: {
        supported: true,
        error: {
          message:
            "Send payment error: Failed to build route, Insufficient balance: max outbound liquidity 30100000000 is insufficient, required amount: 35000000000"
        }
      }
    },
    diagnosis: {
      category: "needs_more_context"
    },
    summary: {}
  });

  assert.equal(preview.mode, "dry_run");
  assert.equal(preview.status, "blocked");
  assert.equal(preview.confidence, "high");
  assert.match(preview.blockingReason, /insufficient balance/i);
});

test("route preview surfaces build_router candidates when dry run is unavailable", () => {
  const preview = buildRoutePreview({
    request: {
      amount: "10000000000",
      targetPubkey:
        "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
    },
    context: {
      channels: [
        {
          state: { state_name: "ChannelReady" },
          local_balance: "30100000000",
          channel_id: "0xabc"
        }
      ],
      routeBuild: {
        supported: true,
        attempted: true,
        source: "build_router",
        candidates: [
          {
            id: "route-direct",
            pathPubkeys: [
              "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
            ],
            result: {
              router_hops: [
                {
                  target:
                    "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea",
                  amount_received: "10000000010",
                  incoming_tlc_expiry: 42
                }
              ]
            }
          },
          {
            id: "route-alt",
            pathPubkeys: [
              "02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
            ],
            result: {
              router_hops: [
                {
                  target:
                    "02aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                  amount_received: "10000000020",
                  incoming_tlc_expiry: 55
                },
                {
                  target:
                    "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea",
                  amount_received: "10000000010",
                  incoming_tlc_expiry: 42
                }
              ]
            }
          }
        ]
      }
    },
    diagnosis: {
      category: "needs_more_context"
    },
    summary: {}
  });

  assert.equal(preview.mode, "route_build");
  assert.equal(preview.status, "ready");
  assert.equal(preview.routeBuildMethod, "build_router");
  assert.equal(preview.routeAlternatives.length, 2);
  assert.equal(preview.chosenRoute?.hopCount, 1);
});

test("heuristic preview declares limitations without dry-run evidence", () => {
  const preview = buildRoutePreview({
    request: {
      amount: "100"
    },
    context: {
      channels: [
        {
          state: { state_name: "ChannelReady" },
          local_balance: "500",
          channel_id: "0xabc"
        }
      ]
    },
    diagnosis: {
      category: "needs_more_context"
    },
    summary: {}
  });

  assert.equal(preview.mode, "heuristic");
  assert.equal(preview.evidenceSource, "heuristic inference");
  assert.ok(preview.limitations.some((item) => /heuristic/i.test(item)));
});

test("bootstrap exposes multi-node and persistence capabilities", () => {
  const bootstrap = getBootstrapData("http://127.0.0.1:8227", {
    historyPath: "/tmp/fiberops-history.json",
    nodeSet: [
      { name: "node1", endpoint: "http://127.0.0.1:8227", primary: true },
      { name: "node2", endpoint: "http://127.0.0.1:8237" }
    ]
  });

  assert.equal(bootstrap.capabilities.multiNodeLive, true);
  assert.equal(bootstrap.capabilities.routeProbe, true);
  assert.equal(bootstrap.capabilities.persistence, true);
  assert.equal(bootstrap.nodeSet.length, 2);
});

test("summary extraction reports readiness and comparison key", () => {
  const summary = summarizeContext(
    {
      endpoint: "http://127.0.0.1:8227",
      nodeInfo: { version: "0.9.0-rc5", peers_count: 2 },
      channels: [
        {
          state: { state_name: "ChannelReady" },
          local_balance: "5000000000"
        }
      ],
      graphNodes: {
        nodes: [{ pubkey: "0xabc" }]
      }
    },
    {
      amount: "1000000000",
      targetPubkey: "0xabc"
    }
  );

  assert.equal(summary.paymentReadiness, "ready");
  assert.equal(summary.targetInGraph, true);
  assert.equal(typeof summary.comparisonKey, "string");
});

test("summary treats a successful route probe as stronger than a stale graph snapshot", () => {
  const summary = summarizeContext(
    {
      endpoint: "http://127.0.0.1:8227",
      nodeInfo: { version: "0.9.0-rc5", peers_count: 2 },
      channels: [
        {
          state: { state_name: "ChannelReady" },
          local_balance: "5000000000"
        }
      ],
      graphNodes: {
        nodes: [{ pubkey: "0xabc" }]
      },
      routeProbe: {
        supported: true,
        result: {
          payment_hash: "0xprobehash"
        }
      }
    },
    {
      amount: "1000000000",
      targetPubkey:
        "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
    }
  );

  assert.equal(summary.routeProof, "confirmed");
  assert.equal(summary.targetVisibility, "route_proven");
  assert.equal(summary.targetInGraph, null);
  assert.equal(summary.paymentReadiness, "ready");
});

test("event envelope includes route classification tags", () => {
  const event = buildEventEnvelope({
    source: "live",
    request: {
      endpoint: "http://127.0.0.1:8227",
      paymentHash: "0xhash"
    },
    diagnosis: {
      category: "insufficient_liquidity",
      severity: "high",
      headline: "Outbound liquidity is too low"
    },
    scenario: null,
    summary: {
      endpoint: "http://127.0.0.1:8227",
      paymentStatus: "Failed",
      paymentReadiness: "blocked",
      multiNode: { enabled: true }
    }
  });

  assert.equal(event.source, "live");
  assert.ok(event.tags.includes("insufficient_liquidity"));
  assert.ok(event.tags.includes("payment-hash"));
  assert.ok(event.tags.includes("multi-node"));
});

test("live diagnosis aggregates both nodes and persists history", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fiberops-history-"));
  const historyPath = path.join(directory, "diagnostic-history.json");
  const originalFetch = globalThis.fetch;

  const responses = new Map([
    [
      "http://node1.test",
      {
        node_info: {
          version: "0.9.0-rc5",
          peers_count: 2,
          pubkey:
            "02942f9602e5afe0287879b829306d35804c8a2d28ace1d8248b553f580850d696"
        },
        list_channels: {
          channels: [
            {
              state: { state_name: "ChannelReady" },
              local_balance: "30100000000",
              channel_id: "0xnode1"
            }
          ]
        },
        graph_nodes: {
          nodes: [
            {
              pubkey:
                "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
            }
          ]
        },
        graph_channels: {
          channels: [
            {
              node1:
                "02942f9602e5afe0287879b829306d35804c8a2d28ace1d8248b553f580850d696",
              node2:
                "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
            }
          ]
        },
        build_router: {
          router_hops: [
            {
              target:
                "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea",
              amount_received: "10000000010",
              incoming_tlc_expiry: 42
            }
          ]
        },
        send_payment: {
          payment_hash: "0xprobe-node1",
          status: "Created",
          fee: "10"
        }
      }
    ],
    [
      "http://node2.test",
      {
        node_info: {
          version: "0.9.0-rc5",
          peers_count: 1,
          pubkey:
            "02bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        },
        list_channels: {
          channels: [
            {
              state: { state_name: "ChannelReady" },
              local_balance: "15000000000",
              channel_id: "0xnode2"
            }
          ]
        },
        graph_nodes: {
          nodes: [
            {
              pubkey:
                "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
            }
          ]
        },
        graph_channels: {
          channels: [
            {
              node1:
                "02bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              node2:
                "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
            }
          ]
        },
        build_router: {
          router_hops: [
            {
              target:
                "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea",
              amount_received: "10000000012",
              incoming_tlc_expiry: 45
            }
          ]
        },
        send_payment: {
          payment_hash: "0xprobe-node2",
          status: "Created",
          fee: "12"
        }
      }
    ]
  ]);

  globalThis.fetch = async (url, options) => {
    const endpoint = String(url);
    const payload = JSON.parse(options.body);
    const methods = responses.get(endpoint);
    const result = methods?.[payload.method];

    if (!result) {
      throw new Error(
        `Unexpected RPC request ${payload.method} for ${endpoint}`
      );
    }

    return {
      ok: true,
      async text() {
        return JSON.stringify({ result });
      }
    };
  };

  try {
    const result = await runDiagnosis(
      {
        mode: "live",
        amount: "10000000000",
        targetPubkey:
          "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
      },
      {
        defaultEndpoint: "http://node1.test",
        historyPath,
        nodeSet: [
          {
            id: "node1",
            name: "node1",
            endpoint: "http://node1.test",
            primary: true
          },
          { id: "node2", name: "node2", endpoint: "http://node2.test" }
        ]
      }
    );

    assert.equal(result.source, "live");
    assert.equal(result.nodes.length, 2);
    assert.equal(result.summary.multiNode.enabled, true);
    assert.equal(result.summary.multiNode.reachableNodes, 2);
    assert.equal(result.summary.multiNode.probeReadyNodes, 2);
    assert.equal(result.routePreview.mode, "dry_run");
    assert.equal(result.routePreview.evidenceSource, "send_payment(dry_run)");
    assert.equal(result.routePreview.routeBuildMethod, "build_router");
    assert.ok(result.routePreview.routeAlternatives.length >= 1);
    assert.equal(result.history.relatedCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("history comparison enriches follow-up live runs", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fiberops-history-"));
  const historyPath = path.join(directory, "diagnostic-history.json");
  const originalFetch = globalThis.fetch;

  const runState = { phase: "ready" };
  globalThis.fetch = async (url, options) => {
    const payload = JSON.parse(options.body);
    const endpoint = String(url);

    if (payload.method === "node_info") {
      return {
        ok: true,
        async text() {
          return JSON.stringify({
            result: {
              version: "0.9.0-rc5",
              peers_count: endpoint.includes("node1") ? 2 : 1,
              pubkey: endpoint.includes("node1")
                ? "02942f9602e5afe0287879b829306d35804c8a2d28ace1d8248b553f580850d696"
                : "02bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
            }
          });
        }
      };
    }
    if (payload.method === "list_channels") {
      const liquidity =
        runState.phase === "ready"
          ? endpoint.includes("node1")
            ? "30100000000"
            : "15000000000"
          : endpoint.includes("node1")
            ? "1000000000"
            : "15000000000";
      return {
        ok: true,
        async text() {
          return JSON.stringify({
            result: {
              channels: [
                {
                  state: { state_name: "ChannelReady" },
                  local_balance: liquidity,
                  channel_id: endpoint
                }
              ]
            }
          });
        }
      };
    }
    if (payload.method === "graph_nodes") {
      return {
        ok: true,
        async text() {
          return JSON.stringify({
            result: {
              nodes: [
                {
                  pubkey:
                    "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
                }
              ]
            }
          });
        }
      };
    }
    if (payload.method === "graph_channels") {
      return {
        ok: true,
        async text() {
          return JSON.stringify({
            result: {
              channels: [
                {
                  node1: endpoint.includes("node1")
                    ? "02942f9602e5afe0287879b829306d35804c8a2d28ace1d8248b553f580850d696"
                    : "02bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                  node2:
                    "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
                }
              ]
            }
          });
        }
      };
    }
    if (payload.method === "build_router") {
      if (runState.phase === "ready") {
        return {
          ok: true,
          async text() {
            return JSON.stringify({
              result: {
                router_hops: [
                  {
                    target:
                      "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea",
                    amount_received: endpoint.includes("node1")
                      ? "10000000010"
                      : "10000000012",
                    incoming_tlc_expiry: endpoint.includes("node1") ? 42 : 45
                  }
                ]
              }
            });
          }
        };
      }
      return {
        ok: true,
        async text() {
          return JSON.stringify({
            error: {
              code: -32000,
              message:
                "Failed to build route, Insufficient balance: max outbound liquidity 1000000000 is insufficient, required amount: 10000000000"
            }
          });
        }
      };
    }
    if (payload.method === "send_payment") {
      if (runState.phase === "ready") {
        return {
          ok: true,
          async text() {
            return JSON.stringify({
              result: {
                payment_hash: `0x${endpoint}-ready`,
                status: "Created",
                fee: "10"
              }
            });
          }
        };
      }
      return {
        ok: true,
        async text() {
          return JSON.stringify({
            error: {
              code: -32000,
              message:
                "Send payment error: Failed to build route, Insufficient balance: max outbound liquidity 1000000000 is insufficient, required amount: 10000000000"
            }
          });
        }
      };
    }

    throw new Error(`Unexpected RPC method ${payload.method}`);
  };

  try {
    await runDiagnosis(
      {
        mode: "live",
        amount: "10000000000",
        targetPubkey:
          "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
      },
      {
        defaultEndpoint: "http://node1.test",
        historyPath,
        nodeSet: [
          {
            id: "node1",
            name: "node1",
            endpoint: "http://node1.test",
            primary: true
          },
          { id: "node2", name: "node2", endpoint: "http://node2.test" }
        ]
      }
    );

    runState.phase = "blocked";

    const result = await runDiagnosis(
      {
        mode: "live",
        amount: "10000000000",
        targetPubkey:
          "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
      },
      {
        defaultEndpoint: "http://node1.test",
        historyPath,
        nodeSet: [
          {
            id: "node1",
            name: "node1",
            endpoint: "http://node1.test",
            primary: true
          },
          { id: "node2", name: "node2", endpoint: "http://node2.test" }
        ]
      }
    );

    assert.ok(result.history.relatedCount >= 1);
    assert.ok(result.history.comparison);
    assert.equal(result.history.comparison.probeStatusChanged, true);
    assert.ok(
      result.history.comparison.nodeChanges.some(
        (change) => change.node === "node1"
      )
    );
    assert.ok(
      result.diagnosis.nextActions.some((action) =>
        /baseline|compare|history|node1 outbound liquidity fell/i.test(action)
      )
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
