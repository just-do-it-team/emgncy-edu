"""Compatibility router for the role-neutral Card API."""

from fastapi import APIRouter

from s112.api.common.cards.api import router as cards_router
from s112.api.common.dependencies import (
    application_service,
    raise_http_error,
    record_rejected_card_action,
    record_rejected_service_action,
)
from s112.api.common.health.api import router as health_router
from s112.api.common.reference_data.api import router as reference_data_router


router = APIRouter()
router.include_router(health_router)
router.include_router(reference_data_router)
router.include_router(cards_router)


__all__ = [
    "application_service",
    "raise_http_error",
    "record_rejected_card_action",
    "record_rejected_service_action",
    "router",
]
