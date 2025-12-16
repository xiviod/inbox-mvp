import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';

const resolveBackendBase = () => {
  const raw = (import.meta.env.VITE_BACKEND_URL || '').trim();
  if (!raw || raw === 'self') {
    return import.meta.env.DEV ? 'http://localhost:4000' : '';
  }
  return raw;
};

const resolveSocketConfig = () => {
  const raw = (import.meta.env.VITE_SOCKET_URL || '').trim();
  if (!raw || raw === 'self') {
    return {
      url: import.meta.env.DEV ? 'http://localhost:4000' : undefined,
      path: undefined
    };
  }
  if (raw.startsWith('/')) {
    return { url: undefined, path: raw };
  }
  return { url: raw, path: undefined };
};

const API_BASE = resolveBackendBase();
const { url: SOCKET_URL, path: SOCKET_PATH } = resolveSocketConfig();
const api = axios.create({ baseURL: API_BASE || undefined });

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
    last_ts: message.timestamp,
    reply_mode: 'ai'
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

  const [aiResponse, setAiResponse] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [inventorySearch, setInventorySearch] = useState('');

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

  const loadOrders = async (conversationId) => {
    if (!conversationId) {
      setOrders([]);
      return;
    }
    const res = await api.get('/api/orders', {
      params: { conversation_id: conversationId }
    });
    setOrders(res.data || []);
  };

  const loadInventory = async (term = '') => {
    const res = await api.get('/api/inventory', {
      params: term ? { search: term } : undefined
    });
    setInventory(res.data || []);
  };

  useEffect(() => {
    loadConversations();
    loadInventory();
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadMessages(selectedId);
      loadOrders(selectedId);
      setAiResponse(null);
    } else {
      setMessages([]);
      setOrders([]);
    }
  }, [selectedId]);

  const selectedRef = useRef(null);

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    const socketOptions = {
      transports: ['websocket'],
      withCredentials: true,
      ...(SOCKET_PATH ? { path: SOCKET_PATH } : {})
    };
    const socket = SOCKET_URL
      ? io(SOCKET_URL, socketOptions)
      : io(socketOptions);
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
    const isTelegram = selectedConversation.channel === 'telegram';
    const recipient = isTelegram
      ? selectedConversation.conversation_id?.split(':')[1]
      : selectedConversation.platform_user_id ||
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

  const handleAskAi = async () => {
    if (!selectedConversation) return;
    const lastUserMessage = [...messages]
      .reverse()
      .find((message) => message.sender === 'user');

    setAiLoading(true);
    try {
      const res = await api.post('/api/ai/assist', {
        conversation_id: selectedConversation.conversation_id,
        channel: selectedConversation.channel,
        language: lastUserMessage?.metadata?.language || 'auto',
        message_text:
          lastUserMessage?.text ||
          messages[messages.length - 1]?.text ||
          'Hello',
        history: messages.slice(-10)
      });
      setAiResponse(res.data);
    } catch (error) {
      alert(
        error.response?.data?.error ||
          'AI assistant unavailable. Check backend logs.'
      );
    } finally {
      setAiLoading(false);
    }
  };

  const handleSendAiReply = async () => {
    if (!selectedConversation) return;
    const replyText = aiResponse?.reply_text;
    if (!replyText) return;
    const isTelegram = selectedConversation.channel === 'telegram';
    const recipient = isTelegram
      ? selectedConversation.conversation_id?.split(':')[1]
      : selectedConversation.platform_user_id ||
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
        text: String(replyText).trim(),
        origin: 'ai'
      });
      setAiResponse(null);
    } catch (error) {
      alert(
        error.response?.data?.error ||
          'Unable to send AI reply. Check backend logs.'
      );
    } finally {
      setSending(false);
    }
  };

  const setReplyMode = async (mode) => {
    if (!selectedConversation) return;
    const conversationId = selectedConversation.conversation_id;
    const nextMode = mode === 'manual' ? 'manual' : 'ai';
    setConversations((prev) =>
      prev.map((c) =>
        c.conversation_id === conversationId ? { ...c, reply_mode: nextMode } : c
      )
    );
    try {
      await api.patch(`/api/conversations/${conversationId}`, {
        reply_mode: nextMode
      });
    } catch (error) {
      // revert on failure
      await loadConversations();
      alert(
        error.response?.data?.error ||
          'Unable to change reply mode. Check backend logs.'
      );
    }
  };

  const handleInventorySubmit = async (event) => {
    event.preventDefault();
    await loadInventory(inventorySearch);
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
              <small>
                {conversation.last_message || 'Waiting for first message'}
              </small>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <h3 style={{ margin: 0 }}>
                    {selectedConversation.platform_user_id || 'Unknown user'}
                  </h3>
                  <small>
                    {selectedConversation.channel} · Last updated{' '}
                    {formatTimestamp(selectedConversation.last_ts)}
                  </small>
                </div>
                <div className="reply-mode">
                  <button
                    type="button"
                    className={
                      (selectedConversation.reply_mode || 'ai') === 'ai'
                        ? 'mode active'
                        : 'mode'
                    }
                    onClick={() => setReplyMode('ai')}
                    title="AI replies automatically to incoming messages"
                  >
                    AI
                  </button>
                  <button
                    type="button"
                    className={
                      (selectedConversation.reply_mode || 'ai') === 'manual'
                        ? 'mode active'
                        : 'mode'
                    }
                    onClick={() => setReplyMode('manual')}
                    title="You reply manually (AI won’t auto-send)"
                  >
                    Me
                  </button>
                </div>
              </div>
            </div>
            <div className="messages-scroll">
              {messages.map((message) => (
                <div
                  key={`${message.message_id || message.id}`}
                  className={`bubble ${message.sender}`}
                >
                  <small>
                    {(message.sender === 'agent'
                      ? message.metadata?.origin === 'ai'
                        ? 'AI'
                        : 'ME'
                      : message.sender.toUpperCase())}{' '}
                    ·{' '}
                    {formatTimestamp(message.timestamp || message.created_at)}
                  </small>
                  <div>{message.text || `[${message.type}]`}</div>
                  {message.attachments?.map((attachment, index) => (
                    <div key={`${attachment.url || attachment.obsKey || index}`}>
                      <a
                        href={
                          attachment.signed_url ||
                          attachment.url ||
                          attachment.obsKey
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
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
      <aside className="insights-pane">
        <div className="ai-card">
          <div className="ai-card-header">
            <h3>AI Copilot</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="primary"
                onClick={handleAskAi}
                disabled={!selectedConversation || aiLoading}
              >
                {aiLoading ? 'Thinking…' : 'Run assist'}
              </button>
              <button
                type="button"
                onClick={handleSendAiReply}
                disabled={!aiResponse?.reply_text || sending}
                title="Send the drafted AI reply to the customer"
              >
                Send
              </button>
            </div>
          </div>
          {aiResponse ? (
            <>
              <p className="ai-text">{aiResponse.reply_text}</p>
              {Array.isArray(aiResponse.suggested_products) &&
                aiResponse.suggested_products.length > 0 && (
                  <div className="ai-section">
                    <h4>Suggested items</h4>
                    <ul>
                      {aiResponse.suggested_products.map((item, idx) => (
                        <li key={`${item.sku || idx}`}>
                          <strong>{item.name || item.sku}</strong>
                          {item.price && (
                            <span>
                              {' '}
                              · {item.price} {item.currency || ''}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              {aiResponse.actions && (
                <p className="ai-metadata">
                  Actions: {aiResponse.actions.join(', ')}
                </p>
              )}
            </>
          ) : (
            <p className="ai-placeholder">
              Trigger the copilot to draft a response, recommend upsells, or
              create orders automatically.
            </p>
          )}
        </div>

        <div className="ai-card">
          <h3>Orders</h3>
          {orders.length === 0 ? (
            <p className="ai-placeholder">No orders yet for this conversation.</p>
          ) : (
            <ul className="list">
              {orders.map((order) => (
                <li key={order.id}>
                  <div className="list-title">
                    #{order.order_number} · {order.status}
                  </div>
                  <div className="list-subtitle">
                    {formatTimestamp(order.created_at)} ·{' '}
                    {order.total?.toString()} {order.currency || ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="ai-card">
          <h3>Inventory</h3>
          <form className="inventory-search" onSubmit={handleInventorySubmit}>
            <input
              value={inventorySearch}
              onChange={(event) => setInventorySearch(event.target.value)}
              placeholder="Search SKU or name"
            />
            <button type="submit">Search</button>
          </form>
          {inventory.length === 0 ? (
            <p className="ai-placeholder">
              No inventory items found. Seed TaurusDB to preview items.
            </p>
          ) : (
            <ul className="list">
              {inventory.slice(0, 8).map((item) => (
                <li key={item.id}>
                  <div className="list-title">
                    {item.name} ({item.sku})
                  </div>
                  <div className="list-subtitle">
                    {item.price} {item.currency} · Stock {item.stock}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
};

export default Inbox;

