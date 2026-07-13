import { mkdtemp, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  attachPageDiagnostics,
  jsonResponse,
  loadPlaywright,
  loadStaticFiles
} from "./browser-harness.mjs";
import { getRuntimeStatus, runDiagnosis } from "../src/lib/diagnostics.js";
import { createHistoryBackend } from "../src/lib/history-backend.js";
import {
  buildBootstrapPayload,
  createFiberOpsConfig,
  getConfiguredNodeSet
} from "../src/lib/server-app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..");
const publicDir = path.join(projectRoot, "public");
const screenshotsDir = path.join(projectRoot, "docs", "screenshots");

const playwright = await loadPlaywright(projectRoot);
const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "fiberops-readme-"));
const config = createFiberOpsConfig({
  runtimeDir,
  historyPath: path.join(runtimeDir, "diagnostic-history.json")
});
const bootstrap = await buildBootstrapPayload(config);
const files = await loadStaticFiles(publicDir);

await mkdir(screenshotsDir, { recursive: true });

const browser = await playwright.chromium.launch({
  channel: "chromium",
  headless: true
});

try {
  await captureGuidedHome(browser);
  await captureBlockedRoute(browser);
  await captureMultiNodeComparison(browser);
  await captureRpcFailure(browser);
  process.stdout.write(`Saved screenshots to ${screenshotsDir}\n`);
} finally {
  await browser.close();
}

async function captureGuidedHome(browser) {
  const context = await browser.newContext({
    viewport: { width: 1512, height: 1200 }
  });
  const page = await context.newPage();
  attachPageDiagnostics(page);

  try {
    await installRoutes(
      page,
      createDesktopHandlers({
        async diagnose(route) {
          const payload = route.request().postDataJSON() || {};
          const result = await runDiagnosis(payload, {
            defaultEndpoint: config.defaultEndpoint,
            historyBackend: createHistoryBackend({
              historyPath: config.historyPath,
              historyBackend: config.historyBackend
            })
          });
          return successResponse("/api/diagnose", result);
        }
      })
    );

    await page.goto("http://fiberops.local/", { waitUntil: "networkidle" });
    await page.waitForFunction(() =>
      document.querySelector("#bootstrap-badge")?.textContent?.includes("Ready")
    );
    await page.click('[data-nav-workspace="testing"]');
    await page.waitForFunction(() => {
      const heading = document.querySelector(".workspace-screen--testing h2");
      return heading?.textContent?.includes("Guided proof");
    });

    await page.screenshot({
      path: path.join(screenshotsDir, "guided-home.png"),
      fullPage: true
    });
  } finally {
    await context.close();
  }
}

async function captureBlockedRoute(browser) {
  const context = await browser.newContext({
    viewport: { width: 1512, height: 1400 }
  });
  const page = await context.newPage();
  attachPageDiagnostics(page);

  try {
    await installRoutes(
      page,
      createDesktopHandlers({
        async diagnose(route) {
          const payload = route.request().postDataJSON() || {};
          const result = await runDiagnosis(payload, {
            defaultEndpoint: config.defaultEndpoint,
            historyBackend: createHistoryBackend({
              historyPath: config.historyPath,
              historyBackend: config.historyBackend
            })
          });
          return successResponse("/api/diagnose", result);
        }
      })
    );

    await page.goto("http://fiberops.local/", { waitUntil: "networkidle" });
    await page.waitForFunction(() =>
      document.querySelector("#bootstrap-badge")?.textContent?.includes("Ready")
    );
    await page.click('[data-nav-workspace="diagnostics"]');
    await page.waitForSelector("#diagnostics-form");
    await page.selectOption(
      '#diagnostics-form select[name="scenarioId"]',
      "preflight-liquidity-block"
    );
    await page.click('#diagnostics-form button[type="submit"]');
    await page.waitForFunction(() => {
      const headline =
        document.querySelector(".hero-diagnosis h3")?.textContent || "";
      return headline.includes("Outbound liquidity is too low");
    });

    await page.screenshot({
      path: path.join(screenshotsDir, "blocked-route-diagnosis.png"),
      fullPage: true
    });
  } finally {
    await context.close();
  }
}

