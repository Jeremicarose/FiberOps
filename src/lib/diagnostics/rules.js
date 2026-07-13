const FAILURE_RULES = [
  {
    id: "insufficient_liquidity",
    pattern:
      /insufficient balance|max outbound liquidity|insufficient liquidity|temporarychannelfailure|liquidity exhausted|outbound/i,
    headline: "Channel liquidity is the likely failure point",
    severity: "high",
    confidence: 0.94,
    explanation:
      "The failure indicates there is not enough outbound balance on the available channel set to cover the requested amount. Fiber could not build a route because liquidity was insufficient, not because the destination was unknown.",
    actions: [
      "Retry with a smaller amount that fits within current outbound liquidity.",
      "Open or refill channels before attempting the full payment again.",
      "Use this exact failed_error string in FiberOps so operators can distinguish route absence from route insufficiency."
    ],
    refs: ["troubleshooting", "paymentLifecycle"]
  },
  {
    id: "route_unavailable",
    pattern:
      /failed to build route|no route could be found|route not found|no path/i,
    headline: "Fiber could not build a usable route",
    severity: "high",
    confidence: 0.94,
    explanation:
      "The node could not find a route that satisfies the amount, connectivity, and fee constraints. This often means the target is not reachable in the current graph or no path has enough liquidity.",
    actions: [
      "Verify the target node exists in the network graph and uses a pubkey, not a legacy peer_id.",
      "Inspect local channels for sufficient balance before retrying.",
      "Try a smaller amount or a different route strategy if the target is only marginally reachable."
    ],
    refs: ["troubleshooting", "multiHop"]
  },
  {
    id: "fee_budget_too_low",
    pattern:
      /feeinsufficient|fee too high|max_fee_amount|max_fee_rate|relay fee/i,
    headline: "The fee budget is too low for the selected route",
    severity: "medium",
    confidence: 0.95,
    explanation:
      "Fiber found a route, but the forwarded amount does not cover cumulative relay fees or the max fee budget is too tight.",
    actions: [
      "Increase max_fee_amount or max_fee_rate before retrying.",
      "Use dry_run in your operational tooling to preview route fees before sending.",
      "Prefer shorter or cheaper routes when you can influence route selection."
    ],
    refs: ["troubleshooting", "paymentLifecycle"]
  },
  {
    id: "timeout_or_expiry",
    pattern: /expirytoosoon|timeout|timed out|expiry/i,
    headline: "The payment likely failed on timeout or expiry constraints",
    severity: "medium",
    confidence: 0.86,
    explanation:
      "The route appears to have run out of time lock budget or took too long to complete across intermediate hops.",
    actions: [
      "Retry on a shorter or healthier route if you can control routing.",
      "Increase tlc_expiry_delta in the sending flow when appropriate.",
      "Check intermediate node availability if timeouts happen repeatedly."
    ],
    refs: ["troubleshooting", "multiHop"]
  },
  {
    id: "invoice_mismatch",
    pattern:
      /incorrectorunknownpaymentdetails|invoice mismatch|payment hash|invoice/i,
    headline: "The invoice details do not match what the receiver expects",
    severity: "high",
    confidence: 0.93,
    explanation:
      "The payment reached the recipient path but failed validation against invoice details such as amount, hash, or expiry.",
    actions: [
      "Parse the invoice before paying to validate amount and expiry.",
      "Request a fresh invoice if the current one may be stale or copied incorrectly.",
      "Confirm the payment hash matches the intended invoice."
    ],
    refs: ["troubleshooting", "sdk"]
  },
  {
    id: "channel_unavailable",
    pattern: /permanentchannelfailure|channel closed|channel unavailable/i,
    headline: "A required channel is unavailable or closed",
    severity: "high",
    confidence: 0.89,
    explanation:
      "The route depends on a channel that is no longer usable, so Fiber should avoid it after the failure is learned and propagated.",
    actions: [
      "Reconnect peers and let the graph refresh before retrying.",
      "Remove or deprioritize unstable peers from operational route choices.",
      "Capture channel-level incident history so operators can spot chronic failures."
    ],
    refs: ["troubleshooting", "multiHop"]
  },
  {
    id: "node_unavailable",
    pattern: /temporarynodefailure|node temporarily unavailable|offline/i,
    headline: "An intermediate node appears temporarily unavailable",
    severity: "medium",
    confidence: 0.87,
    explanation:
      "The failure points to a node on the route being temporarily down or unable to forward the payment right now.",
    actions: [
      "Retry after a short delay and compare with an alternate route if possible.",
      "Track peer uptime and recent failures so repeated outages are visible.",
      "Escalate chronic node instability to the operator or avoid that peer."
    ],
    refs: ["troubleshooting", "multiHop"]
  },
  {
    id: "feature_missing",
    pattern: /requirednodefeaturemissing|trampoline/i,
    headline: "The selected route is missing a required feature",
    severity: "medium",
    confidence: 0.96,
    explanation:
      "This usually means a trampoline node or intermediate hop does not advertise the feature required by the payment flow.",
    actions: [
      "Choose a different trampoline node or route that advertises the required feature bits.",
      "Inspect node features in your routing diagnostics before selecting trampoline hops.",
      "If possible, compare behavior with a non-trampoline route to isolate the issue."
    ],
    refs: ["troubleshooting", "trampoline"]
  }
];

const DEFAULT_FAILURE = {
  headline: "Fiber returned a failure that needs closer inspection",
  category: "unknown_failure",
  severity: "medium",
  confidence: 0.6,
  explanation:
    "The payment failed, but the current ruleset does not map the failed_error cleanly to a documented category yet.",
  actions: [
    "Capture the exact failed_error and add a rule for it in the diagnostics engine.",
    "Compare the failure against recent successful attempts with the same target and amount.",
    "Cross-check the Fiber troubleshooting guide for newly documented failure modes."
  ],
  refs: ["troubleshooting", "sdk"]
};

export function classifyFailure(rawFailure) {
  const value = String(rawFailure || "");

  for (const rule of FAILURE_RULES) {
    if (rule.pattern.test(value)) {
      return materializeRule(rule);
    }
  }

  return {
    ...DEFAULT_FAILURE
  };
}

export function getRuleCatalog() {
  return FAILURE_RULES.map((rule) => ({
    id: rule.id,
    kind: "payment_failure",
    pattern: rule.pattern.source,
    headline: rule.headline,
    severity: rule.severity,
    confidence: rule.confidence,
    refs: [...rule.refs]
  }));
}

function materializeRule(rule) {
  return {
    headline: rule.headline,
    category: rule.id,
    severity: rule.severity,
    confidence: rule.confidence,
    explanation: rule.explanation,
    actions: [...rule.actions],
    refs: [...rule.refs]
  };
}
