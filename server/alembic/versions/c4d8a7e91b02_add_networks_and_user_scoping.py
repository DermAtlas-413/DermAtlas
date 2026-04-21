"""add networks table and scope users to a network

Revision ID: c4d8a7e91b02
Revises: b3c9f2a1e507
Create Date: 2026-04-18 00:00:00.000000

Introduces multi-tenancy. Steps:
  1. Create the ``networks`` table.
  2. Insert a "Default Network" row so existing users have somewhere to live.
  3. Add ``network_id`` (nullable) and ``is_admin`` to ``users``.
  4. Backfill every existing user into the default network.
  5. Promote one existing PCP to ``is_admin=true`` (lowest user_id, or the
     user whose email matches DEFAULT_NETWORK_ADMIN_EMAIL env var).
  6. Enforce NOT NULL + FK on ``users.network_id``.
"""
from __future__ import annotations

import os
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "c4d8a7e91b02"
down_revision: Union[str, Sequence[str], None] = "c4d8e3f2a719"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create networks table.
    op.create_table(
        "networks",
        sa.Column("network_id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("network_id"),
    )
    op.create_index(op.f("ix_networks_slug"), "networks", ["slug"], unique=True)

    # 2. Seed a default network for existing users.
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "INSERT INTO networks (name, slug, created_at) "
            "VALUES ('Default Network', 'default', CURRENT_TIMESTAMP)"
        )
    )
    default_id = bind.execute(
        sa.text("SELECT network_id FROM networks WHERE slug = 'default'")
    ).scalar_one()

    # 3. Add columns to users (nullable first so the backfill can run).
    op.add_column("users", sa.Column("network_id", sa.Integer(), nullable=True))
    op.add_column(
        "users",
        sa.Column(
            "is_admin",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )

    # 4. Backfill every existing user into the default network.
    bind.execute(
        sa.text("UPDATE users SET network_id = :nid WHERE network_id IS NULL"),
        {"nid": default_id},
    )

    # 5. Promote one PCP to admin. Prefer the env-var-specified email if set.
    admin_email = os.environ.get("DEFAULT_NETWORK_ADMIN_EMAIL")
    admin_row = None
    if admin_email:
        admin_row = bind.execute(
            sa.text("SELECT user_id FROM users WHERE email = :em AND role = 'PCP'"),
            {"em": admin_email},
        ).first()
    if admin_row is None:
        admin_row = bind.execute(
            sa.text(
                "SELECT user_id FROM users WHERE role = 'PCP' "
                "ORDER BY user_id ASC LIMIT 1"
            )
        ).first()
    if admin_row is not None:
        bind.execute(
            sa.text("UPDATE users SET is_admin = true WHERE user_id = :uid"),
            {"uid": admin_row[0]},
        )

    # 6. Enforce NOT NULL + FK on users.network_id.
    with op.batch_alter_table("users") as batch:
        batch.alter_column("network_id", existing_type=sa.Integer(), nullable=False)
        batch.create_foreign_key(
            "fk_users_network_id",
            "networks",
            ["network_id"],
            ["network_id"],
        )
        batch.create_index("ix_users_network_id", ["network_id"])


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_index("ix_users_network_id")
        batch.drop_constraint("fk_users_network_id", type_="foreignkey")
        batch.drop_column("is_admin")
        batch.drop_column("network_id")

    op.drop_index(op.f("ix_networks_slug"), table_name="networks")
    op.drop_table("networks")
