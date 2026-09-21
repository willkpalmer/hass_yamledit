"""Config flow for the YAML Config Editor integration."""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow
from homeassistant.data_entry_flow import FlowResult

from .const import DOMAIN, PANEL_TITLE


class YamlEditorConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle a config flow for YAML Config Editor."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Confirm setup. There is nothing to configure - this integration
        just adds a sidebar panel for browsing/editing files in /config.
        """
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            return self.async_create_entry(title=PANEL_TITLE, data={})

        return self.async_show_form(step_id="user", data_schema=vol.Schema({}))
