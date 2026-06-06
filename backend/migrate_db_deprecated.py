import os
from dotenv import load_dotenv
from pathlib import Path
from sqlalchemy import text
from database import engine, Base
import models
import lore.db_models  # Registers all lore canon tables

def run_migration_original():
    dotenv_path = Path(__file__).resolve().parent / ".env"
    load_dotenv(dotenv_path=dotenv_path)

    print("Connecting to database...")
    
    with engine.begin() as conn:
        print("Querying existing tables in 'public' schema...")
        result = conn.execute(text("""
            SELECT tablename 
            FROM pg_tables 
            WHERE schemaname = 'public';
        """))
        tables = [row[0] for row in result.fetchall()]
        
        if tables:
            print(f"Dropping {len(tables)} tables with CASCADE: {tables}")
            for table in tables:
                print(f"Dropping table '{table}'...")
                conn.execute(text(f'DROP TABLE IF EXISTS "{table}" CASCADE;'))
        else:
            print("No tables found in the database.")
            
    print("Recreating all tables from database_schema.sql...")
    schema_path = Path(__file__).resolve().parent.parent / "database_schema.sql"
    with open(schema_path, "r", encoding="utf-8") as f:
        sql_content = f.read()
        
    with engine.begin() as conn:
        conn.execute(text(sql_content))
    
    print("Database schema dropped and recreated successfully from database_schema.sql!")
