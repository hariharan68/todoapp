"""add is_focus column to tasks table

Revision ID : 0002_focus
Revise: 0001_initial
Create Date: 2023-09-15 12:00:00.000000
"""

from typing import Sequence , Union 
import sqlalchemy as sa
from alembic import op

#revision identifiers, used by Alembic.
revision: str = "0002_focus"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
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
        op.drop_column("tasks" , "is_focuse")