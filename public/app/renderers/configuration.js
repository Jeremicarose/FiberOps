import { escapeHtml } from "../utils.js";
import { renderPanelHead } from "./shared.js";

export function renderConfiguration(dom, state) {
  const runtime = state.runtimeStatus || {};
  const environment =
    state.environment || state.bootstrap?.environmentFacts || {};
  const policy = state.bootstrap?.runtime?.policy || {};

  dom.workspaceRoot.innerHTML = `
    <section class="workspace-screen workspace-screen--configuration">
      <header class="workspace-pagehead">
        <div>
          <span class="rail-label">Configure / Settings</span>
          <h2>Connections, safety controls, and desktop behavior</h2>
          <p>Read-only by default, with explicit live-inspection controls.</p>
        </div>
      </header>

      <section class="workspace-grid workspace-grid--two">
        <article class="panel-surface">
          ${renderPanelHead({
            eyebrow: "Connection profile",
            title: "Observation defaults",
            detail:
              "These settings prefill inspection, they do not send payments."
          })}
          <form id="configuration-form" class="form-grid">
            <label class="field-group">
              <span>Theme</span>
              <select name="theme">
                <option value="system" ${
                  state.ui.theme === "system" ? "selected" : ""
                }>Auto</option>
                <option value="light" ${
                  state.ui.theme === "light" ? "selected" : ""
                }>Light</option>
                <option value="dark" ${
                  state.ui.theme === "dark" ? "selected" : ""
                }>Dark</option>
              </select>
            </label>
            <label class="field-group">
              <span>Default endpoint</span>
              <input
                name="endpoint"
                type="url"
                value="${escapeHtml(
                  state.diagnosticsDraft.endpoint ||
                    state.bootstrap?.defaultEndpoint ||
                    ""
                )}"
              />
            </label>
            <label class="field-group field-group--full">
              <span>Read-only token</span>
              <textarea name="token" rows="4">${escapeHtml(
                state.diagnosticsDraft.token || ""
              )}</textarea>
            </label>
            <label class="field-group">
              <span>Analysis depth</span>
              <select name="analysisDepth">
                <option value="standard" ${
                  state.diagnosticsDraft.analysisDepth !== "deep"
                    ? "selected"
                    : ""
                }>Standard</option>
                <option value="deep" ${
                  state.diagnosticsDraft.analysisDepth === "deep"
                    ? "selected"
                    : ""
                }>Deep</option>
              </select>
            </label>
            <button
              type="button"
              class="button-primary"
              data-config-test
            >
              Use in diagnostics
            </button>
          </form>
        </article>

        <article class="panel-surface">
          ${renderPanelHead({
            eyebrow: "Runtime posture",
            title: "Safety and environment",
            detail: "Policies that shape how the app observes Fiber."
          })}
          <div class="runtime-groups">
            <section class="runtime-group">
              <div class="runtime-group__head">
                <h4>Environment</h4>
              </div>
              <dl class="kv-list">
                <div class="kv-row"><dt>Environment</dt><dd>${escapeHtml(environment.name || "Unknown")}</dd></div>
                <div class="kv-row"><dt>Topology</dt><dd>${escapeHtml(environment.topology || "Unknown")}</dd></div>
                <div class="kv-row"><dt>Observability</dt><dd>${escapeHtml(String(Boolean(runtime.observability)))}</dd></div>
              </dl>
            </section>
            <section class="runtime-group">
              <div class="runtime-group__head">
                <h4>History and backend</h4>
              </div>
              <dl class="kv-list">
                <div class="kv-row"><dt>History backend</dt><dd>${escapeHtml(runtime.history?.type || "Unknown")}</dd></div>
                <div class="kv-row"><dt>History enabled</dt><dd>${escapeHtml(String(runtime.history?.enabled ?? false))}</dd></div>
              </dl>
            </section>
            <section class="runtime-group">
              <div class="runtime-group__head">
                <h4>Policy</h4>
              </div>
              <dl class="kv-list">
                <div class="kv-row"><dt>External live endpoints</dt><dd>${escapeHtml(String(policy.liveExternalEndpointsAllowed ?? false))}</dd></div>
                <div class="kv-row"><dt>Insecure token forwarding</dt><dd>${escapeHtml(String(policy.insecureTokenForwardingAllowed ?? false))}</dd></div>
                <div class="kv-row"><dt>Route probe enabled</dt><dd>${escapeHtml(String(policy.routeProbeEnabled ?? true))}</dd></div>
              </dl>
            </section>
          </div>
        </article>
      </section>
    </section>
  `;
}
