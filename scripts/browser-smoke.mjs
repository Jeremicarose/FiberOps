import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runDiagnosis } from "../src/lib/diagnostics.js";
import {
  buildBootstrapPayload,
  createFiberOpsConfig
} from "../src/lib/server-app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..");
const publicDir = path.join(projectRoot, "public");

const playwright = await loadPlaywright();
const runtimeDir = await mkdtemp(path.join(os.tmpdir(), "fiberops-browser-"));
const config = createFiberOpsConfig({
  runtimeDir,
  historyPath: path.join(runtimeDir, "diagnostic-history.json")
});
const bootstrap = await buildBootstrapPayload(config);
const files = {
  html: await readFile(path.join(publicDir, "index.html"), "utf8"),
  css: await readFile(path.join(publicDir, "styles.css"), "utf8"),
  js: await readFile(path.join(publicDir, "app.js"), "utf8")
};

const browser = await playwright.chromium.launch({
  channel: "chromium",
  headless: true
});

try {
  await runHappyPathScenario();
  await runBootstrapFailureScenario();
  await runDiagnoseFailureScenario();
  process.stdout.write("Browser smoke passed.\n");
} finally {
  await browser.close();
}

async function runHappyPathScenario() {
  const page = await browser.newPage();

  try {
    await installRoutes(page, {
      async bootstrap() {
        return jsonResponse(200, {
          ok: true,
          data: bootstrap,
          meta: { route: "/api/bootstrap" }
        });
      },
      async diagnose(route) {
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
      }
    });

    await page.goto("http://fiberops.local/", { waitUntil: "networkidle" });
    await page.waitForFunction(
      () => document.querySelectorAll("#scenarioId option").length > 0
    );

    const headingText = await page.locator("h1").textContent();
    assert.equal(headingText?.trim(), "FiberOps");

    const bootstrapBadge = await page.locator("#bootstrap-badge").textContent();
    assert.equal(bootstrapBadge?.trim(), "Ready");

    await page.selectOption("#scenarioId", "preflight-liquidity-block");
    await page.click("#submit-button");
    await page.waitForFunction(() => {
      const headline =
        document.querySelector("#result-headline")?.textContent || "";
      return headline.includes("Outbound liquidity is too low");
    });

    const headline = await page.locator("#result-headline").textContent();
    const routeStatus = await page
      .locator("#route-preview [data-status]")
      .getAttribute("data-status");

    assert.match(headline || "", /Outbound liquidity is too low/);
    assert.equal(routeStatus, "blocked");
  } finally {
    await page.close();
  }
}

async function runBootstrapFailureScenario() {
  const page = await browser.newPage();

  try {
    await installRoutes(page, {
      async bootstrap() {
        return jsonResponse(503, {
          ok: false,
          error: {
            code: "BOOTSTRAP_DOWN",
            message: "Bootstrap endpoint unavailable.",
            details: {
              route: "/api/bootstrap"
            }
          },
          meta: {
            route: "/api/bootstrap"
          }
        });
      },
      async diagnose() {
        return jsonResponse(500, {
          ok: false,
          error: {
            code: "UNEXPECTED_DIAGNOSE_CALL",
            message: "Diagnose should not run in bootstrap failure scenario."
          },
          meta: {
            route: "/api/diagnose"
          }
        });
      }
    });

    await page.goto("http://fiberops.local/", { waitUntil: "networkidle" });
    await page.waitForFunction(() => {
      const badge =
        document.querySelector("#bootstrap-badge")?.textContent || "";
      return badge.includes("Degraded");
    });

    const badge = await page.locator("#bootstrap-badge").textContent();
    const banner = await page.locator("#bootstrap-message").textContent();
    const headline = await page.locator("#result-headline").textContent();

    assert.equal(badge?.trim(), "Degraded");
    assert.match(banner || "", /Bootstrap degraded/i);
    assert.match(headline || "", /could not load its initial API contract/i);
  } finally {
    await page.close();
  }
}

async function runDiagnoseFailureScenario() {
  const page = await browser.newPage();

  try {
    await installRoutes(page, {
      async bootstrap() {
        return jsonResponse(200, {
          ok: true,
          data: bootstrap,
          meta: { route: "/api/bootstrap" }
        });
      },
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
    });

    await page.goto("http://fiberops.local/", { waitUntil: "networkidle" });
    await page.waitForFunction(() =>
      document.querySelector("#bootstrap-badge")?.textContent?.includes("Ready")
    );

    await page.selectOption("#scenarioId", "preflight-liquidity-block");
    await page.click("#submit-button");
    await page.waitForFunction(() => {
      const headline =
        document.querySelector("#result-headline")?.textContent || "";
      return headline.includes("diagnostics request could not be completed");
    });

    const status = await page.locator("#result-status").textContent();
    const explanation = await page.locator("#result-explanation").textContent();
    const routeStatus = await page
      .locator("#route-preview [data-status]")
      .getAttribute("data-status");

    assert.match(status || "", /Rpc Unauthorized/i);
    assert.match(explanation || "", /Fiber RPC rejected the request/i);
    assert.equal(routeStatus, "degraded");
  } finally {
    await page.close();
  }
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

    if (url.pathname === "/api/diagnose") {
      await route.fulfill(await handlers.diagnose(route));
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "text/plain; charset=utf-8",
      body: "Not found"
    });
  });
}

function jsonResponse(status, body) {
  return {
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(body)
  };
}

async function loadPlaywright() {
  const localEntrypoint = path.join(
    projectRoot,
    "node_modules",
    "@playwright",
    "test",
    "index.mjs"
  );
  const globalRoot = resolveGlobalNodeModules();
  const globalEntrypoint = path.join(
    globalRoot,
    "@playwright",
    "test",
    "index.mjs"
  );

  for (const entrypoint of [localEntrypoint, globalEntrypoint]) {
    try {
      return await import(pathToFileURL(entrypoint).href);
    } catch {
      continue;
    }
  }

  throw new Error(
    `Unable to load Playwright from ${localEntrypoint} or ${globalEntrypoint}. Install project dependencies with npm install, then run npx playwright install chromium.`
  );
}

function resolveGlobalNodeModules() {
  const result = spawnSync("npm", ["root", "-g"], {
    cwd: projectRoot,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(
      result.stderr || "Unable to resolve global node_modules path."
    );
  }

  return result.stdout.trim();
}
