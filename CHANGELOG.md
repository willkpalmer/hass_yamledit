# Changelog

All notable changes to this project are documented here. Versions
follow Semantic Versioning (`MAJOR.MINOR.PATCH`) and match the
`version` field in `custom_components/yaml_editor/manifest.json`.
Releases `2026.9.0`-`2026.9.4` briefly used Home Assistant's calendar
versioning scheme (`YYYY.MM.MICRO`) instead; `0.3.1` reverts to
Semantic Versioning, picking up where `0.3.0` left off.

## 0.3.1

- Reverted the `version` field back to Semantic Versioning after a
  brief switch to Home Assistant's calendar versioning scheme.
  Includes everything from the unreleased `2026.9.1`-`2026.9.4` line:
  the highlight/cursor alignment fix (and the cache-busting bump that
  actually shipped it), the bundled brand icon, and the "WP" display
  name prefix.

## 2026.9.4

- The `2026.9.1` highlight/cursor alignment fix never actually reached
  browsers: it edited the panel JS but didn't bump
  `PANEL_JS_VERSION`, the cache-busting query param on the module URL
  (`yaml-editor-panel.js?v=...`), and the static path is served with
  `cache_headers=True`. Browsers that had already loaded the panel
  kept serving the pre-fix file from cache indefinitely. Bumped the
  version so the fix is actually delivered; if you still see
  misalignment after updating, do a hard refresh (or clear the site's
  cache) once to drop any already-cached copy.

## 2026.9.3

- Renamed the integration's display name to "WP YAML Config Editor"
  (prefixed with "WP") so it's how the integration appears in the
  HACS directory and on the Settings -> Devices & Services
  integrations page. The domain (`yaml_editor`) and the sidebar panel
  title ("YAML Editor") are unchanged, so existing installs and
  config entries are unaffected.

## 2026.9.2

- Added a bundled brand icon (`custom_components/yaml_editor/brand/`)
  so the integration shows a real icon instead of a placeholder in
  both the HACS directory and the Settings -> Devices & Services
  integrations page. Requires Home Assistant 2026.3.0+ (older
  versions still work, just without the icon, since there is no
  matching entry in the legacy `home-assistant/brands` repository).

## 2026.9.1

- Fixed a remaining cause of the edit/selection highlight and cursor
  drifting out of alignment with the visible text (mainly on mobile):
  the highlighter's `<code>` element inside the `<pre>` overlay picked
  up the browser's built-in `code { font-family: monospace }` rule
  directly, which overrides an inherited font regardless of
  specificity, so it rendered in a different monospace font than the
  textarea underneath. The overlay `<code>` now explicitly inherits
  its font from its parent.

## 2026.9.0

- Switched version numbering from Semantic Versioning to Home
  Assistant's calendar versioning scheme (`YYYY.MM.MICRO`).

## 0.3.0

- Added a confirmation dialog before leaving a file with unsaved
  changes, covering in-app navigation (sidebar links) and the
  back/forward button (or the mobile app's back gesture/hardware
  back button), not just closing the browser tab.
- Fixed a mobile bug where the edit/selection highlight was
  misaligned with the visible text, making editing effectively
  impossible: the editor font was below the 16px threshold that
  triggers iOS's auto-zoom-on-focus, and mobile browsers were
  auto-adjusting text size independently on the overlay layers.

## 0.2.0

- File tree now defaults to showing only `.yaml`/`.yml` files, with a
  toggle to show all files. Folders always stay visible for
  navigation, and the toggle preference persists per-browser.

## 0.1.0

- Initial release: sidebar panel for browsing and editing files under
  `/config`, with a file tree, tabbed textarea-based editor (native
  copy/paste/undo), lightweight YAML syntax highlighting, find &
  replace, and create/rename/delete via context menu.
