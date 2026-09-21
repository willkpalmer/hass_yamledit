"""Filesystem helpers for the YAML Config Editor.

All functions here are synchronous / blocking and are expected to be
called via ``hass.async_add_executor_job``. They enforce that every
path stays inside Home Assistant's ``/config`` directory (or whatever
``hass.config.path()`` resolves to), so the panel can never be used to
read or write files elsewhere on the host.
"""
from __future__ import annotations

import os
import shutil
from dataclasses import dataclass
from typing import Any

from .const import MAX_FILE_SIZE_BYTES


class PathError(Exception):
    """Raised when a requested path is invalid or escapes /config."""


class NotFoundError(Exception):
    """Raised when a path does not exist."""


class AlreadyExistsError(Exception):
    """Raised when a create/rename target already exists."""


class ConflictError(Exception):
    """Raised when a file changed on disk since it was last read."""


class FileTooLargeError(Exception):
    """Raised when a file is too large to edit in the browser."""


class NotTextFileError(Exception):
    """Raised when a file cannot be decoded as UTF-8 text."""


@dataclass
class Entry:
    """A single file or directory entry."""

    name: str
    path: str
    is_dir: bool
    size: int
    modified: float


def resolve(config_root: str, rel_path: str) -> str:
    """Resolve a user-supplied relative path against the config root.

    Raises PathError if the resulting path is not inside config_root.
    """
    if rel_path is None:
        rel_path = ""
    # Normalize windows-style separators just in case, and strip any
    # leading slashes so os.path.join treats it as relative.
    rel_path = rel_path.replace("\\", "/").lstrip("/")

    root_real = os.path.realpath(config_root)
    candidate = os.path.realpath(os.path.join(root_real, rel_path))

    if candidate != root_real and not candidate.startswith(root_real + os.sep):
        raise PathError(f"Path escapes the config directory: {rel_path!r}")

    return candidate


def _rel(config_root: str, abs_path: str) -> str:
    root_real = os.path.realpath(config_root)
    rel = os.path.relpath(abs_path, root_real)
    return "" if rel == "." else rel.replace(os.sep, "/")


def list_dir(config_root: str, rel_path: str) -> list[Entry]:
    """List the direct children of a directory."""
    abs_path = resolve(config_root, rel_path)

    if not os.path.exists(abs_path):
        raise NotFoundError(rel_path)
    if not os.path.isdir(abs_path):
        raise PathError(f"Not a directory: {rel_path!r}")

    entries: list[Entry] = []
    with os.scandir(abs_path) as it:
        for item in it:
            # Skip dotfiles/dirs like .git, .storage, .cloud etc. by default
            # is intentionally NOT done here - the frontend decides what to
            # show/hide so the user can still reach hidden config if needed.
            try:
                stat = item.stat(follow_symlinks=True)
            except OSError:
                continue
            entries.append(
                Entry(
                    name=item.name,
                    path=_rel(config_root, item.path),
                    is_dir=item.is_dir(follow_symlinks=True),
                    size=0 if item.is_dir(follow_symlinks=True) else stat.st_size,
                    modified=stat.st_mtime,
                )
            )

    entries.sort(key=lambda e: (not e.is_dir, e.name.lower()))
    return entries


def read_file(config_root: str, rel_path: str) -> tuple[str, float, int]:
    """Read a text file. Returns (content, mtime, size)."""
    abs_path = resolve(config_root, rel_path)

    if not os.path.exists(abs_path):
        raise NotFoundError(rel_path)
    if os.path.isdir(abs_path):
        raise PathError(f"Path is a directory: {rel_path!r}")

    size = os.path.getsize(abs_path)
    if size > MAX_FILE_SIZE_BYTES:
        raise FileTooLargeError(rel_path)

    try:
        with open(abs_path, "r", encoding="utf-8") as handle:
            content = handle.read()
    except UnicodeDecodeError as err:
        raise NotTextFileError(rel_path) from err

    mtime = os.path.getmtime(abs_path)
    return content, mtime, size


def write_file(
    config_root: str, rel_path: str, content: str, expected_mtime: float | None
) -> float:
    """Write a text file, optionally checking for conflicting edits.

    Returns the new mtime.
    """
    abs_path = resolve(config_root, rel_path)

    if os.path.isdir(abs_path):
        raise PathError(f"Path is a directory: {rel_path!r}")

    if expected_mtime is not None and os.path.exists(abs_path):
        current_mtime = os.path.getmtime(abs_path)
        # Allow a little slack for filesystem timestamp resolution.
        if current_mtime - expected_mtime > 1:
            raise ConflictError(
                f"File changed on disk since it was opened: {rel_path!r}"
            )

    parent = os.path.dirname(abs_path)
    os.makedirs(parent, exist_ok=True)

    tmp_path = f"{abs_path}.yaml_editor_tmp"
    with open(tmp_path, "w", encoding="utf-8") as handle:
        handle.write(content)
    os.replace(tmp_path, abs_path)

    return os.path.getmtime(abs_path)


def create(config_root: str, rel_path: str, is_dir: bool) -> None:
    """Create a new empty file or directory."""
    abs_path = resolve(config_root, rel_path)

    if os.path.exists(abs_path):
        raise AlreadyExistsError(rel_path)

    parent = os.path.dirname(abs_path)
    os.makedirs(parent, exist_ok=True)

    if is_dir:
        os.makedirs(abs_path)
    else:
        with open(abs_path, "x", encoding="utf-8"):
            pass


def delete(config_root: str, rel_path: str, recursive: bool) -> None:
    """Delete a file or directory."""
    if rel_path in ("", "/", None):
        raise PathError("Refusing to delete the config root")

    abs_path = resolve(config_root, rel_path)

    if not os.path.exists(abs_path):
        raise NotFoundError(rel_path)

    if os.path.isdir(abs_path):
        if recursive:
            shutil.rmtree(abs_path)
        else:
            os.rmdir(abs_path)
    else:
        os.remove(abs_path)


def rename(config_root: str, rel_path: str, new_rel_path: str) -> str:
    """Rename/move a file or directory. Returns the new relative path."""
    abs_src = resolve(config_root, rel_path)
    abs_dst = resolve(config_root, new_rel_path)

    if not os.path.exists(abs_src):
        raise NotFoundError(rel_path)
    if os.path.exists(abs_dst):
        raise AlreadyExistsError(new_rel_path)

    parent = os.path.dirname(abs_dst)
    os.makedirs(parent, exist_ok=True)

    os.rename(abs_src, abs_dst)
    return _rel(config_root, abs_dst)


def entry_to_dict(entry: Entry) -> dict[str, Any]:
    return {
        "name": entry.name,
        "path": entry.path,
        "is_dir": entry.is_dir,
        "size": entry.size,
        "modified": entry.modified,
    }
