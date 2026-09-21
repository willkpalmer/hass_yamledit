/**
 * YAML Config Editor - Home Assistant custom panel.
 *
 * A self-contained (no external dependencies) file browser + text/YAML
 * editor for Home Assistant's /config directory. Works identically in
 * the web frontend and in the Companion App webview, since both simply
 * render this same custom element inside the Home Assistant frontend.
 *
 * All editing uses a native <textarea> per open file, so copy/paste,
 * cut, undo/redo, and text selection all use the browser's built-in
 * behaviour. A lightweight regex-based highlighter is layered visually
 * behind the (transparent-text) textarea to provide YAML syntax colour.
 */

const WS = {
  LIST: "yaml_editor/list_dir",
  READ: "yaml_editor/read_file",
  WRITE: "yaml_editor/write_file",
  CREATE: "yaml_editor/create",
  DELETE: "yaml_editor/delete",
  RENAME: "yaml_editor/rename",
};

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function dirname(path) {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

function basename(path) {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

function joinPath(dir, name) {
  return dir ? `${dir}/${name}` : name;
}

function extOf(name) {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx + 1).toLowerCase();
}

function isProbablyTextExt(name) {
  const binaryExts = new Set([
    "png", "jpg", "jpeg", "gif", "bmp", "ico", "webp", "svg",
    "db", "sqlite", "sqlite3", "zip", "gz", "tar", "7z",
    "pyc", "so", "woff", "woff2", "ttf", "otf", "mp3", "mp4",
  ]);
  return !binaryExts.has(extOf(name));
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------
// Very small line-based YAML highlighter. Not a real parser - just
// enough token recognition (comments, quoted strings, keys, numbers,
// booleans/null, anchors/aliases/tags) to make files easier to scan.
// ---------------------------------------------------------------------
function highlightScalars(text) {
  return escapeHtml(text)
    .replace(/\b(true|false|null|yes|no|on|off)\b/gi, '<span class="ye-bool">$1</span>')
    .replace(/\b(-?\d+(?:\.\d+)?)\b/g, '<span class="ye-num">$1</span>')
    .replace(/(&amp;[\w.-]+|\*[\w.-]+|!!?[\w/.-]+)/g, '<span class="ye-anchor">$1</span>');
}

function highlightValue(text) {
  if (text.trim() === "") return escapeHtml(text);
  const strRe = /"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'/g;
  let out = "";
  let last = 0;
  let m;
  while ((m = strRe.exec(text))) {
    out += highlightScalars(text.slice(last, m.index));
    out += `<span class="ye-string">${escapeHtml(m[0])}</span>`;
    last = strRe.lastIndex;
  }
  out += highlightScalars(text.slice(last));
  return out;
}

function highlightYamlLine(line) {
  let commentIdx = -1;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === "#" && !inSingle && !inDouble) {
      if (i === 0 || /\s/.test(line[i - 1])) {
        commentIdx = i;
        break;
      }
    }
  }
  const code = commentIdx === -1 ? line : line.slice(0, commentIdx);
  const comment = commentIdx === -1 ? "" : line.slice(commentIdx);

  const leadMatch = code.match(/^(\s*)((?:-\s+)*)/);
  const indent = leadMatch[1];
  const dashes = leadMatch[2];
  let rest = code.slice(leadMatch[0].length);

  let html = escapeHtml(indent);
  if (dashes) html += `<span class="ye-punc">${escapeHtml(dashes)}</span>`;

  const keyMatch = rest.match(/^([^\s:#'"[\]{}][^:#]*?):(\s|$)/);
  if (keyMatch) {
    html += `<span class="ye-key">${escapeHtml(keyMatch[1])}</span><span class="ye-punc">:</span>`;
    rest = rest.slice(keyMatch[1].length + 1);
  }
  html += highlightValue(rest);
  if (comment) html += `<span class="ye-comment">${escapeHtml(comment)}</span>`;
  return html.length ? html : " ";
}

const STYLE = `
:host {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  overflow: hidden;
  font-family: var(--paper-font-body1_-_font-family, Roboto, "Noto Sans", sans-serif);
  color: var(--primary-text-color, #212121);
  background: var(--primary-background-color, #fafafa);
  box-sizing: border-box;
}
* { box-sizing: border-box; }

.ye-header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 48px;
  flex: 0 0 auto;
  padding: 0 12px;
  background: var(--app-header-background-color, var(--primary-color, #03a9f4));
  color: var(--app-header-text-color, #fff);
}
.ye-header .ye-title { font-size: 18px; font-weight: 400; flex: 1; }
.ye-icon-btn {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 18px;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.ye-icon-btn:hover { background: rgba(255,255,255,0.15); }
.ye-header .ye-menu-btn { display: none; }

.ye-body { flex: 1 1 auto; display: flex; min-height: 0; position: relative; }

.ye-sidebar {
  width: 280px;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--divider-color, #e0e0e0);
  background: var(--card-background-color, #fff);
  min-height: 0;
}
.ye-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-bottom: 1px solid var(--divider-color, #e0e0e0);
  flex: 0 0 auto;
}
.ye-toolbar .ye-icon-btn { color: var(--primary-text-color, #212121); font-size: 16px; }
.ye-filter {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  border: none;
  background: var(--secondary-background-color, #f2f2f2);
  border-radius: 4px;
  color: inherit;
  font-size: 13px;
}
.ye-tree {
  flex: 1 1 auto;
  overflow: auto;
  padding: 4px 0;
  font-size: 13px;
  -webkit-user-select: none;
  user-select: none;
}
.ye-node-row {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  cursor: pointer;
  white-space: nowrap;
  border-radius: 4px;
  margin: 0 4px;
}
.ye-node-row:hover { background: var(--secondary-background-color, #f2f2f2); }
.ye-node-row.active { background: var(--light-primary-color, rgba(3,169,244,0.16)); color: var(--primary-color, #03a9f4); }
.ye-node-row.dirty-dot::after { content: ""; }
.ye-caret {
  width: 16px;
  flex: 0 0 auto;
  display: inline-block;
  text-align: center;
  transition: transform 0.1s ease;
  font-size: 10px;
  color: var(--secondary-text-color, #727272);
}
.ye-caret.open { transform: rotate(90deg); }
.ye-caret.hidden { visibility: hidden; }
.ye-node-icon { flex: 0 0 auto; margin-right: 6px; font-size: 13px; }
.ye-node-name { overflow: hidden; text-overflow: ellipsis; }
.ye-node-loading { padding: 4px 24px; font-size: 12px; color: var(--secondary-text-color, #727272); }
.ye-node-empty { padding: 4px 24px; font-size: 12px; color: var(--secondary-text-color, #727272); font-style: italic; }

.ye-main {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.ye-tabs {
  display: flex;
  overflow-x: auto;
  flex: 0 0 auto;
  background: var(--secondary-background-color, #f2f2f2);
  border-bottom: 1px solid var(--divider-color, #e0e0e0);
}
.ye-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 8px 8px 12px;
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;
  border-right: 1px solid var(--divider-color, #e0e0e0);
  max-width: 220px;
  background: transparent;
}
.ye-tab.active { background: var(--card-background-color, #fff); font-weight: 500; }
.ye-tab .name { overflow: hidden; text-overflow: ellipsis; }
.ye-tab .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--warning-color, #ff9800); flex: 0 0 auto; display: none; }
.ye-tab.dirty .dot { display: inline-block; }
.ye-tab .close {
  border: none; background: transparent; color: var(--secondary-text-color, #727272);
  cursor: pointer; font-size: 14px; line-height: 1; padding: 2px;
  border-radius: 50%; flex: 0 0 auto;
}
.ye-tab .close:hover { background: rgba(0,0,0,0.1); }

.ye-empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--secondary-text-color, #727272);
  font-size: 14px;
  text-align: center;
  padding: 24px;
}

.ye-editor-host { flex: 1 1 auto; position: relative; min-height: 0; }
.ye-file-pane {
  position: absolute;
  inset: 0;
  display: flex;
}
.ye-gutter {
  flex: 0 0 auto;
  width: 44px;
  overflow: hidden;
  background: var(--card-background-color, #fff);
  color: var(--secondary-text-color, #9e9e9e);
  text-align: right;
  padding: 8px 6px 8px 0;
  font: 13px/1.5 "Roboto Mono", "Courier New", monospace;
  border-right: 1px solid var(--divider-color, #eee);
  white-space: pre;
}
.ye-code-wrap { flex: 1 1 auto; position: relative; overflow: hidden; }
.ye-highlight, .ye-input {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 8px 12px;
  font: 13px/1.5 "Roboto Mono", "Courier New", monospace;
  white-space: pre;
  tab-size: 2;
  overflow: auto;
}
.ye-highlight {
  color: var(--primary-text-color, #212121);
  background: var(--card-background-color, #fff);
  pointer-events: none;
}
.ye-input {
  background: transparent;
  color: transparent;
  caret-color: var(--primary-text-color, #212121);
  border: none;
  resize: none;
  outline: none;
  z-index: 1;
}
.ye-input::selection { background: rgba(3,169,244,0.35); }

.ye-key { color: #6f42c1; font-weight: 500; }
.ye-string { color: #2e7d32; }
.ye-num { color: #1565c0; }
.ye-bool { color: #c2185b; font-weight: 500; }
.ye-comment { color: #9e9e9e; font-style: italic; }
.ye-anchor { color: #ef6c00; }
.ye-punc { color: var(--secondary-text-color, #727272); }

.ye-statusbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--secondary-text-color, #727272);
  border-top: 1px solid var(--divider-color, #e0e0e0);
  background: var(--card-background-color, #fff);
}
.ye-statusbar .path { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ye-statusbar .msg.warn { color: var(--warning-color, #ff9800); }
.ye-statusbar .msg.error { color: var(--error-color, #db4437); }
.ye-statusbar .msg.ok { color: var(--success-color, #43a047); }
.ye-save-btn {
  border: none;
  background: var(--primary-color, #03a9f4);
  color: #fff;
  padding: 5px 14px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
}
.ye-save-btn:disabled { opacity: 0.4; cursor: default; }

.ye-findbar {
  display: none;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--secondary-background-color, #f2f2f2);
  border-bottom: 1px solid var(--divider-color, #e0e0e0);
  flex: 0 0 auto;
  font-size: 12px;
}
.ye-findbar.open { display: flex; }
.ye-findbar input {
  padding: 5px 8px;
  border: 1px solid var(--divider-color, #e0e0e0);
  border-radius: 4px;
  font-size: 12px;
  width: 150px;
}
.ye-findbar button {
  border: 1px solid var(--divider-color, #e0e0e0);
  background: var(--card-background-color, #fff);
  border-radius: 4px;
  padding: 5px 8px;
  cursor: pointer;
  font-size: 12px;
}
.ye-findbar .count { color: var(--secondary-text-color, #727272); min-width: 70px; }

.ye-menu {
  position: fixed;
  z-index: 20;
  background: var(--card-background-color, #fff);
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  border-radius: 4px;
  padding: 4px 0;
  min-width: 160px;
  font-size: 13px;
  display: none;
}
.ye-menu.open { display: block; }
.ye-menu button {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 8px 14px;
  cursor: pointer;
  color: var(--primary-text-color, #212121);
  font-size: 13px;
}
.ye-menu button:hover { background: var(--secondary-background-color, #f2f2f2); }
.ye-menu button.danger { color: var(--error-color, #db4437); }

.ye-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 30;
  display: none;
  align-items: center;
  justify-content: center;
}
.ye-overlay.open { display: flex; }
.ye-dialog {
  background: var(--card-background-color, #fff);
  border-radius: 6px;
  padding: 20px;
  width: 320px;
  max-width: calc(100vw - 32px);
}
.ye-dialog h3 { margin: 0 0 12px; font-size: 16px; font-weight: 500; }
.ye-dialog p { margin: 0 0 12px; font-size: 13px; color: var(--secondary-text-color, #727272); }
.ye-dialog input {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--divider-color, #e0e0e0);
  border-radius: 4px;
  font-size: 14px;
  margin-bottom: 8px;
}
.ye-dialog .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.ye-dialog button {
  border: none;
  background: transparent;
  padding: 8px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: var(--primary-color, #03a9f4);
}
.ye-dialog button.primary { background: var(--primary-color, #03a9f4); color: #fff; }
.ye-dialog button.danger { background: var(--error-color, #db4437); color: #fff; }

@media (max-width: 870px) {
  .ye-header .ye-menu-btn { display: inline-flex; }
  .ye-sidebar {
    position: fixed;
    top: 48px;
    bottom: 0;
    left: 0;
    z-index: 15;
    width: 82vw;
    max-width: 320px;
    transform: translateX(-100%);
    transition: transform 0.18s ease;
    box-shadow: 2px 0 8px rgba(0,0,0,0.3);
  }
  .ye-sidebar.open { transform: translateX(0); }
  .ye-scrim {
    position: fixed;
    top: 48px; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.3);
    z-index: 14;
    display: none;
  }
  .ye-scrim.open { display: block; }
}
`;

const HTML = `
<div class="ye-header">
  <button class="ye-icon-btn ye-menu-btn" data-action="toggle-sidebar" title="Files">&#9776;</button>
  <div class="ye-title">YAML Editor</div>
  <button class="ye-icon-btn" data-action="save" title="Save (Ctrl+S)">&#128190;</button>
</div>
<div class="ye-body">
  <div class="ye-scrim" data-action="close-sidebar"></div>
  <div class="ye-sidebar">
    <div class="ye-toolbar">
      <button class="ye-icon-btn" data-action="new-file" title="New file">&#128196;+</button>
      <button class="ye-icon-btn" data-action="new-folder" title="New folder">&#128193;+</button>
      <button class="ye-icon-btn" data-action="refresh" title="Refresh">&#8635;</button>
      <input class="ye-filter" type="text" placeholder="Filter files..." />
    </div>
    <div class="ye-tree"></div>
  </div>
  <div class="ye-main">
    <div class="ye-tabs"></div>
    <div class="ye-findbar">
      <input class="ye-find-input" type="text" placeholder="Find" />
      <input class="ye-replace-input" type="text" placeholder="Replace" />
      <button data-action="find-prev">&#8593;</button>
      <button data-action="find-next">&#8595;</button>
      <button data-action="replace-one">Replace</button>
      <button data-action="replace-all">All</button>
      <span class="count"></span>
      <button data-action="find-close">&#10005;</button>
    </div>
    <div class="ye-editor-host">
      <div class="ye-empty-state">Select a file on the left to start editing.</div>
    </div>
    <div class="ye-statusbar">
      <span class="path"></span>
      <span class="msg"></span>
      <button class="ye-save-btn" data-action="save" disabled>Save</button>
    </div>
  </div>
</div>
<div class="ye-menu"></div>
<div class="ye-overlay">
  <div class="ye-dialog"></div>
</div>
`;

class YamlEditorPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._narrow = false;
    this._built = false;

    this._treeCache = new Map(); // path -> array of entries
    this._expanded = new Set([""]);
    this._loadingDirs = new Set();

    this._tabs = new Map(); // path -> {wrapper, textarea, highlightCode, gutter, mtime, originalContent, dirty, highlightTimer}
    this._tabOrder = [];
    this._activePath = null;
    this._filterText = "";

    this._contextTarget = null;

    this._onWindowBeforeUnload = this._onWindowBeforeUnload.bind(this);
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) this._build();
  }

  get hass() {
    return this._hass;
  }

  set narrow(value) {
    this._narrow = value;
    this._applyNarrow();
  }

  get narrow() {
    return this._narrow;
  }

  set route(_value) {
    /* unused */
  }

  set panel(_value) {
    /* unused */
  }

  connectedCallback() {
    if (this._hass && !this._built) this._build();
    window.addEventListener("beforeunload", this._onWindowBeforeUnload);
  }

  disconnectedCallback() {
    window.removeEventListener("beforeunload", this._onWindowBeforeUnload);
  }

  _onWindowBeforeUnload(evt) {
    if (this._anyDirty()) {
      evt.preventDefault();
      evt.returnValue = "";
    }
  }

  _anyDirty() {
    for (const tab of this._tabs.values()) if (tab.dirty) return true;
    return false;
  }

  // -------------------------------------------------------------------
  // Build
  // -------------------------------------------------------------------
  _build() {
    this._built = true;
    const style = document.createElement("style");
    style.textContent = STYLE;
    const root = document.createElement("div");
    root.style.display = "contents";
    root.innerHTML = HTML;
    this.shadowRoot.append(style, root);

    this._els = {
      sidebar: this.shadowRoot.querySelector(".ye-sidebar"),
      scrim: this.shadowRoot.querySelector(".ye-scrim"),
      tree: this.shadowRoot.querySelector(".ye-tree"),
      filter: this.shadowRoot.querySelector(".ye-filter"),
      tabs: this.shadowRoot.querySelector(".ye-tabs"),
      editorHost: this.shadowRoot.querySelector(".ye-editor-host"),
      statusPath: this.shadowRoot.querySelector(".ye-statusbar .path"),
      statusMsg: this.shadowRoot.querySelector(".ye-statusbar .msg"),
      saveBtn: this.shadowRoot.querySelector(".ye-statusbar .ye-save-btn"),
      menu: this.shadowRoot.querySelector(".ye-menu"),
      overlay: this.shadowRoot.querySelector(".ye-overlay"),
      dialog: this.shadowRoot.querySelector(".ye-dialog"),
      findBar: this.shadowRoot.querySelector(".ye-findbar"),
      findInput: this.shadowRoot.querySelector(".ye-find-input"),
      replaceInput: this.shadowRoot.querySelector(".ye-replace-input"),
      findCount: this.shadowRoot.querySelector(".ye-findbar .count"),
    };

    this.shadowRoot.addEventListener("click", (e) => this._onGlobalClick(e));
    this._els.tree.addEventListener("click", (e) => this._onTreeClick(e));
    this._els.tree.addEventListener("contextmenu", (e) => this._onTreeContextMenu(e));
    this._attachLongPress(this._els.tree);
    this._els.filter.addEventListener("input", (e) => {
      this._filterText = e.target.value.trim().toLowerCase();
      this._renderTree();
    });
    this._els.tabs.addEventListener("click", (e) => this._onTabsClick(e));
    this._els.overlay.addEventListener("click", (e) => {
      if (e.target === this._els.overlay) this._closeDialog();
    });
    this._els.findInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._findNext(!e.shiftKey);
      if (e.key === "Escape") this._closeFindBar();
    });

    this.addEventListener("keydown", (e) => this._onKeyDown(e));

    this._applyNarrow();
    this._loadDir("");
  }

  _applyNarrow() {
    if (!this._built) return;
    if (this._narrow) {
      this._els.sidebar.classList.remove("open");
      this._els.scrim.classList.remove("open");
    } else {
      this._els.sidebar.classList.add("open");
    }
  }

  _toggleSidebar(force) {
    const open = force !== undefined ? force : !this._els.sidebar.classList.contains("open");
    this._els.sidebar.classList.toggle("open", open);
    this._els.scrim.classList.toggle("open", open && this._narrow);
  }

  // -------------------------------------------------------------------
  // Global click / action dispatch
  // -------------------------------------------------------------------
  _onGlobalClick(e) {
    const actionEl = e.composedPath().find((el) => el.dataset && el.dataset.action);
    const action = actionEl ? actionEl.dataset.action : null;

    // Close open menu unless the click is inside it.
    if (!e.composedPath().includes(this._els.menu)) this._closeMenu();

    if (!action) return;
    switch (action) {
      case "toggle-sidebar":
        this._toggleSidebar();
        break;
      case "close-sidebar":
        this._toggleSidebar(false);
        break;
      case "new-file":
        this._promptCreate("", false);
        break;
      case "new-folder":
        this._promptCreate("", true);
        break;
      case "refresh":
        this._refreshAll();
        break;
      case "save":
        this._saveActive();
        break;
      case "find-next":
        this._findNext(true);
        break;
      case "find-prev":
        this._findNext(false);
        break;
      case "replace-one":
        this._replaceOne();
        break;
      case "replace-all":
        this._replaceAll();
        break;
      case "find-close":
        this._closeFindBar();
        break;
      default:
        break;
    }
  }

  _onKeyDown(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault();
      this._saveActive();
    } else if (mod && e.key.toLowerCase() === "f") {
      e.preventDefault();
      this._openFindBar();
    } else if (e.key === "Escape") {
      if (this._els.findBar.classList.contains("open")) this._closeFindBar();
    }
  }

  // -------------------------------------------------------------------
  // Tree
  // -------------------------------------------------------------------
  async _loadDir(path) {
    if (this._loadingDirs.has(path)) return;
    this._loadingDirs.add(path);
    this._renderTree();
    try {
      const res = await this._hass.callWS({ type: WS.LIST, path });
      this._treeCache.set(path, res.entries);
    } catch (err) {
      this._setStatus(`Failed to list ${path || "/"}: ${err.message || err.code}`, "error");
    } finally {
      this._loadingDirs.delete(path);
      this._renderTree();
    }
  }

  _refreshAll() {
    const toReload = this._filterText ? Array.from(this._treeCache.keys()) : Array.from(this._expanded);
    this._treeCache.clear();
    for (const p of toReload) this._loadDir(p);
    if (!toReload.includes("")) this._loadDir("");
  }

  _renderTree() {
    const html = this._renderNode("", 0);
    this._els.tree.innerHTML = html || '<div class="ye-node-empty">No files</div>';
  }

  _renderNode(path, depth) {
    const entries = this._treeCache.get(path);
    if (entries === undefined) {
      return this._loadingDirs.has(path) ? '<div class="ye-node-loading">Loading...</div>' : "";
    }

    const filtering = !!this._filterText;
    let out = "";
    for (const entry of entries) {
      if (filtering && !entry.is_dir && !entry.name.toLowerCase().includes(this._filterText)) {
        continue;
      }
      const expanded = this._expanded.has(entry.path);
      const icon = entry.is_dir ? "\u{1F4C1}" : "\u{1F4C4}";
      const caretClass = entry.is_dir ? (expanded ? "ye-caret open" : "ye-caret") : "ye-caret hidden";
      const active = entry.path === this._activePath ? " active" : "";
      const dirty = this._tabs.get(entry.path)?.dirty ? ' <span style="color:var(--warning-color,#ff9800)">●</span>' : "";
      out += `<div class="ye-node-row${active}" style="padding-left:${8 + depth * 16}px" data-path="${escapeHtml(entry.path)}" data-isdir="${entry.is_dir}">`;
      out += `<span class="${caretClass}">▶</span>`;
      out += `<span class="ye-node-icon">${icon}</span>`;
      out += `<span class="ye-node-name">${escapeHtml(entry.name)}${dirty}</span>`;
      out += `</div>`;
      if (entry.is_dir && (expanded || filtering)) {
        const childHtml = this._renderNode(entry.path, depth + 1);
        out += childHtml || (this._loadingDirs.has(entry.path) ? "" : `<div class="ye-node-empty" style="padding-left:${24 + depth * 16}px">empty</div>`);
        if (!this._treeCache.has(entry.path) && !this._loadingDirs.has(entry.path)) {
          this._loadDir(entry.path);
        }
      }
    }
    return out;
  }

  _onTreeClick(e) {
    const row = e.target.closest(".ye-node-row");
    if (!row) return;
    const path = row.dataset.path;
    const isDir = row.dataset.isdir === "true";
    if (isDir) {
      if (this._expanded.has(path)) this._expanded.delete(path);
      else {
        this._expanded.add(path);
        if (!this._treeCache.has(path)) this._loadDir(path);
      }
      this._renderTree();
    } else {
      this._openFile(path);
      if (this._narrow) this._toggleSidebar(false);
    }
  }

  _onTreeContextMenu(e) {
    const row = e.target.closest(".ye-node-row");
    if (!row) return;
    e.preventDefault();
    this._openContextMenu(row.dataset.path, row.dataset.isdir === "true", e.clientX, e.clientY);
  }

  _attachLongPress(container) {
    let timer = null;
    let target = null;
    container.addEventListener("touchstart", (e) => {
      const row = e.target.closest(".ye-node-row");
      if (!row) return;
      target = row;
      const touch = e.touches[0];
      timer = setTimeout(() => {
        this._openContextMenu(row.dataset.path, row.dataset.isdir === "true", touch.clientX, touch.clientY);
        timer = null;
      }, 500);
    });
    const cancel = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      target = null;
    };
    container.addEventListener("touchmove", cancel);
    container.addEventListener("touchend", cancel);
    container.addEventListener("touchcancel", cancel);
  }

  _openContextMenu(path, isDir, x, y) {
    this._contextTarget = { path, isDir };
    const menu = this._els.menu;
    let html = "";
    if (isDir) {
      html += '<button data-menu="new-file">New file here</button>';
      html += '<button data-menu="new-folder">New folder here</button>';
    }
    html += '<button data-menu="rename">Rename</button>';
    html += '<button class="danger" data-menu="delete">Delete</button>';
    menu.innerHTML = html;
    menu.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => this._onMenuAction(btn.dataset.menu));
    });

    const maxX = window.innerWidth - 180;
    const maxY = window.innerHeight - (isDir ? 160 : 100);
    menu.style.left = `${Math.min(x, maxX)}px`;
    menu.style.top = `${Math.min(y, maxY)}px`;
    menu.classList.add("open");
  }

  _closeMenu() {
    this._els.menu.classList.remove("open");
  }

  _onMenuAction(action) {
    const { path, isDir } = this._contextTarget || {};
    this._closeMenu();
    if (path === undefined) return;
    if (action === "new-file") this._promptCreate(isDir ? path : dirname(path), false);
    else if (action === "new-folder") this._promptCreate(isDir ? path : dirname(path), true);
    else if (action === "rename") this._promptRename(path, isDir);
    else if (action === "delete") this._confirmDelete(path, isDir);
  }

  // -------------------------------------------------------------------
  // Dialogs
  // -------------------------------------------------------------------
  _openDialog(html, focusSelector) {
    this._els.dialog.innerHTML = html;
    this._els.overlay.classList.add("open");
    if (focusSelector) {
      const el = this._els.dialog.querySelector(focusSelector);
      if (el) {
        el.focus();
        if (el.select) el.select();
      }
    }
  }

  _closeDialog() {
    this._els.overlay.classList.remove("open");
    this._els.dialog.innerHTML = "";
  }

  _promptCreate(basePath, isDir) {
    const label = isDir ? "New folder" : "New file";
    this._openDialog(
      `<h3>${label}</h3>
       <p>In: /${escapeHtml(basePath) || "config root"}</p>
       <input type="text" class="ye-name-input" placeholder="${isDir ? "folder-name" : "filename.yaml"}" />
       <div class="actions">
         <button data-dlg="cancel">Cancel</button>
         <button class="primary" data-dlg="ok">Create</button>
       </div>`,
      ".ye-name-input"
    );
    const input = this._els.dialog.querySelector(".ye-name-input");
    const submit = async () => {
      const name = input.value.trim();
      if (!name) return;
      const path = joinPath(basePath, name);
      try {
        await this._hass.callWS({ type: WS.CREATE, path, is_dir: isDir });
        this._closeDialog();
        this._treeCache.delete(basePath);
        this._expanded.add(basePath);
        await this._loadDir(basePath);
        if (!isDir) this._openFile(path);
      } catch (err) {
        this._setStatus(`Could not create: ${err.message || err.code}`, "error");
      }
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
    this._els.dialog.querySelector('[data-dlg="ok"]').addEventListener("click", submit);
    this._els.dialog.querySelector('[data-dlg="cancel"]').addEventListener("click", () => this._closeDialog());
  }

  _promptRename(path, isDir) {
    const oldName = basename(path);
    this._openDialog(
      `<h3>Rename</h3>
       <input type="text" class="ye-name-input" value="${escapeHtml(oldName)}" />
       <div class="actions">
         <button data-dlg="cancel">Cancel</button>
         <button class="primary" data-dlg="ok">Rename</button>
       </div>`,
      ".ye-name-input"
    );
    const input = this._els.dialog.querySelector(".ye-name-input");
    const submit = async () => {
      const name = input.value.trim();
      if (!name || name === oldName) {
        this._closeDialog();
        return;
      }
      const newPath = joinPath(dirname(path), name);
      try {
        await this._hass.callWS({ type: WS.RENAME, path, new_path: newPath });
        this._closeDialog();
        this._onRenamed(path, newPath, isDir);
      } catch (err) {
        this._setStatus(`Could not rename: ${err.message || err.code}`, "error");
      }
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
    this._els.dialog.querySelector('[data-dlg="ok"]').addEventListener("click", submit);
    this._els.dialog.querySelector('[data-dlg="cancel"]').addEventListener("click", () => this._closeDialog());
  }

  _onRenamed(oldPath, newPath, isDir) {
    if (isDir) {
      // Simplest correct behaviour: close any open tabs under the old
      // directory path and refresh the tree.
      for (const p of Array.from(this._tabs.keys())) {
        if (p === oldPath || p.startsWith(`${oldPath}/`)) this._closeTab(p, true);
      }
    } else if (this._tabs.has(oldPath)) {
      const tab = this._tabs.get(oldPath);
      this._tabs.delete(oldPath);
      this._tabs.set(newPath, tab);
      const idx = this._tabOrder.indexOf(oldPath);
      if (idx !== -1) this._tabOrder[idx] = newPath;
      if (this._activePath === oldPath) this._activePath = newPath;
    }
    this._treeCache.delete(dirname(oldPath) || "");
    this._loadDir(dirname(oldPath) || "");
    this._renderTabs();
    this._renderTree();
  }

  _confirmDelete(path, isDir) {
    this._openDialog(
      `<h3>Delete ${isDir ? "folder" : "file"}?</h3>
       <p>${escapeHtml(path)}${isDir ? " and everything inside it" : ""} will be permanently deleted.</p>
       <div class="actions">
         <button data-dlg="cancel">Cancel</button>
         <button class="danger" data-dlg="ok">Delete</button>
       </div>`
    );
    this._els.dialog.querySelector('[data-dlg="ok"]').addEventListener("click", async () => {
      try {
        await this._hass.callWS({ type: WS.DELETE, path, recursive: isDir });
        this._closeDialog();
        if (isDir) {
          for (const p of Array.from(this._tabs.keys())) {
            if (p === path || p.startsWith(`${path}/`)) this._closeTab(p, true);
          }
        } else {
          this._closeTab(path, true);
        }
        this._expanded.delete(path);
        const parent = dirname(path) || "";
        this._treeCache.delete(parent);
        this._loadDir(parent);
      } catch (err) {
        this._setStatus(`Could not delete: ${err.message || err.code}`, "error");
      }
    });
    this._els.dialog.querySelector('[data-dlg="cancel"]').addEventListener("click", () => this._closeDialog());
  }

  // -------------------------------------------------------------------
  // Tabs / editing
  // -------------------------------------------------------------------
  async _openFile(path) {
    if (this._tabs.has(path)) {
      this._activatePath(path);
      return;
    }
    if (!isProbablyTextExt(basename(path))) {
      this._setStatus(`"${basename(path)}" looks like a binary file and can't be edited here.`, "error");
      return;
    }
    this._setStatus(`Opening ${path}...`);
    try {
      const res = await this._hass.callWS({ type: WS.READ, path });
      this._createTab(path, res.content, res.modified);
      this._activatePath(path);
      this._setStatus("");
    } catch (err) {
      if (err.code === "not_text_file") {
        this._setStatus(`"${basename(path)}" is not a text file and can't be edited here.`, "error");
      } else if (err.code === "file_too_large") {
        this._setStatus(`"${basename(path)}" is too large to edit here.`, "error");
      } else {
        this._setStatus(`Failed to open ${path}: ${err.message || err.code}`, "error");
      }
    }
  }

  _createTab(path, content, mtime) {
    const wrapper = document.createElement("div");
    wrapper.className = "ye-file-pane";
    wrapper.style.display = "none";
    wrapper.innerHTML = `
      <div class="ye-gutter"></div>
      <div class="ye-code-wrap">
        <pre class="ye-highlight"><code></code></pre>
        <textarea class="ye-input" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off"></textarea>
      </div>`;
    this._els.editorHost.appendChild(wrapper);

    const textarea = wrapper.querySelector(".ye-input");
    const highlightCode = wrapper.querySelector(".ye-highlight code");
    const gutter = wrapper.querySelector(".ye-gutter");

    textarea.value = content;

    const tab = {
      wrapper,
      textarea,
      highlightCode,
      gutter,
      mtime,
      originalContent: content,
      dirty: false,
      highlightTimer: null,
    };
    this._tabs.set(path, tab);
    this._tabOrder.push(path);

    textarea.addEventListener("input", () => {
      tab.dirty = textarea.value !== tab.originalContent;
      this._renderTabs();
      this._renderTree();
      if (tab.highlightTimer) clearTimeout(tab.highlightTimer);
      tab.highlightTimer = setTimeout(() => this._updateHighlight(path), 120);
      this._updateGutter(path);
    });
    textarea.addEventListener("scroll", () => {
      wrapper.querySelector(".ye-highlight").scrollTop = textarea.scrollTop;
      wrapper.querySelector(".ye-highlight").scrollLeft = textarea.scrollLeft;
      gutter.scrollTop = textarea.scrollTop;
    });
    textarea.addEventListener("keydown", (e) => this._onEditorKeyDown(e, textarea));

    this._updateHighlight(path);
    this._updateGutter(path);
    this._els.editorHost.querySelector(".ye-empty-state")?.remove();
  }

  _onEditorKeyDown(e, textarea) {
    if (e.key === "Tab") {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const inserted = document.execCommand && document.queryCommandSupported && document.queryCommandSupported("insertText")
        ? document.execCommand("insertText", false, "  ")
        : false;
      if (!inserted) {
        textarea.value = `${textarea.value.slice(0, start)}  ${textarea.value.slice(end)}`;
        textarea.selectionStart = textarea.selectionEnd = start + 2;
        textarea.dispatchEvent(new Event("input"));
      }
    }
  }

  _updateHighlight(path) {
    const tab = this._tabs.get(path);
    if (!tab) return;
    const lines = tab.textarea.value.split("\n");
    tab.highlightCode.innerHTML = lines.map(highlightYamlLine).join("\n");
  }

  _updateGutter(path) {
    const tab = this._tabs.get(path);
    if (!tab) return;
    const lineCount = tab.textarea.value.split("\n").length;
    let out = "";
    for (let i = 1; i <= lineCount; i++) out += `${i}\n`;
    tab.gutter.textContent = out;
  }

  _activatePath(path) {
    this._activePath = path;
    for (const [p, tab] of this._tabs) {
      tab.wrapper.style.display = p === path ? "flex" : "none";
    }
    const tab = this._tabs.get(path);
    if (tab) {
      requestAnimationFrame(() => tab.textarea.focus());
    }
    this._renderTabs();
    this._renderTree();
    this._updateStatusBar();
  }

  _renderTabs() {
    let html = "";
    for (const path of this._tabOrder) {
      const tab = this._tabs.get(path);
      if (!tab) continue;
      const active = path === this._activePath ? " active" : "";
      const dirty = tab.dirty ? " dirty" : "";
      html += `<div class="ye-tab${active}${dirty}" data-path="${escapeHtml(path)}" title="${escapeHtml(path)}">`;
      html += `<span class="dot"></span><span class="name">${escapeHtml(basename(path))}</span>`;
      html += `<button class="close" data-close="${escapeHtml(path)}">&#10005;</button>`;
      html += `</div>`;
    }
    this._els.tabs.innerHTML = html;
  }

  _onTabsClick(e) {
    const closeBtn = e.target.closest("[data-close]");
    if (closeBtn) {
      this._closeTab(closeBtn.dataset.close, false);
      return;
    }
    const tabEl = e.target.closest(".ye-tab");
    if (tabEl) this._activatePath(tabEl.dataset.path);
  }

  _closeTab(path, force) {
    const tab = this._tabs.get(path);
    if (!tab) return;
    if (tab.dirty && !force) {
      this._openDialog(
        `<h3>Discard changes?</h3>
         <p>"${escapeHtml(basename(path))}" has unsaved changes.</p>
         <div class="actions">
           <button data-dlg="cancel">Cancel</button>
           <button class="danger" data-dlg="ok">Discard &amp; close</button>
         </div>`
      );
      this._els.dialog.querySelector('[data-dlg="ok"]').addEventListener("click", () => {
        this._closeDialog();
        this._closeTab(path, true);
      });
      this._els.dialog.querySelector('[data-dlg="cancel"]').addEventListener("click", () => this._closeDialog());
      return;
    }

    if (tab.highlightTimer) clearTimeout(tab.highlightTimer);
    tab.wrapper.remove();
    this._tabs.delete(path);
    this._tabOrder = this._tabOrder.filter((p) => p !== path);

    if (this._activePath === path) {
      const next = this._tabOrder[this._tabOrder.length - 1] || null;
      this._activePath = null;
      if (next) this._activatePath(next);
      else {
        this._els.editorHost.insertAdjacentHTML(
          "beforeend",
          '<div class="ye-empty-state">Select a file on the left to start editing.</div>'
        );
        this._updateStatusBar();
      }
    }
    this._renderTabs();
    this._renderTree();
  }

  _updateStatusBar() {
    const path = this._activePath;
    const tab = path ? this._tabs.get(path) : null;
    this._els.statusPath.textContent = path ? `/${path}` : "";
    this._els.saveBtn.disabled = !tab || !tab.dirty;
    if (!path) this._setStatus("");
  }

  _setStatus(message, level) {
    this._els.statusMsg.textContent = message || "";
    this._els.statusMsg.className = `msg${level ? ` ${level}` : ""}`;
  }

  async _saveActive() {
    const path = this._activePath;
    if (!path) return;
    const tab = this._tabs.get(path);
    if (!tab || !tab.dirty) return;
    await this._saveTab(path, false);
  }

  async _saveTab(path, force) {
    const tab = this._tabs.get(path);
    if (!tab) return;
    const content = tab.textarea.value;
    this._setStatus("Saving...");
    try {
      const res = await this._hass.callWS({
        type: WS.WRITE,
        path,
        content,
        expected_modified: tab.mtime,
        force,
      });
      tab.mtime = res.modified;
      tab.originalContent = content;
      tab.dirty = false;
      this._renderTabs();
      this._renderTree();
      this._updateStatusBar();
      if (res.yaml_valid === false) {
        this._setStatus(`Saved, but YAML has a syntax error: ${res.yaml_error}`, "warn");
      } else {
        this._setStatus("Saved", "ok");
        setTimeout(() => {
          if (this._activePath === path) this._setStatus("");
        }, 2000);
      }
    } catch (err) {
      if (err.code === "conflict") {
        this._openDialog(
          `<h3>File changed on disk</h3>
           <p>"${escapeHtml(basename(path))}" was modified outside this editor since you opened it.</p>
           <div class="actions">
             <button data-dlg="cancel">Cancel</button>
             <button class="danger" data-dlg="ok">Overwrite anyway</button>
           </div>`
        );
        this._els.dialog.querySelector('[data-dlg="ok"]').addEventListener("click", () => {
          this._closeDialog();
          this._saveTab(path, true);
        });
        this._els.dialog.querySelector('[data-dlg="cancel"]').addEventListener("click", () => this._closeDialog());
      } else {
        this._setStatus(`Save failed: ${err.message || err.code}`, "error");
      }
    }
  }

  // -------------------------------------------------------------------
  // Find / replace (operates on the active tab's textarea)
  // -------------------------------------------------------------------
  _openFindBar() {
    if (!this._activePath) return;
    this._els.findBar.classList.add("open");
    this._els.findInput.focus();
    this._els.findInput.select();
  }

  _closeFindBar() {
    this._els.findBar.classList.remove("open");
    const tab = this._activePath && this._tabs.get(this._activePath);
    if (tab) tab.textarea.focus();
  }

  _countMatches(text, query) {
    if (!query) return 0;
    let count = 0;
    let idx = 0;
    const hay = text.toLowerCase();
    const needle = query.toLowerCase();
    while ((idx = hay.indexOf(needle, idx)) !== -1) {
      count++;
      idx += needle.length;
    }
    return count;
  }

  _findNext(forward) {
    const tab = this._activePath && this._tabs.get(this._activePath);
    if (!tab) return;
    const query = this._els.findInput.value;
    if (!query) {
      this._els.findCount.textContent = "";
      return;
    }
    const textarea = tab.textarea;
    const text = textarea.value;
    const hay = text.toLowerCase();
    const needle = query.toLowerCase();
    const total = this._countMatches(text, query);
    this._els.findCount.textContent = total ? `${total} match${total === 1 ? "" : "es"}` : "No matches";
    if (!total) return;

    let idx;
    if (forward) {
      idx = hay.indexOf(needle, textarea.selectionEnd);
      if (idx === -1) idx = hay.indexOf(needle, 0);
    } else {
      idx = hay.lastIndexOf(needle, Math.max(0, textarea.selectionStart - needle.length - 1));
      if (idx === -1) idx = hay.lastIndexOf(needle);
    }
    if (idx === -1) return;

    textarea.focus();
    textarea.setSelectionRange(idx, idx + needle.length);
    const before = text.slice(0, idx);
    const lineNum = before.split("\n").length - 1;
    const lineHeight = 19.5;
    textarea.scrollTop = Math.max(0, lineNum * lineHeight - textarea.clientHeight / 2);
    textarea.dispatchEvent(new Event("scroll"));
  }

  _replaceOne() {
    const tab = this._activePath && this._tabs.get(this._activePath);
    if (!tab) return;
    const textarea = tab.textarea;
    const query = this._els.findInput.value;
    if (!query) return;
    const selected = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
    if (selected.toLowerCase() !== query.toLowerCase()) {
      this._findNext(true);
      return;
    }
    const replacement = this._els.replaceInput.value;
    const start = textarea.selectionStart;
    textarea.value = textarea.value.slice(0, start) + replacement + textarea.value.slice(textarea.selectionEnd);
    textarea.selectionStart = textarea.selectionEnd = start + replacement.length;
    textarea.dispatchEvent(new Event("input"));
    this._findNext(true);
  }

  _replaceAll() {
    const tab = this._activePath && this._tabs.get(this._activePath);
    if (!tab) return;
    const query = this._els.findInput.value;
    if (!query) return;
    const replacement = this._els.replaceInput.value;
    const textarea = tab.textarea;
    const parts = textarea.value.split(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"));
    const count = parts.length - 1;
    textarea.value = parts.join(replacement);
    textarea.dispatchEvent(new Event("input"));
    this._els.findCount.textContent = count ? `Replaced ${count}` : "No matches";
  }
}

customElements.define("yaml-editor-panel", YamlEditorPanel);
