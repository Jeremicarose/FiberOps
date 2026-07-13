import { humanize, shortenHash } from "../utils.js";

export function createPaymentsViewModel(state) {
  const payments = derivePayments(state);
  const selected =
    payments.find((item) => item.id === state.selectedPaymentId) ||
    payments[0] ||
    null;

  return {
    metrics: [
      {
        label: "Tracked payments",
        value: String(payments.length),
        tone: payments.length ? "positive" : "muted",
        detail: "History-backed payment records in the current workspace"
      },
      {
        label: "Blocked or failed",
        value: String(
          payments.filter(
            (item) => item.status === "blocked" || item.status === "failed"
          ).length
        ),
        tone: payments.some(
          (item) => item.status === "blocked" || item.status === "failed"
        )
          ? "critical"
          : "positive",
        detail: "Payments needing operator follow-up"
      },
      {
        label: "Verified route proof",
        value: String(
          payments.filter((item) => item.routeProof === "confirmed").length
        ),
        tone: payments.some((item) => item.routeProof === "confirmed")
          ? "positive"
          : "warning",
        detail: "Dry-run or success-backed route evidence"
      },
      {
        label: "Most recent source",
        value: humanize(selected?.source || "none"),
        tone: "neutral",
        detail: selected?.nodeName || "No payment selected"
      }
    ],
    rows: payments.map((item) => ({
      id: item.id,
      clickable: true,
      cells: {
        payment: {
          text: item.label,
          meta: item.nodeName || item.targetPubkey || "Unknown payment"
        },
        status: {
          text: humanize(item.status),
          tone: item.tone
        },
        amount: {
          text: item.amount || "Unknown",
          mono: true
        },
        routeProof: {
          text: humanize(item.routeProof || "unknown"),
          tone: item.routeProofTone
        },
        time: {
          text: item.timestampLabel,
          meta: item.source
        },
        reason: {
          text: item.reason || "No failure explanation",
          meta: item.confidence
            ? `Confidence: ${humanize(item.confidence)}`
            : null
        }
      }
    })),
    selected,
    inspector: selected
      ? {
          entityType: "payment",
          entityId: selected.id,
          title: selected.label,
          subtitle: `${selected.timestampLabel} · ${humanize(selected.source || "history")}`,
          sections: [
            {
              title: "Payment snapshot",
              fields: [
                { label: "Status", value: humanize(selected.status) },
                { label: "Amount", value: selected.amount || "Unknown" },
                { label: "Node", value: selected.nodeName || "Unknown" },
                {
                  label: "Target",
                  value: selected.targetPubkey || selected.invoice || "Unknown"
                }
              ]
            },
            {
              title: "Diagnosis and route evidence",
              fields: [
                {
                  label: "Headline",
                  value: selected.headline || "Not available"
                },
                {
                  label: "Route proof",
                  value: humanize(selected.routeProof || "unknown")
                },
                {
                  label: "Confidence",
                  value: humanize(selected.confidence || "unknown")
                },
                { label: "Reason", value: selected.reason || "Not available" }
              ]
            }
          ]
        }
      : null
  };
}

function derivePayments(state) {
  const historyItems = Array.isArray(state.activitySnapshot?.server)
    ? state.activitySnapshot.server
    : [];
  const derived = historyItems.map((item, index) => {
    const id =
      item.event?.id || item.request?.paymentHash || `payment-${index + 1}`;
    const paymentHash = item.request?.paymentHash || null;
    const timestamp = item.event?.timestamp || item.analyzedAt || Date.now();
    const readiness = item.summary?.paymentReadiness || null;
    const category = item.diagnosis?.category || null;
    const routeProof =
      item.summary?.routeProof || item.routePreview?.status || null;
    const status =
      readiness === "blocked"
        ? "blocked"
        : category === "success" ||
            readiness === "healthy" ||
            readiness === "ready"
          ? "healthy"
          : category === "payment_failed"
            ? "failed"
            : readiness || category || "unknown";

    return {
      id,
      label: paymentHash ? shortenHash(paymentHash, 14) : shortenHash(id, 14),
      paymentHash,
      timestamp,
      timestampLabel: new Date(timestamp).toLocaleString(),
      status,
      tone:
        status === "healthy"
          ? "positive"
          : status === "blocked" || status === "failed"
            ? "critical"
            : "warning",
      routeProof,
      routeProofTone:
        routeProof === "confirmed"
          ? "positive"
          : routeProof === "blocked"
            ? "critical"
            : "warning",
      amount:
        item.request?.amount ||
        item.routePreview?.requestedAmount ||
        item.summary?.estimatedOutbound ||
        null,
      nodeName:
        item.nodes?.find((node) => node.selected)?.name ||
        item.request?.endpoint ||
        null,
      targetPubkey:
        item.request?.targetPubkey || item.summary?.targetPubkey || null,
      invoice: item.request?.invoice || null,
      source: item.source || item.event?.source || "history",
      headline: item.diagnosis?.headline || item.event?.headline || null,
      reason:
        item.routePreview?.blockingReason ||
        item.diagnosis?.headline ||
        item.summary?.paymentStatus ||
        null,
      confidence: item.diagnosis?.confidence
        ? String(item.diagnosis.confidence)
        : null
    };
  });

  if (state.lastDiagnosisResult) {
    const result = state.lastDiagnosisResult;
    const id =
      result.event?.id || result.request?.paymentHash || "latest-diagnosis";
    if (!derived.some((item) => item.id === id)) {
      derived.unshift({
        id,
        label: result.request?.paymentHash
          ? shortenHash(result.request.paymentHash, 14)
          : "Latest diagnosis",
        paymentHash: result.request?.paymentHash || null,
        timestamp: result.event?.timestamp || Date.now(),
        timestampLabel: new Date(
          result.event?.timestamp || Date.now()
        ).toLocaleString(),
        status:
          result.summary?.paymentReadiness ||
          result.diagnosis?.category ||
          "unknown",
        tone:
          result.summary?.paymentReadiness === "ready" ||
          result.summary?.paymentReadiness === "healthy"
            ? "positive"
            : result.summary?.paymentReadiness === "blocked"
              ? "critical"
              : "warning",
        routeProof:
          result.summary?.routeProof || result.routePreview?.status || null,
        routeProofTone:
          result.summary?.routeProof === "confirmed" ? "positive" : "warning",
        amount:
          result.request?.amount ||
          result.routePreview?.requestedAmount ||
          result.summary?.estimatedOutbound ||
          null,
        nodeName:
          result.nodes?.find((node) => node.selected)?.name ||
          result.summary?.endpoint ||
          null,
        targetPubkey:
          result.request?.targetPubkey || result.summary?.targetPubkey || null,
        invoice: result.request?.invoice || null,
        source: result.source || "diagnosis",
        headline: result.diagnosis?.headline || null,
        reason:
          result.routePreview?.blockingReason ||
          result.diagnosis?.headline ||
          result.summary?.paymentStatus ||
          null,
        confidence: result.diagnosis?.confidence
          ? String(result.diagnosis.confidence)
          : null
      });
    }
  }

  return derived;
}
