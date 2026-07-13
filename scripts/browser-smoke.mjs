import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  attachPageDiagnostics,
  installRoutes,
  jsonResponse,
  launchBrowserOrSkip,
  loadPlaywright,
  loadStaticFiles
} from "./browser-harness.mjs";
import { runDiagnosis } from "../src/lib/diagnostics.js";
import {
  buildBootstrapPayload,
  createFiberOpsConfig
} from "../src/lib/server-app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..");
const publicDir = path.join(projectRoot, "public");

const playwright = await loadPlaywright(projectRoot);
const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "fiberops-browser-"));
const config = createFiberOpsConfig({
  runtimeDir,
  historyPath: path.join(runtimeDir, "diagnostic-history.json")
});
const bootstrap = await buildBootstrapPayload(config);
const files = await loadStaticFiles(publicDir);

const browser = await launchBrowserOrSkip(playwright);
if (!browser) {
  process.exit(0);
}

try {
  await runWorkspaceScenario();
  await runBootstrapFailureScenario();
  await runDiagnoseFailureScenario();
  process.stdout.write("Browser smoke passed.\n");
} finally {
  await browser.close();
}

async function runWorkspaceScenario() {
  const page = await browser.newPage();
  attachPageDiagnostics(page);

  try {
    await installRoutes(page, {
      files,
      publicDir,
      handlers: createHealthyHandlers()
    });
    await page.goto("http://fiberops.local/", { waitUntil: "networkidle" });
    await page.setViewportSize({ width: 1440, height: 980 });
    await page.waitForFunction(() =>
      document.querySelector("#bootstrap-badge")?.textContent?.includes("Ready")
    );

    assert.equal(
      (await page.locator(".workspace-nav__item.is-active").textContent())?.trim(),
      "Overview"
    );
    assert.match(
      await page.locator("#workspace-root").textContent(),
      /System state at a glance/i
    );

    await page.click('[data-nav-workspace="nodes"]');
    await page.waitForSelector(".workspace-screen--nodes");
    assert.match(
      await page.locator("#workspace-root").textContent(),
      /Compare configured senders and peers/i
    );

    await page.click('tr[data-row-id]');
    await page.waitForFunction(() => {
      const drawer = document.querySelector("#inspector-drawer");
      return drawer && !drawer.hidden;
    });
    assert.match(
      await page.locator("#inspector-content").textContent(),
      /Health snapshot|Routing posture/i
    );
    await page.click('#inspector-toggle-mode');
    assert.equal(
      await page.locator('#inspector-drawer').getAttribute('data-mode'),
      'floating'
    );

    await page.click('[data-nav-workspace="routing"]');
    await page.fill(
      '#routing-form input[name="targetPubkey"]',
      "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea"
    );
    await page.fill('#routing-form input[name="amount"]', "350000000");
    await page.click('#routing-form button[type="submit"]');
    await page.waitForFunction(() => {
      const text = document.querySelector(".workspace-screen--routing")?.textContent || "";
      return text.includes("Candidate routes") && /Status|Confidence/.test(text);
    });
    await page.waitForFunction(() => {
      const text = document.querySelector('#status-summary')?.textContent || '';
      return text.includes('Updated route preview') || text.includes('Route preview');
    });

    await page.click('[data-nav-workspace="diagnostics"]');
    await page.selectOption(
      '#diagnostics-form select[name="scenarioId"]',
      "preflight-liquidity-block"
    );
    await page.click('#diagnostics-form button[type="submit"]');
    await page.waitForFunction(() => {
      const text =
        document.querySelector(".workspace-screen--diagnostics")?.textContent || "";
      return text.includes("Outbound liquidity is too low");
    });
    await page.waitForFunction(() => {
      const trayCount = document.querySelector('#status-notifications')?.textContent || '0';
      return Number(trayCount) >= 1;
    });

    await page.click('[data-nav-workspace="activity"]');
    await page.waitForSelector(".workspace-screen--activity");
    assert.match(
      await page.locator("#workspace-root").textContent(),
      /History, incidents, and timeline/i
    );

    await page.click('[data-nav-workspace="testing"]');
    assert.match(
      await page.locator("#workspace-root").textContent(),
      /Guided proof, presets, and local lab flows/i
    );

    await page.click('[data-nav-workspace="configuration"]');
    assert.match(
      await page.locator("#workspace-root").textContent(),
      /Connections, safety controls, and persistence/i
    );

    await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
    await page.waitForFunction(
      () => document.querySelector("#command-palette")?.open === true
    );
    await page.fill("#command-query", "notifications");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => {
      const tray = document.querySelector('#notification-tray');
      return tray && !tray.hidden;
    });
    await page.keyboard.press(process.platform === "darwin" ? "Meta+K" : "Control+K");
    await page.fill("#command-query", "nodes");
    assert.match(await page.locator("#command-results").textContent(), /Open Nodes/i);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForSelector(".workspace-screen--nodes");
  } finally {
    await page.close();
  }
}

async function runBootstrapFailureScenario() {
  const page = await browser.newPage();
  attachPageDiagnostics(page);

  try {
    await installRoutes(page, {
      files,
      publicDir,
      handlers: {
        ...createHealthyHandlers(),
        async bootstrap() {
          return jsonResponse(503, {
            ok: false,
            error: {
              code: "BOOTSTRAP_DOWN",
              message: "Bootstrap endpoint unavailable."
            },
            meta: { route: "/api/bootstrap" }
          });
        }
      }
    });

    await page.goto("http://fiberops.local/", { waitUntil: "networkidle" });
    await page.waitForFunction(
      () => document.querySelector("#bootstrap-badge")?.textContent?.includes("Degraded")
    );

    assert.equal((await page.locator("#bootstrap-badge").textContent())?.trim(), "Degraded");
    assert.match(await page.locator("#bootstrap-message").textContent(), /Bootstrap degraded/i);
    assert.match(
      await page.locator("#workspace-root").textContent(),
      /System state at a glance/i
    );
  } finally {
    await page.close();
  }
}

