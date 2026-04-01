"""GET /api/v1/audit-logs — Paginated audit log listing for PCPs."""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_pcp
from app.db import get_db
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.audit import AuditLogEntryResponse, AuditLogPageResponse

logger = logging.getLogger(__name__)

router = APIRouter()


def _parse_target_resource(target: str) -> tuple[str, str]:
    """Split 'type:id' into (resource_type, resource_id)."""
    if ":" in target:
        parts = target.split(":", 1)
        return parts[0].capitalize(), parts[1]
    return "Unknown", target


@router.get("/audit-logs", response_model=AuditLogPageResponse)
async def list_audit_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user_id: str | None = Query(None),
    action: str | None = Query(None),
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    current_user: User = Depends(require_pcp),
    db: AsyncSession = Depends(get_db),
) -> AuditLogPageResponse:
    # Base query — join with User to get full_name
    base = select(AuditLog, User.full_name).join(
        User, AuditLog.user_id == User.user_id
    )

    # Filters
    if user_id:
        try:
            base = base.where(AuditLog.user_id == int(user_id))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid user_id")

    if action:
        base = base.where(AuditLog.action.ilike(f"%{action}%"))

    if from_date:
        try:
            dt = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
            base = base.where(AuditLog.timestamp >= dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid 'from' date format")

    if to_date:
        try:
            dt = datetime.fromisoformat(to_date.replace("Z", "+00:00"))
            base = base.where(AuditLog.timestamp <= dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid 'to' date format")

    # Total count
    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # Paginated results
    offset = (page - 1) * limit
    rows = (
        await db.execute(
            base.order_by(AuditLog.timestamp.desc()).offset(offset).limit(limit)
        )
    ).all()

    entries = []
    for row in rows:
        log: AuditLog = row[0]
        full_name: str = row[1]
        resource_type, resource_id = _parse_target_resource(log.target_resource)
        entries.append(
            AuditLogEntryResponse(
                log_id=str(log.log_id),
                timestamp=log.timestamp.isoformat(),
                user_id=str(log.user_id),
                user_name=full_name,
                action=log.action,
                resource_type=resource_type,
                resource_id=resource_id,
            )
        )

    # Audit this access too
    db.add(
        AuditLog(
            user_id=current_user.user_id,
            action="VIEW_AUDIT_LOGS",
            target_resource="audit_logs:list",
        )
    )
    await db.flush()

    return AuditLogPageResponse(
        entries=entries,
        total=total,
        page=page,
        page_size=limit,
    )
