export function getDom(state) {
  return {
    state,
    bootstrapBadge: document.querySelector("#bootstrap-badge"),
    bootstrapMessage: document.querySelector("#bootstrap-message"),
    workspaceRoot: document.querySelector("#workspace-root"),
    inspectorDrawer: document.querySelector("#inspector-drawer"),
    inspectorContent: document.querySelector("#inspector-content"),
    navButtons: Array.from(document.querySelectorAll("[data-nav-workspace]")),
    modeButtons: Array.from(document.querySelectorAll("[data-mode-button]")),
    statusSummary: document.querySelector("#status-summary"),
    statusEnvironment: document.querySelector("#status-environment"),
    statusConnection: document.querySelector("#status-connection"),
    statusSync: document.querySelector("#status-sync"),
    statusNotifications: document.querySelector("#status-notifications"),
    notificationButton: document.querySelector("#notification-button"),
    notificationTray: document.querySelector("#notification-tray"),
    notificationTrayList: document.querySelector("#notification-tray-list"),
    toastStack: document.querySelector("#toast-stack"),
    commandPalette: document.querySelector("#command-palette"),
    commandPaletteButton: document.querySelector("#command-palette-button"),
    commandQuery: document.querySelector("#command-query"),
    commandResults: document.querySelector("#command-results"),
    inspectorCloseButton: document.querySelector("#inspector-close"),
    inspectorToggleButton: document.querySelector("#inspector-toggle-mode")
  };
}
