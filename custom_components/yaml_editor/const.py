"""Constants for the YAML Config Editor integration."""

DOMAIN = "yaml_editor"

PANEL_URL_PATH = "yaml-editor"
PANEL_TITLE = "YAML Editor"
PANEL_ICON = "mdi:file-code-outline"

FRONTEND_STATIC_PATH = "/yaml_editor_files"
PANEL_MODULE_FILE = "yaml-editor-panel.js"
PANEL_CUSTOM_ELEMENT = "yaml-editor-panel"

# Bump this when the frontend JS changes so browsers don't serve a
# stale cached copy of the panel module after an update.
PANEL_JS_VERSION = "1"

# Files larger than this are refused for editing in the browser.
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MiB
