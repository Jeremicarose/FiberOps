export function humanize(value) {
  return String(value || "unknown")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatTimestamp(value) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export function valueOrDash(value) {
  return value === null || value === undefined ? "Unknown" : String(value);
}

export function booleanLabel(value) {
  if (value === null || value === undefined) {
    return "Unknown";
  }
  return value ? "Yes" : "No";
}

export function shortenHash(value, size = 16) {
  const stringValue = String(value || "");
  if (stringValue.length <= size) {
    return stringValue;
  }
  return `${stringValue.slice(0, size)}…${stringValue.slice(-6)}`;
}

export function numericTone(value) {
  if (value === null || value === undefined) {
    return "muted";
  }
  return Number(value) > 0 ? "positive" : "critical";
}

export function partialErrorTone(value) {
  if (value === null || value === undefined) {
    return "muted";
  }
  return Number(value) > 0 ? "warning" : "positive";
}

export function booleanTone(value) {
  if (value === null || value === undefined) {
    return "muted";
  }
  return value ? "positive" : "critical";
}

export function invoiceExpiryTone(value) {
  if (value === null || value === undefined) {
    return "muted";
  }
  return value ? "critical" : "positive";
}

export function toneFromReadiness(readiness) {
  switch (readiness) {
    case "healthy":
    case "ready":
      return "positive";
    case "blocked":
    case "not_ready":
      return "critical";
    case "degraded":
      return "warning";
    default:
      return "muted";
  }
}

export function toneFromPaymentStatus(status) {
  switch (status) {
    case "Success":
      return "positive";
    case "Failed":
      return "critical";
    case "Inflight":
    case "Created":
      return "warning";
    default:
      return "muted";
  }
}

export function sanitizeReferenceUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") {
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
}
