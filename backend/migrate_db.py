import os
import sys

def main():
    print("=" * 60)
    print("CẢNH BÁO NGUY HIỂM: migrate_db.py đã bị DEPRECATED!")
    print("Script này thực hiện lệnh DROP TABLE CASCADE làm mất toàn bộ dữ liệu.")
    print("Không được chạy script này trên môi trường Production hoặc khi có dữ liệu.")
    print("Hãy chuyển sang sử dụng Alembic để di dân database an toàn:")
    print("  alembic upgrade head")
    print("=" * 60)
    
    # Chỉ cho phép chạy nếu có cờ xác nhận rõ ràng ở local dev
    if os.getenv("ENV") == "production":
        print("TỪ CHỐI CHẠY TRÊN PRODUCTION.")
        sys.exit(1)
        
    confirm = input("Bạn có chắc chắn muốn XÓA SẠCH database hiện tại và thiết lập lại? (yes/no): ")
    if confirm.strip().lower() != 'yes':
        print("Đã hủy bỏ lệnh.")
        sys.exit(0)
        
    print("Hãy sử dụng Alembic để đảm bảo tính an toàn dài hạn.")
    # Thực hiện lệnh gốc nếu cần ở local dev và đã đồng ý
    from migrate_db_deprecated import run_migration_original
    run_migration_original()

if __name__ == "__main__":
    main()