async function captureMultiNodeComparison(browser) {
  const context = await browser.newContext({
    viewport: { width: 1512, height: 1400 }
  });
  const page = await context.newPage();
  attachPageDiagnostics(page);
  const originalFetch = globalThis.fetch;
  const targetPubkey =
    "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea";

  try {
    await installRoutes(
      page,
      createDesktopHandlers({
        async diagnose(route) {
          const directory = await mkdtemp(
            path.join(os.tmpdir(), "fiberops-readme-multi-")
          );
          const historyPath = path.join(directory, "diagnostic-history.json");
          const payload = route.request().postDataJSON() || {};

          globalThis.fetch = async (url, options) => {
            const requestPayload = JSON.parse(options.body);
            const endpoint = String(url);
            const isNode1 = endpoint.includes("node1.test");
            const nodePubkey = isNode1
              ? "02942f9602e5afe0287879b829306d35804c8a2d28ace1d8248b553f580850d696"
              : "02bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

            if (requestPayload.method === "node_info") {
              return rpcResult({
                version: "0.9.0-rc5",
                peers_count: isNode1 ? 2 : 1,
                pubkey: nodePubkey
              });
            }

            if (requestPayload.method === "list_channels") {
              return rpcResult({
                channels: [
                  {
                    state: { state_name: "ChannelReady" },
                    local_balance: isNode1 ? "30100000000" : "900000000",
                    channel_id: isNode1 ? "0xnode1" : "0xnode2"
                  }
                ]
              });
            }

            if (requestPayload.method === "graph_nodes") {
              return rpcResult({
                nodes: [{ pubkey: targetPubkey }]
              });
            }

            if (requestPayload.method === "graph_channels") {
              return rpcResult({
                nodes: [
                  { pubkey: nodePubkey },
                  { pubkey: targetPubkey },
                  {
                    pubkey:
                      "02cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
                  }
                ],
                channels: isNode1
                  ? [
                      {
                        node1: nodePubkey,
                        node2:
                          "02cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
                      },
                      {
                        node1:
                          "02cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
                        node2: targetPubkey
                      }
                    ]
                  : [
                      {
                        node1: nodePubkey,
                        node2: targetPubkey
                      }
                    ]
              });
            }

            if (requestPayload.method === "build_router") {
              const pathPubkeys = normalizePathPubkeys(
                requestPayload.params?.hops_info
              );
              if (!pathPubkeys.length) {
                return rpcError(-32602, "invalid hops_info");
              }
              return rpcResult({
                total_amount: requestPayload.params?.amount || "150000000",
                fee: isNode1 ? "1200" : "4500",
                hops: pathPubkeys.map((pubkey, index) => ({
                  pubkey,
                  channel_id: `${isNode1 ? "node1" : "node2"}-${index + 1}`,
                  amount: requestPayload.params?.amount || "150000000",
                  expiry: 42 + index
                }))
              });
            }

            if (requestPayload.method === "send_payment") {
              if (isNode1) {
                return rpcResult({
                  status: "dry_run_ready",
                  fee: "1200",
                  hops: [
                    {
                      channel_id: "0xnode1",
                      amount: "150000000",
                      state: "ChannelReady"
                    }
                  ]
                });
              }

              return rpcError(
                12001,
                "TemporaryChannelFailure: insufficient outbound liquidity for this sender"
              );
            }

            return rpcError(
              -32601,
              `Unsupported method: ${requestPayload.method}`
            );
          };

          const result = await runDiagnosis(
            {
              ...payload,
              mode: "live",
              endpoint: "http://node1.test",
              amount: payload.amount || "150000000",
              targetPubkey: payload.targetPubkey || targetPubkey
            },
            {
              defaultEndpoint: "http://node1.test",
              historyBackend: createHistoryBackend({ historyPath }),
              nodeSet: [
                {
                  id: "node1",
                  name: "node1",
                  endpoint: "http://node1.test",
                  primary: true,
                  probe: true
                },
                {
                  id: "node2",
                  name: "node2",
                  endpoint: "http://node2.test",
                  primary: false,
                  probe: true
                }
              ]
            }
          );

          return successResponse("/api/diagnose", result);
        }
      })
    );

    await page.goto("http://fiberops.local/", { waitUntil: "networkidle" });
    await page.waitForFunction(() =>
      document.querySelector("#bootstrap-badge")?.textContent?.includes("Ready")
    );
    await page.click('[data-nav-workspace="diagnostics"]');
    await page.waitForSelector("#diagnostics-form");
    await page.selectOption(
      '#diagnostics-form select[name="mode-select"]',
      "live"
    );
    await page.waitForFunction(() => {
      const endpointField = document.querySelector(
        '#diagnostics-form input[name="endpoint"]'
      );
      return endpointField && !endpointField.closest(".is-hidden");
    });
    await page.fill(
      '#diagnostics-form input[name="endpoint"]',
      "http://node1.test"
    );
    await page.fill('#diagnostics-form input[name="amount"]', "150000000");
    await page.fill(
      '#diagnostics-form input[name="targetPubkey"]',
      targetPubkey
    );
    await page.selectOption(
      '#diagnostics-form select[name="analysisDepth"]',
      "deep"
    );
    await page.click('#diagnostics-form button[type="submit"]');
    await page.waitForFunction(() => {
      const headline =
        document.querySelector(".hero-diagnosis h3")?.textContent || "";
      return (
        headline.length > 0 && !headline.includes("Run diagnostics to inspect")
      );
    });

    await page.click('[data-nav-workspace="nodes"]');
    await page.waitForFunction(() => {
      const rows = document.querySelectorAll(
        ".workspace-screen--nodes tbody tr"
      );
      return rows.length >= 2;
    });

    await page.screenshot({
      path: path.join(screenshotsDir, "multi-node-comparison.png"),
      fullPage: true
    });
  } finally {
    globalThis.fetch = originalFetch;
    await context.close();
  }
}

