"""add is_focus column to tasks

Revision ID: 0002_focus
Revises: 0001_initial
Create Date: 2026-09-21 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0002_focus"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default (not just the model's Python-side default) so rows inserted
    # outside the ORM -- app/agents/tools.py writes Task directly -- still satisfy
    # the NOT NULL, and so existing rows backfill to false.
    op.add_column(
        "tasks",
        sa.Column(
            "is_focus",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("tasks", "is_focus")
