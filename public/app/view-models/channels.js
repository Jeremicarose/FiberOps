import { humanize, shortenHash } from "../utils.js";

export function createChannelsViewModel(state) {
  const snapshot = state.channelsSnapshot || { channels: [] };
  const channels = Array.isArray(snapshot.channels) ? snapshot.channels : [];
  const selected =
    channels.find((channel) => channel.id === state.selectedChannelId) ||
    channels[0] ||
    null;

  return {
    metrics: [
      {
        label: "Tracked channels",
        value: String(channels.length),
        tone: channels.length ? "positive" : "muted",
        detail: "Liquidity surfaces visible in the active snapshot"
      },
      {
        label: "Ready channels",
        value: String(
          channels.filter((channel) =>
            ["healthy", "ready"].includes(channel.routeReadiness)
          ).length
        ),
        tone: "positive",
        detail: "Channels currently aligned with payment readiness"
      },
      {
        label: "Bottlenecks",
        value: String(
          channels.filter((channel) =>
            ["blocked", "degraded", "not_ready"].includes(
              channel.routeReadiness
            )
          ).length
        ),
        tone: "warning",
        detail: "Likely route-limiting channels"
      },
      {
        label: "Selected channel",
        value: selected ? shortenHash(selected.id || "channel", 14) : "None",
        tone: "neutral",
        detail: selected?.nodeName || "Choose a channel to inspect"
      }
    ],
    rows: channels.map((channel) => ({
      id: channel.id,
      clickable: true,
      cells: {
        channel: {
          text: shortenHash(channel.id || "unknown", 18),
          meta: channel.nodeName || "Unknown node"
        },
        state: {
          text: humanize(channel.state || "unknown"),
          tone: String(channel.state || "")
            .toLowerCase()
            .includes("ready")
            ? "positive"
            : "warning"
        },
        peer: {
          text: shortenHash(channel.peerPubkey || "—", 14),
          meta: channel.endpoint || null
        },
        balance: {
          text: channel.localBalance || "Unknown",
          meta: channel.remoteBalance
            ? `Remote ${channel.remoteBalance}`
            : "Remote balance unavailable",
          mono: true
        },
        readiness: {
          text: humanize(channel.routeReadiness || "unknown"),
          tone:
            channel.routeReadiness === "ready"
              ? "positive"
              : channel.routeReadiness === "blocked"
                ? "critical"
                : "warning"
        },
        capacity: {
          text: channel.capacity || "Unknown",
          mono: true
        }
      }
    })),
    selected,
    inspector: selected
      ? {
          entityType: "channel",
          entityId: selected.id,
          title: shortenHash(selected.id || "Channel", 22),
          subtitle: selected.nodeName || selected.endpoint || "Unknown node",
          sections: [
            {
              title: "Balance and state",
              fields: [
                {
                  label: "State",
                  value: humanize(selected.state || "unknown")
                },
                { label: "Capacity", value: selected.capacity || "Unknown" },
                {
                  label: "Local balance",
                  value: selected.localBalance || "Unknown"
                },
                {
                  label: "Remote balance",
                  value: selected.remoteBalance || "Unknown"
                }
              ]
            },
            {
              title: "Route fit",
              fields: [
                {
                  label: "Readiness",
                  value: humanize(selected.routeReadiness || "unknown")
                },
                {
                  label: "Peer pubkey",
                  value: selected.peerPubkey || "Unknown"
                },
                { label: "Failure", value: selected.failure || "None" }
              ]
            }
          ]
        }
      : null
  };
}
