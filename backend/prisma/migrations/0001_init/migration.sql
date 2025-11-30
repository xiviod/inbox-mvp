CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT UNIQUE NOT NULL,
  channel TEXT NOT NULL,
  platform_user_id TEXT,
  last_message TEXT,
  last_ts TIMESTAMPTZ,
  assigned_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT REFERENCES conversations(conversation_id),
  message_id TEXT UNIQUE,
  channel TEXT NOT NULL,
  sender TEXT NOT NULL,
  type TEXT,
  text TEXT,
  attachments JSONB,
  metadata JSONB,
  timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conv_channel ON conversations(channel);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id);

