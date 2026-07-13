const now = Math.floor(Date.now() / 1000);

export const demoScenarios = [
  {
    id: "route-build-failure",
    name: "Route unavailable",
    description:
      "A payment fails because Fiber cannot build a viable route with the current graph and balances.",
    request: {
      amount: "150000000",
      targetPubkey:
        "0x0293a7b4b4c1dbba2fca5f2cf7ce6d85afdfbb31f872f2f91b6720e2a4bb6a9011"
    },
    context: {
      nodeInfo: {
        version: "v0.9.0-rc5",
        peers_count: "0x4",
        channel_count: "0x3"
      },
      channels: [
        {
          channel_id: "0xaaa1",
          state: "Open",
          local_balance: "40000000",
          remote_balance: "60000000"
        },
        {
          channel_id: "0xaaa2",
          state: "Open",
          local_balance: "55000000",
          remote_balance: "35000000"
        }
      ],
      payment: {
        status: "Failed",
        failedError: "Failed to build route: no route could be found"
      }
    }
  },
  {
    id: "fee-too-high",
    name: "Fee budget too low",
    description:
      "The route exists, but the relay fees exceed the sender's max fee budget.",
    request: {
      amount: "95000000"
    },
    context: {
      nodeInfo: {
        version: "v0.9.0-rc5",
        peers_count: "0x5",
        channel_count: "0x4"
      },
      channels: [
        {
          channel_id: "0xbbb1",
          state: "Open",
          local_balance: "180000000",
          remote_balance: "220000000"
        }
      ],
      payment: {
        status: "Failed",
        failedError: "FeeInsufficient"
      }
    }
  },
  {
    id: "expired-invoice",
    name: "Expired invoice",
    description:
      "The invoice is valid structurally, but its expiry has already passed.",
    request: {
      amount: "25000000",
      invoice: "lnfib1expired-demo"
    },
    context: {
      nodeInfo: {
        version: "v0.9.0-rc5",
        peers_count: "0x3",
        channel_count: "0x2"
      },
      channels: [
        {
          channel_id: "0xccc1",
          state: "Open",
          local_balance: "50000000",
          remote_balance: "15000000"
        }
      ],
      parsedInvoice: {
        currency: "CKB",
        amount: "25000000",
        timestamp: now - 7200,
        expiry: 3600,
        payment_hash:
          "0x8d9dbb9d9328f93ccfd4d469ef29b97f6f18b65297d6f7df2d1198495d2f1c11",
        data: {
          attrs: [
            {
              description: "Fiber test invoice"
            }
          ]
        }
      }
    }
  },
  {
    id: "trampoline-feature-missing",
    name: "Trampoline feature missing",
    description:
      "A trampoline payment fails because the selected trampoline node does not support the required feature bit.",
    request: {
      amount: "42000000"
    },
    context: {
      nodeInfo: {
        version: "v0.9.0-rc5",
        peers_count: "0x6",
        channel_count: "0x4"
      },
      channels: [
        {
          channel_id: "0xddd1",
          state: "Open",
          local_balance: "91000000",
          remote_balance: "120000000"
        }
      ],
      payment: {
        status: "Failed",
        failedError: "RequiredNodeFeatureMissing"
      }
    }
  },
  {
    id: "target-missing-from-graph",
    name: "Target missing from graph",
    description:
      "The sender has capacity, but the destination pubkey is not visible in the current graph snapshot.",
    request: {
      amount: "25000000",
      targetPubkey: "0xdeadbeef"
    },
    context: {
      nodeInfo: {
        version: "v0.9.0-rc5",
        peers_count: "0x2",
        channel_count: "0x1"
      },
      channels: [
        {
          channel_id: "0xeee1",
          state: "Open",
          local_balance: "125000000",
          remote_balance: "45000000"
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
  },
  {
    id: "preflight-liquidity-block",
    name: "Preflight liquidity block",
    description:
      "The node has an open channel, but outbound liquidity is too low for the requested amount before a send is attempted.",
    request: {
      amount: "350000000"
    },
    context: {
      nodeInfo: {
        version: "v0.9.0-rc5",
        peers_count: "0x3",
        channel_count: "0x1"
      },
      channels: [
        {
          channel_id: "0xfff1",
          state: "Open",
          local_balance: "120000000",
          remote_balance: "90000000"
        }
      ]
    }
  },
  {
    id: "channel-not-ready",
    name: "Channel not ready",
    description:
      "The node returns channels, but none are in an open or ready state for payment forwarding.",
    request: {
      amount: "25000000"
    },
    context: {
      nodeInfo: {
        version: "v0.9.0-rc5",
        peers_count: "0x2",
        channel_count: "0x1"
      },
      channels: [
        {
          channel_id: "0xfff2",
          state: "AwaitingLockIn",
          local_balance: "90000000",
          remote_balance: "70000000"
        }
      ]
    }
  },
  {
    id: "rpc-unauthorized",
    name: "RPC unauthorized",
    description:
      "The node responds, but the caller is missing a valid Biscuit bearer token.",
    request: {
      endpoint: "http://127.0.0.1:8227"
    },
    context: {
      error: {
        code: -32999,
        message: "Unauthorized"
      }
    }
  },
  {
    id: "rpc-unavailable",
    name: "RPC unavailable",
    description:
      "The node cannot be reached over JSON-RPC, which blocks diagnostics entirely.",
    request: {
      endpoint: "http://127.0.0.1:8227"
    },
    context: {
      error: {
        code: "TRANSPORT_ERROR",
        message: "Unable to reach Fiber RPC endpoint."
      }
    }
  }
];

export function getDemoScenario(id) {
  return demoScenarios.find((scenario) => scenario.id === id);
}

export function listDemoScenarioMeta() {
  return demoScenarios.map(({ id, name, description }) => ({
    id,
    name,
    description
  }));
}
