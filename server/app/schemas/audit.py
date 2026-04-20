"""Audit log request/response schemas."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class AuditLogEntryResponse(BaseModel):
    log_id: str
    timestamp: str
    user_id: str
    user_name: str
    action: str
    resource_type: str
    resource_id: str
    ip_address: Optional[str] = None
    status: str = "success"


class AuditLogPageResponse(BaseModel):
    entries: List[AuditLogEntryResponse]
    total: int
    page: int
    page_size: int
