import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';
const API_BASE = import.meta.env.VITE_BACKEND_URL || '';
const api = axios.create({ baseURL: API_BASE });

const formatPreview = (message) =>
  message?.text || `[${message?.type || 'event'}]`;

const formatTimestamp = (ts) =>
  ts ? new Date(ts).toLocaleString() : 'Just now';

const mergeConversation = (pending, message) => {
  const preview = formatPreview(message);
  const next = [...pending];
  const idx = next.findIndex(
    (item) => item.conversation_id === message.conversation_id
  );
  const base = {
    conversation_id: message.conversation_id,
    channel: message.channel,
    platform_user_id: message.platform_user_id,
    last_message: preview,
    last_ts: message.timestamp
  };
  if (idx >= 0) {
    next[idx] = { ...next[idx], ...base };
    return [next[idx], ...next.filter((_, index) => index !== idx)];
  }
  return [base, ...next];
};

const Inbox = () => {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [socketStatus, setSocketStatus] = useState('disconnected');

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.conversation_id === selectedId),
    [conversations, selectedId]
  );

  const loadConversations = async () => {
    const res = await api.get('/api/conversations');
    setConversations(res.data || []);
    if (!selectedId && res.data?.length) {
      setSelectedId(res.data[0].conversation_id);
    }
  };

  const loadMessages = async (conversationId) => {
    if (!conversationId) return;
    const res = await api.get(
      `/api/conversations/${conversationId}/messages`
    );
    setMessages(res.data || []);
  };

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadMessages(selectedId);
    } else {
      setMessages([]);
    }
  }, [selectedId]);

  const selectedRef = useRef(null);

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      withCredentials: true
    });
    socket.on('connect', () => setSocketStatus('connected'));
    socket.on('disconnect', () => setSocketStatus('disconnected'));
    socket.on('message.new', (message) => {
      setConversations((pending) => mergeConversation(pending, message));
      if (message.conversation_id === selectedRef.current) {
        setMessages((prev) => [...prev, message]);
      }
    });
    return () => socket.disconnect();
  }, []);

  const handleSend = async (event) => {
    event.preventDefault();
    if (!draft.trim() || !selectedConversation) return;
    const recipient =
      selectedConversation.platform_user_id ||
      selectedConversation.conversation_id?.split(':')[1];
    if (!recipient) {
      alert('Conversation is missing platform_user_id; cannot send.');
      return;
    }

    setSending(true);
    try {
      await api.post('/api/send', {
        channel: selectedConversation.channel,
        conversation_id: selectedConversation.conversation_id,
        recipient_id: recipient,
        type: 'text',
        text: draft.trim()
      });
      setDraft('');
    } catch (error) {
      alert(
        error.response?.data?.error ||
          'Unable to send message. Check backend logs.'
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h2>
          Conversations{' '}
          <small style={{ fontSize: 12 }}>
            Socket: {socketStatus.toUpperCase()}
          </small>
        </h2>
        <ul className="conversation-list">
          {conversations.map((conversation) => (
            <li
              key={conversation.conversation_id}
              className={`conversation-item ${
                conversation.conversation_id === selectedId ? 'active' : ''
              }`}
              onClick={() => setSelectedId(conversation.conversation_id)}
            >
              <strong>{conversation.platform_user_id || 'Unknown user'}</strong>
              <small>{conversation.channel}</small>
              <small>{conversation.last_message || 'Waiting for first message'}</small>
            </li>
          ))}
          {conversations.length === 0 && (
            <div className="empty-state">
              No conversations yet. Fire a webhook to get started.
            </div>
          )}
        </ul>
      </aside>
      <main className="messages-pane">
        {selectedConversation ? (
          <>
            <div className="messages-header">
              <h3 style={{ margin: 0 }}>
                {selectedConversation.platform_user_id || 'Unknown user'}
              </h3>
              <small>
                {selectedConversation.channel} · Last updated{' '}
                {formatTimestamp(selectedConversation.last_ts)}
              </small>
            </div>
            <div className="messages-scroll">
              {messages.map((message) => (
                <div
                  key={`${message.message_id || message.id}`}
                  className={`bubble ${message.sender}`}
                >
                  <small>
                    {message.sender.toUpperCase()} ·{' '}
                    {formatTimestamp(message.timestamp || message.created_at)}
                  </small>
                  <div>{message.text || `[${message.type}]`}</div>
                  {message.attachments?.map((attachment) => (
                    <div key={attachment.url}>
                      <a href={attachment.url} target="_blank" rel="noreferrer">
                        {attachment.type} attachment
                      </a>
                    </div>
                  ))}
                </div>
              ))}
              {messages.length === 0 && (
                <div className="empty-state">
                  No messages yet. Select another conversation or wait for a
                  webhook.
                </div>
              )}
            </div>
            <form className="composer" onSubmit={handleSend}>
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Type a reply..."
                disabled={sending}
              />
              <button type="submit" disabled={sending}>
                {sending ? 'Sending...' : 'Send'}
              </button>
            </form>
          </>
        ) : (
          <div className="empty-state">Select a conversation to begin.</div>
        )}
      </main>
    </div>
  );
};

export default Inbox;

