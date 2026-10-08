/** Migraciones versionadas. Nunca edites una migración aplicada: añade una nueva. */
export const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
        failed_logins INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,               -- SHA-256 del token (el token nunca se guarda)
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        user_agent TEXT,
        ip TEXT
      );
      CREATE INDEX idx_sessions_user ON sessions(user_id);
      CREATE INDEX idx_sessions_expires ON sessions(expires_at);

      CREATE TABLE prompts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
        description TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL,
        project_type TEXT NOT NULL,
        stack TEXT NOT NULL DEFAULT '[]',
        tags TEXT NOT NULL DEFAULT '[]',
        active_variant TEXT NOT NULL DEFAULT 'master' CHECK (active_variant IN ('quick', 'pro', 'master')),
        variants TEXT NOT NULL,
        spec TEXT,
        quality_score INTEGER NOT NULL DEFAULT 0 CHECK (quality_score BETWEEN 0 AND 100),
        favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
        template_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_prompts_user_updated ON prompts(user_id, updated_at DESC);
      CREATE INDEX idx_prompts_user_category ON prompts(user_id, category);
      CREATE INDEX idx_prompts_user_favorite ON prompts(user_id, favorite);

      CREATE TABLE prompt_versions (
        id TEXT PRIMARY KEY,
        prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
        variant TEXT NOT NULL CHECK (variant IN ('quick', 'pro', 'master')),
        content TEXT NOT NULL,
        quality_score INTEGER NOT NULL DEFAULT 0,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_versions_prompt ON prompt_versions(prompt_id, created_at DESC);

      CREATE TABLE user_settings (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE user_templates (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
        description TEXT NOT NULL DEFAULT '',
        project_type TEXT NOT NULL,
        spec TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_user_templates_user ON user_templates(user_id, created_at DESC);

      CREATE TABLE audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        ip TEXT,
        detail TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);
    `,
  },
];
