"""add_pgvector

Revision ID: eafbf2214fc6
Revises: 5ebfa663aede
Create Date: 2026-06-06 18:10:50.437252

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from lore.db_models import LORE_EMBEDDING_DIM


# revision identifiers, used by Alembic.
revision: str = 'eafbf2214fc6'
down_revision: Union[str, Sequence[str], None] = '5ebfa663aede'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema - Bật pgvector và đổi kiểu dữ liệu sang vector(dim) kết hợp HNSW index."""
    # 1. Thử kích hoạt extension vector, nếu lỗi phân quyền thì hướng dẫn user bật thủ công
    try:
        op.execute("CREATE EXTENSION IF NOT EXISTS vector;")
    except Exception as e:
        print("=" * 80)
        print("CẢNH BÁO: Không thể tự động kích hoạt extension 'vector' trên database.")
        print("Chi tiết lỗi:", str(e))
        print("Vui lòng truy cập Supabase Dashboard -> Database -> Extensions và kích hoạt 'vector' trước.")
        print("=" * 80)
        raise RuntimeError(
            "Cần kích hoạt extension 'vector' trên database trước khi chạy migration này. "
            "Hướng dẫn: Truy cập Supabase Dashboard -> Database -> Extensions -> Tìm và bật extension 'vector'."
        ) from e

    # 2. Thay đổi kiểu dữ liệu cột embedding trong bảng lore_chunk sang vector(dim)
    op.execute(
        f'ALTER TABLE "lore_chunk" ALTER COLUMN "embedding" TYPE vector({LORE_EMBEDDING_DIM}) '
        f'USING "embedding"::real[]::vector({LORE_EMBEDDING_DIM});'
    )

    # 3. Tạo chỉ mục HNSW cho tìm kiếm cosine tương thích pgvector
    # Sử dụng IF NOT EXISTS để đảm bảo tính idempotent
    op.execute(
        'CREATE INDEX IF NOT EXISTS "ix_lore_chunk_embedding_hnsw" '
        'ON "lore_chunk" USING hnsw ("embedding" vector_cosine_ops);'
    )


def downgrade() -> None:
    """Downgrade schema - Xóa index HNSW và chuyển kiểu dữ liệu về double precision[]."""
    # 1. Xóa index HNSW
    op.execute('DROP INDEX IF EXISTS "ix_lore_chunk_embedding_hnsw";')

    # 2. Đổi kiểu dữ liệu về double precision[]
    op.execute(
        'ALTER TABLE "lore_chunk" ALTER COLUMN "embedding" TYPE double precision[] '
        'USING "embedding"::double precision[];'
    )
