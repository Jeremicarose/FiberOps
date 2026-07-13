import { humanize, shortenHash } from "../utils.js";

export function createChannelsViewModel(state) {
  const snapshot = state.channelsSnapshot || { channels: [] };
  const channels = Array.isArray(snapshot.channels) ? snapshot.channels : [];
  const selected =
    channels.find((channel) => channel.id === state.selectedChannelId) ||
    channels[0] ||
    null;

  return {
    rows: channels.map((channel) => ({
      id: channel.id,
      clickable: true,
      cells: {
        channel: shortenHash(channel.id || "unknown", 18),
        state: humanize(channel.state || "unknown"),
        node: channel.nodeName || "Unknown node",
        balance: channel.localBalance || "Unknown",
        readiness: humanize(channel.routeReadiness || "unknown"),
        peer: shortenHash(channel.peerPubkey || "—", 14)
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
                { label: "State", value: humanize(selected.state || "unknown") },
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
                  label: "Route readiness",
                  value: humanize(selected.routeReadiness || "unknown")
                },
                { label: "Peer pubkey", value: selected.peerPubkey || "Unknown" },
                { label: "Failure", value: selected.failure || "None" }
              ]
            }
          ]
        }
      : null
  };
}
