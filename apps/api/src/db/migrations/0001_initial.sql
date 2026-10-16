-- Initial schema: identity, RBAC, workflow, audit, and ingestion.
-- NOTE: Postgres RLS (second line of defense) is deferred to the hardening phase;
-- the enforced isolation in B1 is explicit `org_id` scoping in every repository query.

-- ── Identity ──────────────────────────────────────────────────────────
CREATE TABLE organizations (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  is_sample_data boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE role_permissions (
  id text PRIMARY KEY,
  role_id text NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission text NOT NULL,
  UNIQUE (role_id, permission)
);

CREATE TABLE memberships (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id text NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE TABLE sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  csrf_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- ── Sources & documents ───────────────────────────────────────────────
CREATE TABLE sources (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('upload', 'connector')),
  state text NOT NULL DEFAULT 'disconnected' CHECK (state IN ('connected', 'disconnected', 'error')),
  last_sync timestamptz,
  error_summary text,
  is_sample_data boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sources_org_id_idx ON sources (org_id);

CREATE TABLE source_acls (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_id text NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  principal_type text NOT NULL CHECK (principal_type IN ('user', 'role', 'team')),
  principal_id text NOT NULL,
  permission text NOT NULL CHECK (permission IN ('read', 'write')),
  UNIQUE (source_id, principal_type, principal_id, permission)
);

CREATE INDEX source_acls_source_id_idx ON source_acls (source_id);

CREATE TABLE documents (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_id text NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('approved', 'draft', 'superseded', 'unknown')),
  is_sample_data boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX documents_org_id_idx ON documents (org_id);

CREATE TABLE document_versions (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version integer NOT NULL,
  content_hash text NOT NULL,
  object_key text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version),
  UNIQUE (document_id, content_hash)
);

CREATE INDEX document_versions_document_id_idx ON document_versions (document_id);

-- ── Ingestion ─────────────────────────────────────────────────────────
CREATE TABLE ingestion_jobs (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_id text NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  document_id text REFERENCES documents(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  stage text NOT NULL DEFAULT 'queued',
  progress double precision NOT NULL DEFAULT 0,
  error text,
  is_sample_data boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ingestion_jobs_org_id_idx ON ingestion_jobs (org_id);

CREATE TABLE ingestion_job_events (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_id text NOT NULL REFERENCES ingestion_jobs(id) ON DELETE CASCADE,
  stage text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ingestion_job_events_job_id_idx ON ingestion_job_events (job_id);

-- ── Conversations & assistant ─────────────────────────────────────────
CREATE TABLE conversations (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  scope_project_id text,
  is_sample_data boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX conversations_org_id_idx ON conversations (org_id);

CREATE TABLE messages (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  text text NOT NULL,
  answer_status text CHECK (answer_status IN ('answered', 'partial', 'insufficient_evidence')),
  access_limited boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_conversation_id_idx ON messages (conversation_id);

CREATE TABLE message_evidence (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  message_id text NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('claim', 'citation', 'path', 'subgraph', 'conflict')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX message_evidence_message_id_idx ON message_evidence (message_id);

-- ── Company intelligence ──────────────────────────────────────────────
CREATE TABLE conflicts (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('contradiction', 'outdated', 'superseded')),
  entities jsonb NOT NULL,
  sides jsonb NOT NULL,
  relationship text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'needs_review', 'resolved')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX conflicts_org_id_idx ON conflicts (org_id);

-- ── Actions & approvals ───────────────────────────────────────────────
CREATE TABLE action_proposals (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'executing', 'executed', 'failed', 'rejected')),
  content text,
  rationale text,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_sample_data boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX action_proposals_org_id_idx ON action_proposals (org_id);

CREATE TABLE approvals (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  proposal_id text NOT NULL REFERENCES action_proposals(id) ON DELETE CASCADE,
  actor_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Audit & rate limits ───────────────────────────────────────────────
CREATE TABLE audit_log (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id text,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_org_id_idx ON audit_log (org_id);
CREATE INDEX audit_log_action_idx ON audit_log (action);

CREATE TABLE api_rate_limits (
  id text PRIMARY KEY,
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id text,
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  UNIQUE (org_id, user_id, bucket, window_start)
);

-- ── Seed static roles and permissions ─────────────────────────────────
INSERT INTO roles (id, name) VALUES
  ('role_org_admin', 'org_admin'),
  ('role_manager', 'manager'),
  ('role_contributor', 'contributor'),
  ('role_viewer', 'viewer'),
  ('role_auditor', 'auditor');

INSERT INTO role_permissions (id, role_id, permission) VALUES
  -- org_admin: everything
  ('rp_admin_1', 'role_org_admin', 'admin:users'),
  ('rp_admin_2', 'role_org_admin', 'admin:roles'),
  ('rp_admin_3', 'role_org_admin', 'admin:sources'),
  ('rp_admin_4', 'role_org_admin', 'admin:organization'),
  ('rp_admin_5', 'role_org_admin', 'admin:audit'),
  ('rp_admin_6', 'role_org_admin', 'sources:read'),
  ('rp_admin_7', 'role_org_admin', 'sources:write'),
  ('rp_admin_8', 'role_org_admin', 'sources:upload'),
  ('rp_admin_9', 'role_org_admin', 'documents:read'),
  ('rp_admin_10', 'role_org_admin', 'proposals:create'),
  ('rp_admin_11', 'role_org_admin', 'actions:approve'),
  ('rp_admin_12', 'role_org_admin', 'conflicts:resolve'),
  ('rp_admin_13', 'role_org_admin', 'audit:read'),
  ('rp_admin_14', 'role_org_admin', 'demo:load'),
  -- manager
  ('rp_mgr_1', 'role_manager', 'sources:read'),
  ('rp_mgr_2', 'role_manager', 'sources:write'),
  ('rp_mgr_3', 'role_manager', 'sources:upload'),
  ('rp_mgr_4', 'role_manager', 'documents:read'),
  ('rp_mgr_5', 'role_manager', 'proposals:create'),
  ('rp_mgr_6', 'role_manager', 'actions:approve'),
  ('rp_mgr_7', 'role_manager', 'conflicts:resolve'),
  ('rp_mgr_8', 'role_manager', 'audit:read'),
  ('rp_mgr_9', 'role_manager', 'demo:load'),
  -- contributor
  ('rp_ctb_1', 'role_contributor', 'sources:read'),
  ('rp_ctb_2', 'role_contributor', 'sources:write'),
  ('rp_ctb_3', 'role_contributor', 'sources:upload'),
  ('rp_ctb_4', 'role_contributor', 'documents:read'),
  ('rp_ctb_5', 'role_contributor', 'proposals:create'),
  -- viewer
  ('rp_vwr_1', 'role_viewer', 'sources:read'),
  ('rp_vwr_2', 'role_viewer', 'documents:read'),
  -- auditor
  ('rp_aud_1', 'role_auditor', 'audit:read'),
  ('rp_aud_2', 'role_auditor', 'admin:audit'),
  ('rp_aud_3', 'role_auditor', 'documents:read'),
  ('rp_aud_4', 'role_auditor', 'sources:read');
