"""initial_schema

Revision ID: 5ebfa663aede
Revises: 
Create Date: 2026-06-06 18:09:58.932685

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5ebfa663aede'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema - Baseline: do nothing because tables are already created."""
    pass


def downgrade() -> None:
    """Downgrade schema - Baseline: do nothing."""
    pass
