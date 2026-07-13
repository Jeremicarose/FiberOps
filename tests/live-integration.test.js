import test from "node:test";
import assert from "node:assert/strict";

import { runDiagnosis } from "../src/lib/diagnostics.js";

const enabled = process.env.FIBEROPS_LIVE_TESTS === "1";
const liveEnvReady = Boolean(
  process.env.FIBEROPS_SUCCESS_PAYMENT_HASH &&
  process.env.FIBEROPS_FAILED_PAYMENT_HASH &&
  process.env.FIBEROPS_TARGET_PUBKEY
);
const maybeTest = enabled && liveEnvReady ? test : test.skip;
const nodeSet = [
  {
    id: "node1",
    name: "node1",
    endpoint: process.env.FIBER_RPC_URL || "http://127.0.0.1:8227",
    primary: true
  },
  {
    id: "node2",
    name: "node2",
    endpoint: process.env.FIBER_RPC_URL_NODE2 || "http://127.0.0.1:8237"
  }
];
const knownSuccess = process.env.FIBEROPS_SUCCESS_PAYMENT_HASH;
const knownFailure = process.env.FIBEROPS_FAILED_PAYMENT_HASH;
const targetPubkey = process.env.FIBEROPS_TARGET_PUBKEY;
const probeAmount = process.env.FIBEROPS_PROBE_AMOUNT || "10000000000";

maybeTest("live lab returns both node snapshots", async () => {
  const result = await runDiagnosis(
    {
      mode: "live",
      amount: probeAmount,
      targetPubkey
    },
    {
      defaultEndpoint: nodeSet[0].endpoint,
      nodeSet
    }
  );

  assert.equal(result.source, "live");
  assert.equal(result.nodes.length, 2);
  assert.equal(result.summary.multiNode.enabled, true);
});

maybeTest("live lab diagnoses known successful payment hash", async () => {
  const result = await runDiagnosis(
    {
      mode: "live",
      paymentHash: knownSuccess
    },
    {
      defaultEndpoint: nodeSet[0].endpoint,
      nodeSet
    }
  );

  assert.equal(result.diagnosis.category, "success");
});

maybeTest("live lab diagnoses known failed payment hash", async () => {
  const result = await runDiagnosis(
    {
      mode: "live",
      paymentHash: knownFailure
    },
    {
      defaultEndpoint: nodeSet[0].endpoint,
      nodeSet
    }
  );

  assert.notEqual(result.diagnosis.category, "success");
});
