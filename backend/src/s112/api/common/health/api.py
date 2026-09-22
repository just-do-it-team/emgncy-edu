from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.dependencies import get_write_session
from s112.api.schemas import HealthResponse


router = APIRouter(tags=["common/health"])


@router.get("/health", response_model=HealthResponse)
async def health(session: AsyncSession = Depends(get_write_session)) -> HealthResponse:
    await session.execute(text("SELECT 1"))
    return HealthResponse(status="ok", service="card-api")
