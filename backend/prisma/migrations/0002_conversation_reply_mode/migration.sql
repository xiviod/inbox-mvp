ALTER TABLE conversations
  ADD COLUMN reply_mode VARCHAR(16) NOT NULL DEFAULT 'ai';

CREATE INDEX idx_conv_reply_mode ON conversations(reply_mode);


