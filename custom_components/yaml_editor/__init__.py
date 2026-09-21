"""The YAML Config Editor integration.

Adds a sidebar panel for browsing and editing text/YAML files under
Home Assistant's /config directory, from the web UI and the mobile
companion app (which simply embeds the same frontend).
"""
from __future__ import annotations

import os

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from . import websocket_api
from .const import (
    DOMAIN,
    FRONTEND_STATIC_PATH,
    PANEL_CUSTOM_ELEMENT,
    PANEL_ICON,
    PANEL_JS_VERSION,
    PANEL_MODULE_FILE,
    PANEL_TITLE,
    PANEL_URL_PATH,
)

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up YAML Config Editor from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    if not hass.data[DOMAIN].get("panel_registered"):
        frontend_dir = os.path.join(os.path.dirname(__file__), "frontend")

        await hass.http.async_register_static_paths(
            [
                StaticPathConfig(
                    FRONTEND_STATIC_PATH, frontend_dir, cache_headers=True
                )
            ]
        )

        websocket_api.async_setup(hass)

        await panel_custom.async_register_panel(
            hass,
            frontend_url_path=PANEL_URL_PATH,
            webcomponent_name=PANEL_CUSTOM_ELEMENT,
            sidebar_title=PANEL_TITLE,
            sidebar_icon=PANEL_ICON,
            module_url=f"{FRONTEND_STATIC_PATH}/{PANEL_MODULE_FILE}?v={PANEL_JS_VERSION}",
            embed_iframe=False,
            require_admin=True,
        )

        hass.data[DOMAIN]["panel_registered"] = True

    hass.data[DOMAIN][entry.entry_id] = True
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry.

    The panel and websocket commands are process-wide registrations
    without a clean "unregister" API, so we leave them in place if any
    other entry still exists; Home Assistant only allows a single
    instance of this integration anyway.
    """
    hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)

    remaining = [key for key in hass.data.get(DOMAIN, {}) if key != "panel_registered"]
    if not remaining:
        frontend.async_remove_panel(hass, PANEL_URL_PATH)
        hass.data[DOMAIN].pop("panel_registered", None)

    return True
