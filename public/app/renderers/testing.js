import { renderEmptyState, renderPanelHead } from "./shared.js";
import { escapeHtml } from "../utils.js";

export function renderTesting(dom, state) {
  const story = state.bootstrap?.liveStory || [];
  const presets = state.bootstrap?.livePresets || [];
  const lab =
    state.bootstrap?.localLab || state.bootstrap?.environmentFacts || null;
  const latest = state.lastDiagnosisResult || null;

  dom.workspaceRoot.innerHTML = `
    <section class="workspace-screen workspace-screen--testing">
      <header class="workspace-pagehead">
        <div>
          <span class="rail-label">Validate / Simulations</span>
          <h2>Run scenarios and presets</h2>
        </div>
      </header>

      <section class="workspace-grid workspace-grid--two">
        <article class="panel-surface">
          ${renderPanelHead({
            eyebrow: "Presets",
            title: "Scenarios",
            detail: "Run a guided or saved preset."
          })}
          <div class="story-grid">
            ${
              [...story, ...presets].length
                ? [...story, ...presets]
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
                : renderEmptyState("No presets", "No scenarios are available.")
            }
          </div>
        </article>

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
                  "Run a preset to capture its outcome here."
                )
          }
        </article>
      </section>
    </section>
  `;
}