async function captureRpcFailure(browser) {
  const context = await browser.newContext({
    viewport: { width: 1512, height: 1400 }
  });
  const page = await context.newPage();
  attachPageDiagnostics(page);

  try {
    await installRoutes(
      page,
      createDesktopHandlers({
        async diagnose() {
          return jsonResponse(502, {
            ok: false,
            error: {
              code: "RPC_UNAUTHORIZED",
              message: "Fiber RPC rejected the request.",
              details: {
                endpoint: "http://127.0.0.1:8227",
                method: "node_info"
              }
            },
            meta: {
              route: "/api/diagnose"
            }
          });
        }
      })
    );

    await page.goto("http://fiberops.local/", { waitUntil: "networkidle" });
    await page.waitForFunction(() =>
      document.querySelector("#bootstrap-badge")?.textContent?.includes("Ready")
    );
    await page.click('[data-nav-workspace="diagnostics"]');
    await page.waitForSelector("#diagnostics-form");
    await page.selectOption(
      '#diagnostics-form select[name="scenarioId"]',
      "preflight-liquidity-block"
    );
    await page.click('#diagnostics-form button[type="submit"]');
    await page.waitForFunction(() => {
      const banner =
        document.querySelector(".inline-banner")?.textContent || "";
      return banner.includes("Fiber RPC rejected the request");
    });

    await page.screenshot({
      path: path.join(screenshotsDir, "degraded-rpc-failure.png"),
      fullPage: true
    });
  } finally {
    await context.close();
  }
}

function createDesktopHandlers(overrides = {}) {
  return {
    bootstrap:
      overrides.bootstrap ||
      (async () => successResponse("/api/bootstrap", bootstrap)),
    runtimeStatus:
      overrides.runtimeStatus ||
      (async () => {
        const historyBackend = createHistoryBackend({
          historyPath: config.historyPath,
          historyBackend: config.historyBackend
        });
        const runtimeStatus = await getRuntimeStatus({
          historyBackend,
          observability: config.observability
        });
        return successResponse("/api/runtime/status", runtimeStatus);
      }),
    environment:
      overrides.environment ||
      (async () =>
        successResponse("/api/environment", {
          ...config.environmentFacts,
          defaultEndpoint: config.defaultEndpoint,
          configuredNodes: getConfiguredNodeSet(config)
        })),
    observability:
      overrides.observability ||
      (async () =>
        successResponse("/api/observability", config.observability.snapshot())),
    historyStatus:
      overrides.historyStatus ||
      (async () => {
        const historyBackend = createHistoryBackend({
          historyPath: config.historyPath,
          historyBackend: config.historyBackend
        });
        const runtimeStatus = await getRuntimeStatus({
          historyBackend,
          observability: config.observability
        });
        return successResponse("/api/history/status", runtimeStatus.history);
      }),
    historyRecent:
      overrides.historyRecent ||
      (async () => {
        const historyBackend = createHistoryBackend({
          historyPath: config.historyPath,
          historyBackend: config.historyBackend
        });
        const recent = historyBackend
          ? await historyBackend.listRecent(20)
          : [];
        return successResponse("/api/history/recent", recent);
      }),
    historyRelated:
      overrides.historyRelated ||
      (async (route) => {
        const url = new URL(route.request().url());
        const eventId = url.searchParams.get("eventId") || "";
        const historyBackend = createHistoryBackend({
          historyPath: config.historyPath,
          historyBackend: config.historyBackend
        });
        const recent = historyBackend
          ? await historyBackend.listRecent(50)
          : [];
        const current =
          recent.find((item) => item.event?.id === eventId) || null;
        const related =
          current && historyBackend
            ? await historyBackend.findRelated(current, { limit: 10 })
            : [];
        return successResponse("/api/history/related", { recent, related });
      }),
    nodes:
      overrides.nodes ||
      (async () =>
        successResponse("/api/nodes", {
          aggregateStatus: null,
          selectedNodeId: null,
          nodes: []
        })),
    diagnose:
      overrides.diagnose ||
      (async () =>
        successResponse("/api/diagnose", await runDiagnosis({ mode: "demo" }))),
    routingPreview:
      overrides.routingPreview ||
      (async () =>
        successResponse("/api/routing/preview", {
          routePreview: null,
          summary: null,
          diagnosis: null,
          execution: null
        }))
  };
}

