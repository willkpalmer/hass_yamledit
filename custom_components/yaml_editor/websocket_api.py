"""Websocket API for the YAML Config Editor panel.

Every command here requires an admin user (enforced by
``@websocket_api.require_admin``) because it grants read/write access
to arbitrary files under Home Assistant's /config directory.
"""
from __future__ import annotations

import logging

import voluptuous as vol
import yaml

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from . import file_util
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


def async_setup(hass: HomeAssistant) -> None:
    """Register all yaml_editor websocket commands."""
    websocket_api.async_register_command(hass, websocket_list_dir)
    websocket_api.async_register_command(hass, websocket_read_file)
    websocket_api.async_register_command(hass, websocket_write_file)
    websocket_api.async_register_command(hass, websocket_create)
    websocket_api.async_register_command(hass, websocket_delete)
    websocket_api.async_register_command(hass, websocket_rename)


def _config_root(hass: HomeAssistant) -> str:
    return hass.config.path()


def _send_file_error(connection: websocket_api.ActiveConnection, msg_id: int, err: Exception) -> None:
    if isinstance(err, file_util.NotFoundError):
        connection.send_error(msg_id, "not_found", str(err) or "Not found")
    elif isinstance(err, file_util.AlreadyExistsError):
        connection.send_error(msg_id, "already_exists", str(err) or "Already exists")
    elif isinstance(err, file_util.ConflictError):
        connection.send_error(msg_id, "conflict", str(err) or "File changed on disk")
    elif isinstance(err, file_util.FileTooLargeError):
        connection.send_error(msg_id, "file_too_large", "File is too large to edit")
    elif isinstance(err, file_util.NotTextFileError):
        connection.send_error(msg_id, "not_text_file", "File is not a text file")
    elif isinstance(err, file_util.PathError):
        connection.send_error(msg_id, "invalid_path", str(err) or "Invalid path")
    elif isinstance(err, OSError):
        connection.send_error(msg_id, "os_error", str(err))
    else:
        _LOGGER.exception("Unexpected error in yaml_editor websocket command")
        connection.send_error(msg_id, "unknown_error", str(err))


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/list_dir",
        vol.Optional("path", default=""): str,
    }
)
@websocket_api.async_response
async def websocket_list_dir(hass, connection, msg):
    """Handle listing a directory."""
    try:
        entries = await hass.async_add_executor_job(
            file_util.list_dir, _config_root(hass), msg["path"]
        )
    except Exception as err:  # pylint: disable=broad-except
        _send_file_error(connection, msg["id"], err)
        return

    connection.send_result(
        msg["id"],
        {
            "path": msg["path"],
            "entries": [file_util.entry_to_dict(e) for e in entries],
        },
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/read_file",
        vol.Required("path"): str,
    }
)
@websocket_api.async_response
async def websocket_read_file(hass, connection, msg):
    """Handle reading a file's contents."""
    try:
        content, mtime, size = await hass.async_add_executor_job(
            file_util.read_file, _config_root(hass), msg["path"]
        )
    except Exception as err:  # pylint: disable=broad-except
        _send_file_error(connection, msg["id"], err)
        return

    connection.send_result(
        msg["id"],
        {
            "path": msg["path"],
            "content": content,
            "modified": mtime,
            "size": size,
        },
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/write_file",
        vol.Required("path"): str,
        vol.Required("content"): str,
        vol.Optional("expected_modified"): vol.Any(float, int, None),
        vol.Optional("force", default=False): bool,
    }
)
@websocket_api.async_response
async def websocket_write_file(hass, connection, msg):
    """Handle writing a file's contents."""
    expected_modified = None if msg["force"] else msg.get("expected_modified")
    try:
        new_mtime = await hass.async_add_executor_job(
            file_util.write_file,
            _config_root(hass),
            msg["path"],
            msg["content"],
            expected_modified,
        )
    except Exception as err:  # pylint: disable=broad-except
        _send_file_error(connection, msg["id"], err)
        return

    result = {"path": msg["path"], "modified": new_mtime}

    if msg["path"].lower().endswith((".yaml", ".yml")):
        try:
            yaml.safe_load(msg["content"])
            result["yaml_valid"] = True
        except yaml.YAMLError as err:
            result["yaml_valid"] = False
            result["yaml_error"] = str(err)

    connection.send_result(msg["id"], result)


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/create",
        vol.Required("path"): str,
        vol.Optional("is_dir", default=False): bool,
    }
)
@websocket_api.async_response
async def websocket_create(hass, connection, msg):
    """Handle creating a new empty file or directory."""
    try:
        await hass.async_add_executor_job(
            file_util.create, _config_root(hass), msg["path"], msg["is_dir"]
        )
    except Exception as err:  # pylint: disable=broad-except
        _send_file_error(connection, msg["id"], err)
        return

    connection.send_result(msg["id"], {"path": msg["path"]})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/delete",
        vol.Required("path"): str,
        vol.Optional("recursive", default=False): bool,
    }
)
@websocket_api.async_response
async def websocket_delete(hass, connection, msg):
    """Handle deleting a file or directory."""
    try:
        await hass.async_add_executor_job(
            file_util.delete, _config_root(hass), msg["path"], msg["recursive"]
        )
    except Exception as err:  # pylint: disable=broad-except
        _send_file_error(connection, msg["id"], err)
        return

    connection.send_result(msg["id"], {"path": msg["path"]})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/rename",
        vol.Required("path"): str,
        vol.Required("new_path"): str,
    }
)
@websocket_api.async_response
async def websocket_rename(hass, connection, msg):
    """Handle renaming/moving a file or directory."""
    try:
        new_path = await hass.async_add_executor_job(
            file_util.rename, _config_root(hass), msg["path"], msg["new_path"]
        )
    except Exception as err:  # pylint: disable=broad-except
        _send_file_error(connection, msg["id"], err)
        return

    connection.send_result(msg["id"], {"path": new_path})
