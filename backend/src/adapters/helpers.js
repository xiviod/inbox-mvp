function buildConversationId(channel, platformUserId, fallback) {
  if (fallback) return fallback;
  return `${channel}:${platformUserId}`;
}

function toCanonicalMessage({
  channel,
  platform_user_id,
  conversation_id,
  message_id,
  sender,
  type = 'unknown',
  text = null,
  attachments = [],
  metadata = {},
  timestamp = new Date().toISOString()
}) {
  const resolvedConversationId = buildConversationId(
    channel,
    platform_user_id,
    conversation_id
  );

  return {
    channel,
    platform_user_id,
    conversation_id: resolvedConversationId,
    message_id,
    sender,
    type,
    text,
    attachments,
    metadata,
    timestamp
  };
}

module.exports = {
  toCanonicalMessage,
  buildConversationId
};

