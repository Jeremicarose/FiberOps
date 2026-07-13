import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export async function loadPlaywright(projectRoot) {
  const localEntrypoint = path.join(
    projectRoot,
    "node_modules",
    "@playwright",
    "test",
    "index.mjs"
  );
  const globalRoot = resolveGlobalNodeModules(projectRoot);
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
    `Unable to load Playwright from ${localEntrypoint} or ${globalEntrypoint}. Install project dependencies with npm ci, then run npx playwright install chromium.`
  );
}

export async function launchBrowserOrSkip(playwright) {
  try {
    return await playwright.chromium.launch({
      channel: "chromium",
      headless: true
    });
  } catch (error) {
    if (await isKnownSandboxLaunchBlock(playwright, error)) {
      process.stdout.write(
        "Browser smoke skipped: Playwright browser launch is blocked by the local sandbox.\n"
      );
      return null;
    }

    throw error;
  }
}

export async function loadStaticFiles(publicDir) {
  return {
    html: await readFile(path.join(publicDir, "index.html"), "utf8"),
    css: await readFile(path.join(publicDir, "styles.css"), "utf8"),
    js: await readFile(path.join(publicDir, "app.js"), "utf8")
  };
}

export async function installRoutes(page, { files, publicDir, handlers }) {
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

    const handler = handlers[url.pathname];
    if (handler) {
      await route.fulfill(await handler(route));
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "text/plain; charset=utf-8",
      body: "Not found"
    });
  });
}

export function attachPageDiagnostics(page) {
  page.on("pageerror", (error) => {
    console.error("Browser pageerror:", error);
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      console.error("Browser console error:", message.text());
    }
  });
}

export function jsonResponse(status, body) {
  return {
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(body)
  };
}

function resolveGlobalNodeModules(projectRoot) {
  const result = spawnSync("npm", ["root", "-g"], {
    cwd: projectRoot,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || "Unable to resolve global node_modules path.");
  }

  return result.stdout.trim();
}

async function isKnownSandboxLaunchBlock(playwright, launchError) {
  if (process.env.CI || process.platform !== "darwin") {
    return false;
  }

  if (matchesSandboxLaunchError(launchError)) {
    return true;
  }

  try {
    const diagnosticBrowser = await playwright.chromium.launch({ headless: true });
    await diagnosticBrowser.close();
    return false;
  } catch (diagnosticError) {
    return matchesSandboxLaunchError(diagnosticError);
  }
}

function matchesSandboxLaunchError(error) {
  const diagnosticText = [
    error?.message || "",
    ...(Array.isArray(error?.log) ? error.log : [])
  ].join("\n");

  return (
    diagnosticText.includes("bootstrap_check_in") ||
    diagnosticText.includes("MachPortRendezvous") ||
    diagnosticText.includes("Permission denied (1100)")
  );
}
