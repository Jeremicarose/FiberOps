import { renderEmptyState } from "./shared.js";
import { escapeHtml } from "../utils.js";

export function renderTesting(dom, state) {
  const story = state.bootstrap?.liveStory || [];
  const presets = state.bootstrap?.livePresets || [];
  const lab =
    state.bootstrap?.localLab || state.bootstrap?.environmentFacts || null;

  dom.workspaceRoot.innerHTML = `
    <section class="workspace-screen workspace-screen--testing">
      <header class="workspace-header">
        <div>
          <p class="workspace-kicker">Testing</p>
          <h2>Guided proof, presets, and local lab flows</h2>
          <p>Demo and lab validation are separated from live operator workspaces.</p>
        </div>
      </header>
      <div class="workspace-two-up">
        <section class="panel-surface">
          <div class="panel-surface__head"><h3>Guided proof flow</h3></div>
          <div class="story-grid-modern">
            ${story.length ? story.map((item) => `<button type="button" class="story-card-modern" data-live-preset="${escapeHtml(item.presetId)}"><span>${escapeHtml(item.step)}</span><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.description)}</p></button>`).join("") : renderEmptyState("No guided story", "Bootstrap did not include guided flow presets.")}
          </div>
        </section>
        <section class="panel-surface">
          <div class="panel-surface__head"><h3>Live presets</h3></div>
          <div class="story-grid-modern">
            ${presets.length ? presets.map((preset) => `<button type="button" class="story-card-modern" data-live-preset="${escapeHtml(preset.id)}"><span>${escapeHtml(preset.label)}</span><strong>${escapeHtml(preset.title)}</strong><p>${escapeHtml(preset.description)}</p></button>`).join("") : renderEmptyState("No presets", "No live presets are available.")}
          </div>
        </section>
      </div>
      <section class="panel-surface">
        <div class="panel-surface__head"><h3>Lab facts</h3></div>
        ${lab ? `<pre class="code-panel">${escapeHtml(JSON.stringify(lab, null, 2))}</pre>` : renderEmptyState("No lab facts", "Switch to a configured environment with local lab metadata.")}
      </section>
    </section>
  `;
}
