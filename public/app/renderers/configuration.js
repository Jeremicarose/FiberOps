import { escapeHtml } from "../utils.js";

export function renderConfiguration(dom, state) {
  const runtime = state.runtimeStatus || {};
  const environment =
    state.environment || state.bootstrap?.environmentFacts || {};
  const policy = state.bootstrap?.runtime?.policy || {};

  dom.workspaceRoot.innerHTML = `
    <section class="workspace-screen workspace-screen--configuration">
      <header class="workspace-header">
        <div>
          <p class="workspace-kicker">Configuration</p>
          <h2>Connections, safety controls, and persistence</h2>
          <p>Manage node access, validation posture, and operational environment details.</p>
        </div>
      </header>
      <div class="workspace-two-up">
        <section class="panel-surface">
          <div class="panel-surface__head"><h3>Connection profile</h3></div>
          <form id="configuration-form" class="form-grid">
            <label class="field-group"><span>Default endpoint</span><input name="endpoint" type="url" value="${escapeHtml(state.diagnosticsDraft.endpoint || state.bootstrap?.defaultEndpoint || "")}" /></label>
            <label class="field-group"><span>Token</span><textarea name="token" rows="4">${escapeHtml(state.diagnosticsDraft.token || "")}</textarea></label>
            <label class="field-group"><span>Analysis depth</span><select name="analysisDepth"><option value="standard" ${state.diagnosticsDraft.analysisDepth !== "deep" ? "selected" : ""}>Standard</option><option value="deep" ${state.diagnosticsDraft.analysisDepth === "deep" ? "selected" : ""}>Deep</option></select></label>
            <button type="button" class="button-primary" data-config-test>Use for diagnostics</button>
          </form>
        </section>
        <section class="panel-surface">
          <div class="panel-surface__head"><h3>Environment and safety</h3></div>
          <dl class="kv-list">
            <div class="kv-row"><dt>Environment</dt><dd>${escapeHtml(environment.name || "Unknown")}</dd></div>
            <div class="kv-row"><dt>Topology</dt><dd>${escapeHtml(environment.topology || "unknown")}</dd></div>
            <div class="kv-row"><dt>History enabled</dt><dd>${escapeHtml(String(runtime.history?.enabled ?? false))}</dd></div>
            <div class="kv-row"><dt>Observability</dt><dd>${escapeHtml(String(Boolean(runtime.observability)))}</dd></div>
            <div class="kv-row"><dt>External endpoints allowed</dt><dd>${escapeHtml(String(policy.liveExternalEndpointsAllowed ?? false))}</dd></div>
            <div class="kv-row"><dt>Insecure token forwarding</dt><dd>${escapeHtml(String(policy.insecureTokenForwardingAllowed ?? false))}</dd></div>
            <div class="kv-row"><dt>Route probe enabled</dt><dd>${escapeHtml(String(policy.routeProbeEnabled ?? true))}</dd></div>
          </dl>
        </section>
      </div>
    </section>
  `;
}
