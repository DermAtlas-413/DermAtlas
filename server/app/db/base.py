"""
Declarative base for all ORM models.

Usage:
    from app.db.base import Base

    class MyModel(Base):
        __tablename__ = "my_table"
        ...

Alembic uses Base.metadata for autogenerate (see alembic/env.py).
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
