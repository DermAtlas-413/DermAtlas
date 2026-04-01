"""POST /api/v1/auth/token — OAuth2 password flow."""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import create_access_token, verify_password
from app.db import get_db
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.auth import TokenResponse

router = APIRouter()


@router.post("/auth/token", response_model=TokenResponse)
async def login(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    # Parse form manually so empty username → 401, missing field → 422.
    # OAuth2PasswordRequestForm rejects empty strings with 422 in Pydantic v2.
    form = await request.form()
    username = form.get("username")
    password = form.get("password")

    if username is None or password is None:
        raise HTTPException(
            status_code=422,
            detail=[{"msg": "username and password are required form fields"}],
        )

    result = await db.execute(select(User).where(User.email == username))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(str(password), user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    token = create_access_token({"sub": str(user.user_id), "role": user.role.value})

    db.add(
        AuditLog(
            user_id=user.user_id,
            action="LOGIN",
            target_resource=f"session:{user.email}",
        )
    )
    await db.flush()

    return TokenResponse(access_token=token)
