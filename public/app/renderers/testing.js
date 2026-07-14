import { DEMO_SCENARIO_PRESETS } from "../constants.js";
import { renderEmptyState, renderPanelHead } from "./shared.js";
import { escapeHtml } from "../utils.js";

export function renderTesting(dom, state) {
  const story = state.bootstrap?.liveStory || [];
  const presets = state.bootstrap?.livePresets || [];
  const latest = state.lastDiagnosisResult || null;
  const availableScenarioIds = new Set(
    (state.bootstrap?.scenarios || []).map((item) => item.id)
  );
  const demoScenarios = DEMO_SCENARIO_PRESETS.filter((item) =>
    availableScenarioIds.has(item.id)
  );

  dom.workspaceRoot.innerHTML = `
    <section class="workspace-screen workspace-screen--testing">
      <header class="workspace-pagehead">
        <div>
          <span class="rail-label">Validate / Simulations</span>
          <h2>Run scenarios and presets</h2>
          <p>Tell the operator story, then click into the exact failure state you want to explain.</p>
        </div>
      </header>

      <section class="workspace-grid workspace-grid--two">
        <article class="panel-surface panel-surface--hint">
          ${renderPanelHead({
            eyebrow: "Judge story",
            title: "Alice runs a Fiber payment service",
            detail: "Use this sequence instead of walking every tab."
          })}
          <ol class="story-flow">
            <li>A customer sends a payment.</li>
            <li>The payment fails.</li>
            <li>Alice does not know why.</li>
            <li>Instead of checking six RPC endpoints, she opens FiberOps.</li>
            <li>FiberOps collects evidence from the relevant node set.</li>
            <li>It shows liquidity, payment state, routing readiness, and node disagreement.</li>
            <li>It recommends the next action in seconds.</li>
          </ol>
        </article>

        <article class="panel-surface">
          ${renderPanelHead({
            eyebrow: "One-click demo states",
            title: "Demo scenarios",
            detail: "Reliable scenario buttons for a live presentation."
          })}
          <div class="scenario-button-grid">
            ${
              demoScenarios.length
                ? demoScenarios
                    .map(
                      (item) => `
                        <button
                          type="button"
                          class="scenario-button"
                          data-demo-scenario="${escapeHtml(item.id)}"
                        >
                          <strong>${escapeHtml(item.label)}</strong>
                          <span>${escapeHtml(item.detail)}</span>
                        </button>
                      `
                    )
                    .join("")
                : renderEmptyState(
                    "No demo scenarios",
                    "Bootstrap did not return replay scenarios."
                  )
            }
            <button
              type="button"
              class="scenario-button"
              data-quick-action="go-activity"
            >
              <strong>Replay History</strong>
              <span>Open the recent investigation timeline</span>
            </button>
          </div>
        </article>
      </section>

      <section class="workspace-grid workspace-grid--two">
        <article class="panel-surface">
          ${renderPanelHead({
            eyebrow: "Guided flow",
            title: "Story checkpoints",
            detail:
              "Use these when you want a narrative rather than a raw preset list."
          })}
          <div class="story-grid">
            ${
              story.length
                ? story
                    .map(
                      (item) => `
                        <button
                          type="button"
                          class="story-card"
                          data-live-preset="${escapeHtml(item.presetId || item.id)}"
                        >
                          <span>${escapeHtml(item.step || item.label || "Preset")}</span>
                          <strong>${escapeHtml(item.title)}</strong>
                          <p>${escapeHtml(item.description)}</p>
                        </button>
                      `
                    )
                    .join("")
                : renderEmptyState(
                    "No guided flow",
                    "No guided story is available."
                  )
            }
          </div>
        </article>

        <article class="panel-surface">
          ${renderPanelHead({
            eyebrow: "Live mode",
            title: "Real node presets",
            detail:
              "Use these to prove the same operator workflow against live Fiber nodes."
          })}
          <div class="story-grid">
            ${
              presets.length
                ? presets
                    .map(
                      (item) => `
                        <button
                          type="button"
                          class="story-card"
                          data-live-preset="${escapeHtml(item.id)}"
                        >
                          <span>${escapeHtml(item.label || "Preset")}</span>
                          <strong>${escapeHtml(item.title)}</strong>
                          <p>${escapeHtml(item.description)}</p>
                        </button>
                      `
                    )
                    .join("")
                : renderEmptyState(
                    "No live presets",
                    "No live-mode presets are available."
                  )
            }
          </div>
        </article>
      </section>

      <section class="workspace-grid workspace-grid--two">
        <article class="panel-surface">
          ${renderPanelHead({
            eyebrow: "Last result",
            title: "Outcome",
            detail: "Latest scenario evidence."
          })}
          ${
            latest
              ? `
                  <div class="mini-card-grid">
                    <article class="mini-card">
                      <span>Headline</span>
                      <strong>${escapeHtml(latest.diagnosis?.headline || "No headline")}</strong>
                      <p>${escapeHtml(latest.summary?.paymentReadiness || "Unknown posture")}</p>
                    </article>
                    <article class="mini-card">
                      <span>Route proof</span>
                      <strong>${escapeHtml(latest.summary?.routeProof || "Unknown")}</strong>
                      <p>${escapeHtml(latest.routePreview?.blockingReason || latest.routePreview?.evidenceSource || "No route detail")}</p>
                    </article>
                  </div>
                `
              : renderEmptyState(
                  "No result",
                  "Run a scenario to capture its outcome here."
                )
          }
        </article>
      </section>
    </section>
  `;
}
