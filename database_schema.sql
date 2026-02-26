-- Drop index trước (nếu tồn tại)
DROP INDEX IF EXISTS idx_projects_user_id;

-- Drop bảng con trước (vì có foreign key)
DROP TABLE IF EXISTS projects CASCADE;

-- Drop bảng cha sau
DROP TABLE IF EXISTS users CASCADE;

-- Enable extension nếu chưa có
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    is_remember BOOLEAN NOT NULL DEFAULT FALSE, -- Cột mới thêm để quản lý trạng thái Remember Me
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Projects Table
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    prompt TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

-- 3. Index
CREATE INDEX idx_projects_user_id ON projects(user_id);