async function installRoutes(page, handlers) {
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
  await page.route("http://fiberops.local/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/" || url.pathname === "/index.html") {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: files.html
      });
      return;
    }

    if (url.pathname === "/styles.css") {
      await route.fulfill({
        status: 200,
        contentType: "text/css; charset=utf-8",
        body: files.css
      });
      return;
    }

    if (url.pathname === "/app.js") {
      await route.fulfill({
        status: 200,
        contentType: "text/javascript; charset=utf-8",
        body: files.js
      });
      return;
    }

    if (url.pathname.startsWith("/app/")) {
      const modulePath = path.join(publicDir, url.pathname.slice(1));
      try {
        const body = await readFile(modulePath, "utf8");
        await route.fulfill({
          status: 200,
          contentType: "text/javascript; charset=utf-8",
          body
        });
      } catch {
        await route.fulfill({
          status: 404,
          contentType: "text/plain; charset=utf-8",
          body: "Not found"
        });
      }
      return;
    }

    if (url.pathname === "/api/bootstrap") {
      await route.fulfill(await handlers.bootstrap(route));
      return;
    }

    if (url.pathname === "/api/runtime/status") {
      await route.fulfill(await handlers.runtimeStatus(route));
      return;
    }

    if (url.pathname === "/api/environment") {
      await route.fulfill(await handlers.environment(route));
      return;
    }

    if (url.pathname === "/api/observability") {
      await route.fulfill(await handlers.observability(route));
      return;
    }

    if (url.pathname === "/api/history/status") {
      await route.fulfill(await handlers.historyStatus(route));
      return;
    }

    if (url.pathname === "/api/history/recent") {
      await route.fulfill(await handlers.historyRecent(route));
      return;
    }

    if (url.pathname === "/api/history/related") {
      await route.fulfill(await handlers.historyRelated(route));
      return;
    }

    if (url.pathname === "/api/nodes") {
      await route.fulfill(await handlers.nodes(route));
      return;
    }

    if (url.pathname === "/api/diagnose") {
      await route.fulfill(await handlers.diagnose(route));
      return;
    }

    if (url.pathname === "/api/routing/preview") {
      await route.fulfill(await handlers.routingPreview(route));
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "text/plain; charset=utf-8",
      body: "Not found"
    });
  });
}

function attachPageDiagnostics(page) {
  page.on("pageerror", (error) => {
    console.error("Browser pageerror:", error);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      console.error("Browser console error:", message.text());
    }
  });
}

function successResponse(route, data) {
  return jsonResponse(200, {
    ok: true,
    data,
    meta: { route }
  });
}

function jsonResponse(status, payload) {
  return {
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(payload)
  };
}

function rpcResult(result) {
  return {
    ok: true,
    async text() {
      return JSON.stringify({ result });
    }
  };
}

function rpcError(code, message) {
  return {
    ok: true,
    async text() {
      return JSON.stringify({
        error: {
          code,
          message
        }
      });
    }
  };
}

function normalizePathPubkeys(hopsInfo) {
  if (!Array.isArray(hopsInfo)) {
    return [];
  }

  return hopsInfo
    .map((hop) => {
      if (Array.isArray(hop)) {
        return hop[0];
      }
      if (hop && typeof hop === "object") {
        return hop.pubkey || hop.node_id || hop.nodeId || null;
      }
      return typeof hop === "string" ? hop : null;
    })
    .filter(Boolean);
}

async function loadPlaywright() {
  const directImport = await tryImport("playwright");
  if (directImport) {
    return directImport;
  }

  const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmBin, ["root"], {
    cwd: projectRoot,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(
      `Unable to resolve local node_modules for Playwright: ${result.stderr || result.stdout}`
    );
  }

  const moduleRoot = result.stdout.trim();
  const fallbackUrl = pathToFileURL(
    path.join(moduleRoot, "playwright", "index.mjs")
  ).href;
  const fallbackImport = await tryImport(fallbackUrl);
  if (fallbackImport) {
    return fallbackImport;
  }

  throw new Error(
    'Playwright is not installed. Run "npm ci" and "npx playwright install chromium" first.'
  );
}

async function tryImport(specifier) {
  try {
    return await import(specifier);
  } catch {
    return null;
  }
}
