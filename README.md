# YAML Config Editor

A Home Assistant custom integration that adds a **YAML Editor** panel to
your sidebar for browsing and editing the files under your `/config`
directory — straight from the Home Assistant web UI or the Companion
App on your phone. No SSH, Samba share, VS Code add-on, or other
external tool required.

![admin only](https://img.shields.io/badge/access-admins%20only-blue)

## Features

- File tree browser for the whole `/config` directory (lazy-loaded,
  with a filter box). Shows only `.yaml`/`.yml` files by default -
  folders are always shown for navigation - with a toggle to switch to
  showing every file.
- Open several files at once in tabs, each with its own undo history.
- Plain `<textarea>` editing under the hood, so copy, paste, cut,
  select-all, and undo/redo all use your browser's/phone's native
  behaviour — nothing custom to fight with.
- Lightweight YAML syntax highlighting (keys, strings, numbers,
  booleans, comments, anchors/aliases/tags) and line numbers.
- Find & replace within the open file.
- Create, rename and delete files and folders from a right-click (or
  long-press, on touch) context menu.
- Save with `Ctrl+S` / `Cmd+S`. YAML files are checked with a YAML
  parser on save and you get a non-blocking warning if the syntax is
  invalid — the save still goes through, so you can fix it in place.
- Detects if a file changed on disk since you opened it and asks
  before overwriting.
- Works in both light and dark Home Assistant themes, and adapts to
  narrow (mobile) screens with a slide-out file drawer.
- No external JavaScript dependencies and no internet access needed —
  everything is served locally from the integration itself.

## Security

Every action requires an **administrator** account (`require_admin`
on both the panel and every websocket command). All file paths are
resolved and checked against your Home Assistant config directory, so
the panel can never read or write files outside of `/config`.

## Installation

### HACS (custom repository)

1. In HACS, go to **Integrations → ⋮ → Custom repositories**.
2. Add this repository's URL with category **Integration**.
3. Install "YAML Config Editor" and restart Home Assistant.

### Manual

1. Copy `custom_components/yaml_editor` into your Home Assistant
   `config/custom_components/` directory.
2. Restart Home Assistant.

### Enable it

After restarting, go to **Settings → Devices & Services → Add
Integration**, search for **YAML Config Editor**, and add it. A
"YAML Editor" entry will appear in your sidebar.

## Usage notes

- Renaming moves a file/folder within the same directory; to move a
  file to a different directory, create it in the new location and
  delete the old one (drag/drop move is not implemented).
- Files over 5 MB, and files that don't decode as UTF-8 text, are
  refused to keep the browser editor responsive.
- The syntax highlighter is a lightweight line-based tokenizer, not a
  full YAML parser — it's for readability, not validation. Saving a
  `.yaml`/`.yml` file runs it through a real YAML parser and flags any
  syntax errors.

## Requirements

Home Assistant 2024.8 or newer (for the static-path registration API
this integration uses).
