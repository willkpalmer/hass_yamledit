# Changelog

All notable changes to this project are documented here. Versions
follow [Semantic Versioning](https://semver.org/) and match the
`version` field in `custom_components/yaml_editor/manifest.json`.

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
