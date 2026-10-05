/**
 * Migraciones versionadas. Cada entrada se aplica una sola vez (PRAGMA user_version).
 * NUNCA modificar una migración ya publicada: agregar una nueva al final.
 */
const NOW = `(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

export const MIGRATIONS: string[] = [
  /* 1 — esquema inicial */ `
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','supervisor','agent')),
  extra_permissions TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE whatsapp_accounts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('cloud_api','simulator')),
  phone_number TEXT,
  display_name TEXT,
  config_encrypted TEXT,
  webhook_key TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected',
  status_detail TEXT,
  quality_rating TEXT,
  auto_connect INTEGER NOT NULL DEFAULT 1,
  last_connected_at TEXT,
  last_sync_at TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  deleted_at TEXT
);

CREATE TABLE contacts (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  name TEXT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  company TEXT,
  avatar_path TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  consent_status TEXT NOT NULL DEFAULT 'unknown' CHECK (consent_status IN ('unknown','opted_in','opted_out')),
  consent_source TEXT,
  consent_date TEXT,
  blacklisted INTEGER NOT NULL DEFAULT 0,
  blacklist_reason TEXT,
  source TEXT,
  import_batch_id TEXT,
  last_message_at TEXT,
  last_inbound_at TEXT,
  last_outbound_at TEXT,
  last_message_preview TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  updated_at TEXT NOT NULL DEFAULT ${NOW},
  UNIQUE (account_id, phone)
);
CREATE INDEX idx_contacts_account ON contacts(account_id, status);
CREATE INDEX idx_contacts_name ON contacts(account_id, name);
CREATE INDEX idx_contacts_import ON contacts(account_id, import_batch_id);

CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE,
  color TEXT NOT NULL DEFAULT '#22c55e',
  emoji TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  system_key TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  UNIQUE (account_id, name)
);

CREATE TABLE contact_tags (
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  PRIMARY KEY (contact_id, tag_id)
);
CREATE INDEX idx_contact_tags_tag ON contact_tags(tag_id);

CREATE TABLE custom_fields (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text','number','date','select')),
  options TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  UNIQUE (account_id, key)
);

CREATE TABLE contact_custom_fields (
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  field_id INTEGER NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  value TEXT,
  PRIMARY KEY (contact_id, field_id)
);

