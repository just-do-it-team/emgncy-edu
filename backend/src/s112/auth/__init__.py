"""Shared authentication primitives and the local authentication API."""

from s112.auth.dependencies import (
    get_current_principal,
    require_auth_if_enabled,
    require_roles,
)
from s112.auth.principal import Principal

__all__ = [
    "Principal",
    "get_current_principal",
    "require_auth_if_enabled",
    "require_roles",
]