async function runDiagnoseFailureScenario() {
  const page = await browser.newPage();
  attachPageDiagnostics(page);

  try {
    await installRoutes(page, {
      files,
      publicDir,
      handlers: {
        ...createHealthyHandlers(),
        async diagnose() {
          return jsonResponse(502, {
            ok: false,
            error: {
              code: "RPC_UNAUTHORIZED",
              message: "Fiber RPC rejected the request."
            },
            meta: { route: "/api/diagnose" }
          });
        }
      }
    });

    await page.goto("http://fiberops.local/", { waitUntil: "networkidle" });
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.click('[data-nav-workspace="diagnostics"]');
    await page.click('#diagnostics-form button[type="submit"]');
    await page.waitForFunction(() => {
      const text =
        document.querySelector(".workspace-screen--diagnostics")?.textContent || "";
      return text.includes("Fiber RPC rejected the request.");
    });

    assert.match(
      await page.locator("#workspace-root").textContent(),
      /Fiber RPC rejected the request/i
    );
  } finally {
    await page.close();
  }
}

function createHealthyHandlers() {
  return {
    async "/api/bootstrap"() {
      return jsonResponse(200, {
        ok: true,
        data: bootstrap,
        meta: { route: "/api/bootstrap" }
      });
    },
    async "/api/runtime/status"() {
      return jsonResponse(200, {
        ok: true,
        data: {
          history: {
            configured: true,
            enabled: true,
            degraded: false,
            type: "json-file"
          },
          observability: {
            requests: { recent: { requests: 2, errors: 0 } },
            runs: { started: 1, completed: 1, failed: 0 }
          }
        },
        meta: { route: "/api/runtime/status" }
      });
    },
    async "/api/environment"() {
      return jsonResponse(200, {
        ok: true,
        data: {
          ...(bootstrap.environmentFacts || {}),
          name: bootstrap.environmentFacts?.name || "Bundled lab",
          topology: bootstrap.environmentFacts?.topology || "two-node"
        },
        meta: { route: "/api/environment" }
      });
    },
    async "/api/observability"() {
      return jsonResponse(200, {
        ok: true,
        data: {
          requests: { recent: { requests: 2, errors: 0 } },
          runs: { started: 1, completed: 1, failed: 0 }
        },
        meta: { route: "/api/observability" }
      });
    },
    async "/api/history/status"() {
      return jsonResponse(200, {
        ok: true,
        data: {
          configured: true,
          enabled: true,
          degraded: false,
          type: "json-file"
        },
        meta: { route: "/api/history/status" }
      });
    },
    async "/api/history/recent"() {
      return jsonResponse(200, {
        ok: true,
        data: [],
        meta: { route: "/api/history/recent" }
      });
    },
    async "/api/history/related"() {
      return jsonResponse(200, {
        ok: true,
        data: { recent: [], related: [] },
        meta: { route: "/api/history/related" }
      });
    },
    async "/api/nodes"() {
      const result = await runDiagnosis(
        { mode: "demo", scenarioId: "preflight-liquidity-block" },
        {
          defaultEndpoint: config.defaultEndpoint,
          historyPath: config.historyPath
        }
      );
      return jsonResponse(200, {
        ok: true,
        data: {
          aggregateStatus: "mixed",
          selectedNodeId: "node-1",
          nodes: [
            {
              id: "node-1",
              name: "Primary node",
              endpoint: config.defaultEndpoint,
              summary: {
                paymentReadiness: result.summary.paymentReadiness,
                estimatedOutbound: result.summary.estimatedOutbound,
                openChannels: 1,
                readyChannels: 1,
                routeProof: result.summary.routeProof,
                targetVisibility: result.summary.targetVisibility
              },
              routeStatus: result.routePreview.status,
              channels: [
                {
                  id: "0xabc",
                  state: "ChannelReady",
                  capacity: "5000000000",
                  localBalance: "250000000",
                  remoteBalance: "4750000000",
                  peerPubkey:
                    "03deb7d87a4858475863be6c77a284509dbd5ffdadf0cd9340dba5c4b41913aeea",
                  routeReadiness: result.summary.paymentReadiness,
                  failure: null
                }
              ]
            }
          ]
        },
        meta: { route: "/api/nodes" }
      });
    },
    async "/api/diagnose"(route) {
      const payload = route.request().postDataJSON() || {};
      const result = await runDiagnosis(payload, {
        defaultEndpoint: config.defaultEndpoint,
        historyPath: config.historyPath
      });
      return jsonResponse(200, {
        ok: true,
        data: result,
        meta: { route: "/api/diagnose" }
      });
    },
    async "/api/routing/preview"(route) {
      const payload = route.request().postDataJSON() || {};
      const result = await runDiagnosis(
        {
          mode: payload.mode || "demo",
          scenarioId: payload.scenarioId || "preflight-liquidity-block",
          amount: payload.amount,
          targetPubkey: payload.targetPubkey,
          invoice: payload.invoice
        },
        {
          defaultEndpoint: config.defaultEndpoint,
          historyPath: config.historyPath
        }
      );
      return jsonResponse(200, {
        ok: true,
        data: {
          routePreview: result.routePreview,
          summary: result.summary,
          diagnosis: result.diagnosis,
          execution: result.execution || null
        },
        meta: { route: "/api/routing/preview" }
      });
    }
  };
}