CREATE TABLE segments (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  definition TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  updated_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE conversations (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT,
  last_message_preview TEXT,
  last_direction TEXT,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open',
  bot_paused_until TEXT,
  awaiting_reply INTEGER NOT NULL DEFAULT 0,
  last_ooh_reply_at TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  UNIQUE (account_id, contact_id)
);
CREATE INDEX idx_conversations_last ON conversations(account_id, last_message_at DESC);

CREATE TABLE media_library (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('image','video','audio','document','sticker')),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  title TEXT,
  in_library INTEGER NOT NULL DEFAULT 1,
  provider_media_id TEXT,
  provider_media_uploaded_at TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX idx_media_account ON media_library(account_id, in_library, kind);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  type TEXT NOT NULL DEFAULT 'text',
  body TEXT,
  media_id INTEGER REFERENCES media_library(id) ON DELETE SET NULL,
  template_name TEXT,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  provider_message_id TEXT,
  reply_to_provider_id TEXT,
  error_code TEXT,
  error_message TEXT,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  automation_run_id INTEGER,
  sent_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  sent_at TEXT,
  delivered_at TEXT,
  read_at TEXT,
  failed_at TEXT
);
CREATE INDEX idx_messages_conv ON messages(conversation_id, id);
CREATE UNIQUE INDEX idx_messages_provider ON messages(account_id, provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX idx_messages_campaign ON messages(campaign_id);
CREATE INDEX idx_messages_created ON messages(account_id, created_at);

CREATE TABLE templates (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Ventas',
  body TEXT NOT NULL,
  media_id INTEGER REFERENCES media_library(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  updated_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE provider_templates (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  language TEXT NOT NULL,
  category TEXT,
  status TEXT NOT NULL,
  body_text TEXT,
  param_count INTEGER NOT NULL DEFAULT 0,
  header_type TEXT,
  raw TEXT,
  synced_at TEXT NOT NULL,
  UNIQUE (account_id, name, language)
);

CREATE TABLE quick_replies (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  shortcut TEXT NOT NULL COLLATE NOCASE,
  body TEXT NOT NULL,
  media_id INTEGER REFERENCES media_library(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  UNIQUE (account_id, shortcut)
);

CREATE TABLE campaigns (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  audience TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','template')),
  body TEXT,
  media_id INTEGER REFERENCES media_library(id) ON DELETE SET NULL,
  provider_template_id INTEGER REFERENCES provider_templates(id) ON DELETE SET NULL,
  template_params TEXT,
  timezone TEXT NOT NULL,
  scheduled_at TEXT,
  recurrence TEXT,
  next_run_at TEXT,
  confirmed_count INTEGER,
  confirmed_at TEXT,
  confirmed_by INTEGER,
  pause_reason TEXT,
  last_error TEXT,
  run_count INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  updated_at TEXT NOT NULL DEFAULT ${NOW},
  started_at TEXT,
  completed_at TEXT
);
CREATE INDEX idx_campaigns_due ON campaigns(status, next_run_at);

CREATE TABLE campaign_runs (
  id INTEGER PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  run_number INTEGER NOT NULL,
  scheduled_for TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  total INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (campaign_id, run_number)
);

CREATE TABLE campaign_recipients (
  id INTEGER PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  run_id INTEGER NOT NULL REFERENCES campaign_runs(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  skip_reason TEXT,
  queue_id INTEGER,
  message_id INTEGER,
  replied_at TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  UNIQUE (run_id, contact_id)
);
CREATE INDEX idx_recipients_campaign ON campaign_recipients(campaign_id, status);
CREATE INDEX idx_recipients_contact ON campaign_recipients(contact_id);

CREATE TABLE message_queue (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
  run_id INTEGER REFERENCES campaign_runs(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('text','media','template')),
  content TEXT,
  media_id INTEGER REFERENCES media_library(id) ON DELETE SET NULL,
  payload TEXT,
  source TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  scheduled_at TEXT NOT NULL,
  next_attempt_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  last_error TEXT,
  last_error_code TEXT,
  locked_at TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  updated_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX idx_queue_pick ON message_queue(account_id, status, next_attempt_at, priority);
CREATE INDEX idx_queue_campaign ON message_queue(campaign_id, status);

CREATE TABLE scheduled_messages (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  body TEXT,
  media_id INTEGER REFERENCES media_library(id) ON DELETE SET NULL,
  scheduled_at TEXT NOT NULL,
  timezone TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','queued','cancelled','failed')),
  queue_id INTEGER,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX idx_sched_due ON scheduled_messages(status, scheduled_at);

CREATE TABLE automations (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  trigger_type TEXT NOT NULL,
  run_count INTEGER NOT NULL DEFAULT 0,
  last_run_at TEXT,
  last_fired_slot TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  updated_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE automation_nodes (
  id INTEGER PRIMARY KEY,
  automation_id INTEGER NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  node_key TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('trigger','condition','action')),
  subtype TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  position_x REAL NOT NULL DEFAULT 0,
  position_y REAL NOT NULL DEFAULT 0,
  UNIQUE (automation_id, node_key)
);

CREATE TABLE automation_edges (
  id INTEGER PRIMARY KEY,
  automation_id INTEGER NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  edge_key TEXT NOT NULL,
  source_key TEXT NOT NULL,
  target_key TEXT NOT NULL,
  source_handle TEXT
);

CREATE TABLE automation_runs (
  id INTEGER PRIMARY KEY,
  automation_id INTEGER NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('running','waiting','completed','failed','cancelled','skipped')),
  trigger_event TEXT,
  context TEXT,
  current_node_key TEXT,
  resume_at TEXT,
  depth INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX idx_runs_waiting ON automation_runs(status, resume_at);
CREATE INDEX idx_runs_contact ON automation_runs(automation_id, contact_id, started_at);

CREATE TABLE automation_logs (
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES automation_runs(id) ON DELETE CASCADE,
  node_key TEXT,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX idx_autologs_run ON automation_logs(run_id);

CREATE TABLE ai_assistants (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  instructions TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  model TEXT,
  only_business_hours INTEGER NOT NULL DEFAULT 0,
  allowed_tag_ids TEXT,
  excluded_tag_ids TEXT,
  scope TEXT NOT NULL DEFAULT 'all' CHECK (scope IN ('all','unassigned','tagged')),
  knowledge_base_ids TEXT,
  max_replies_per_hour INTEGER NOT NULL DEFAULT 6,
  handoff_tag_id INTEGER,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  updated_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE knowledge_bases (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE knowledge_documents (
  id INTEGER PRIMARY KEY,
  knowledge_base_id INTEGER NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('pdf','txt','docx','faq','text','md')),
  file_name TEXT,
  content TEXT NOT NULL,
  char_count INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE knowledge_chunks (
  id INTEGER PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  knowledge_base_id INTEGER NOT NULL,
  ordinal INTEGER NOT NULL,
  content TEXT NOT NULL
);
CREATE VIRTUAL TABLE knowledge_fts USING fts5(content, content='knowledge_chunks', content_rowid='id', tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER knowledge_chunks_ai AFTER INSERT ON knowledge_chunks BEGIN
  INSERT INTO knowledge_fts(rowid, content) VALUES (new.id, new.content);
END;
CREATE TRIGGER knowledge_chunks_ad AFTER DELETE ON knowledge_chunks BEGIN
  INSERT INTO knowledge_fts(knowledge_fts, rowid, content) VALUES ('delete', old.id, old.content);
END;

CREATE TABLE notes (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX idx_notes_contact ON notes(contact_id);

CREATE TABLE tasks (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','cancelled')),
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by INTEGER,
  source TEXT NOT NULL DEFAULT 'manual',
  notified_at TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW},
  completed_at TEXT
);
CREATE INDEX idx_tasks_due ON tasks(account_id, status, due_at);

CREATE TABLE pipelines (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES whatsapp_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE pipeline_stages (
  id INTEGER PRIMARY KEY,
  pipeline_id INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  position INTEGER NOT NULL
);

CREATE TABLE contact_pipeline (
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  pipeline_id INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  stage_id INTEGER NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT ${NOW},
  PRIMARY KEY (contact_id, pipeline_id)
);

CREATE TABLE contact_events (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  details TEXT,
  user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX idx_contact_events ON contact_events(contact_id, id);

CREATE TABLE settings (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT ${NOW},
  PRIMARY KEY (scope, key)
);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY,
  account_id INTEGER,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT ${NOW}
);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

CREATE TABLE send_counters (
  account_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, day)
);
`,
];
