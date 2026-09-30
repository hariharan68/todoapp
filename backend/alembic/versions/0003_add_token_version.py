"""add token_version to users for server-side token revocation

Revision ID: 0003_token_version
Revises: 0002_focus
Create Date: 2026-09-30 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003_token_version"
down_revision: Union[str, None] = "0002_focus"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default backfills existing rows to 0. Tokens issued before this
    # migration carry no `ver` claim and are rejected, so every user signs in
    # once more after the deploy.
    op.add_column(
        "users",
        sa.Column(
            "token_version",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "token_version")
