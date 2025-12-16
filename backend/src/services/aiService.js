const axios = require('axios');
const config = require('../config');
const cache = require('./cacheService');
const logger = require('../logger');
const crypto = require('crypto');

function buildCacheKey(conversationId, hashable) {
  return `ai:${conversationId}:${Buffer.from(hashable).toString('base64')}`;
}

function withVersion(url, version) {
  if (!version) return url;
  if (/[?&]version=/.test(url)) return url;
  const hasQuery = url.includes('?');
  return `${url}${hasQuery ? '&' : '?'}version=${encodeURIComponent(version)}`;
}

function buildAuthHeaders(token) {
  const raw = String(token || '').trim();
  if (!raw) return {};

  // Explicit bearer string → pass through
  if (/^bearer\s+/i.test(raw)) {
    return { Authorization: raw };
  }

  // Heuristic:
  // - Huawei IAM tokens / cert blobs tend to be very long (often start with "MI...")
  // - Typical API bearer/JWT tokens are shorter and/or dot-separated
  const looksJwt = raw.split('.').length === 3 && raw.length < 2000;
  const looksHuaweiToken = raw.length > 120 || raw.startsWith('MI');

  if (looksHuaweiToken && !looksJwt) {
    return { 'X-Auth-Token': raw };
  }

  return { Authorization: `Bearer ${raw}` };
}

function buildConsoleHeaders() {
  const cookie = String(config.ai.consoleCookie || '').trim();
  const cftk = String(config.ai.consoleCftk || '').trim();
  const invokeMode = String(config.ai.consoleInvokeMode || 'DEBUG').trim();
  const language = String(config.ai.consoleLanguage || 'en-us').trim();

  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (cftk) {
    // Console uses both names in practice.
    headers.cftk = cftk;
    headers['cf2-cftk'] = cftk;
  }
  if (invokeMode) headers['x-invoke-mode'] = invokeMode;
  if (language) headers['x-language'] = language;
  headers.stream = 'true';

  // Match browser headers that the console gateway expects.
  headers.Accept = '*/*';
  headers.Origin = 'https://console-intl.huaweicloud.com';
  headers.Referer = 'https://console-intl.huaweicloud.com/modelartsstudio-agent/';
  headers['Cache-Control'] = 'no-cache';
  headers.Pragma = 'no-cache';
  headers['User-Agent'] =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  return headers;
}

function toDeterministicUuid(input) {
  const hex = crypto.createHash('sha1').update(String(input)).digest('hex'); // 40 chars
  const base = hex.slice(0, 32);
  const chars = base.split('');
  // version 5
  chars[12] = '5';
  // variant 10xx
  const variant = parseInt(chars[16], 16);
  chars[16] = ((variant & 0x3) | 0x8).toString(16);
  const v = chars.join('');
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(
    16,
    20
  )}-${v.slice(20)}`;
}

function parseModelArtsEventStream(raw, options = {}) {
  const text = String(raw || '');
  if (!text.includes('data:{')) return null;

  // Stream format: "data:{...}\n\n" repeated
  const chunks = text.split('\n\n');
  const events = [];
  for (const chunk of chunks) {
    const line = chunk.trim();
    if (!line.startsWith('data:')) continue;
    const payload = line.slice('data:'.length).trim();
    if (!payload) continue;
    try {
      events.push(JSON.parse(payload));
    } catch {
      // ignore bad chunks
    }
  }

  const inputText = String(options.inputText || '').trim();
  const inputTextLower = inputText.toLowerCase();

  const looksLikeEchoOfInput = (candidate) => {
    const t = String(candidate || '').trim();
    if (!t) return false;
    if (!inputTextLower) return false;
    // Many streams emit the user's query back as a "message" event. Skip it.
    return t.toLowerCase() === inputTextLower;
  };

  // Prefer final Message node output, else last node_finished output, else last streamed assistant text.
  let replyText = null;
  let replyTextFromMessageNode = null;
  let replyTextFromAnyNodeFinished = null;
  let replyTextFromAnyMessageEvent = null;

  const pickStringOutput = (outputs) => {
    if (!outputs || typeof outputs !== 'object') return null;
    // Common shapes seen in ModelArts Studio streams.
    const candidates = [
      outputs.result,
      outputs.text,
      outputs.answer,
      outputs.reply,
      outputs.content,
      outputs.output
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim();
    }
    // As last resort: first non-empty string value in outputs.
    for (const v of Object.values(outputs)) {
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
  };

  const isSchemaMessage = (s) => {
    const t = String(s || '').trim();
    if (!t) return false;
    // The workflow sometimes emits an input schema JSON as a message.
    if (t.startsWith('{"inputs":') || t.startsWith('{\"inputs\":')) return true;
    if (t.includes('"actualType"') && t.includes('"sourceType"') && t.includes('"required"'))
      return true;
    return false;
  };

  const isProbablyJsonBlob = (s) => {
    const t = String(s || '').trim();
    if (!t) return false;
    if (!(t.startsWith('{') || t.startsWith('['))) return false;
    // If it parses as JSON and looks like structured metadata, treat as non-reply.
    try {
      const parsed = JSON.parse(t);
      return typeof parsed === 'object';
    } catch {
      return false;
    }
  };

  const safeTrim = (s, max = 4000) => {
    const t = String(s || '').trim();
    if (t.length <= max) return t;
    return `${t.slice(0, max)}…`;
  };

  for (const evt of events) {
    if (evt?.event === 'node_finished') {
      const nodeType = evt?.data?.node_type;
      const candidate = pickStringOutput(evt?.data?.outputs);
      if (candidate) {
        // Prefer the Message node output when available, but keep non-Message as fallback.
        if (isSchemaMessage(candidate) || isProbablyJsonBlob(candidate)) continue;
        if (looksLikeEchoOfInput(candidate)) continue;

        if (nodeType === 'Message') replyTextFromMessageNode = candidate;
        else replyTextFromAnyNodeFinished = candidate;
      }
    }
    if (evt?.event === 'message') {
      const nodeType = evt?.data?.node_type;
      const t = evt?.data?.text;
      if (typeof t !== 'string') continue;
      const trimmed = t.trim();
      if (!trimmed) continue;
      // Ignore schema/metadata messages (console UI hides these).
      if (isSchemaMessage(trimmed)) continue;
      // Ignore structured JSON blobs (not user-facing answer).
      if (isProbablyJsonBlob(trimmed)) continue;
      // Ignore pure echo of the user's input.
      if (looksLikeEchoOfInput(trimmed)) continue;

      // If event provides role/sender, prefer assistant-like messages and ignore user-like ones.
      const role = String(evt?.data?.role || evt?.data?.sender || '').toLowerCase();
      if (role === 'user') continue;

      // If it is a Message node stream, record it with higher priority.
      if (nodeType === 'Message') {
        replyTextFromMessageNode = safeTrim(trimmed);
      } else {
        // Allow other node types as fallback (some workflows stream without node_type).
        replyTextFromAnyMessageEvent = safeTrim(trimmed);
      }
    }
  }

  return {
    reply_text:
      replyTextFromMessageNode ||
      replyTextFromAnyNodeFinished ||
      replyTextFromAnyMessageEvent ||
      replyText,
    stream: true,
    events_count: events.length
  };
}

function normalizeAssistantResponse(data, options = {}) {
  // Already structured
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data;
  }

  // Event stream string → extract reply text
  if (typeof data === 'string') {
    const parsed = parseModelArtsEventStream(data, options);
    if (parsed?.reply_text) {
      return parsed;
    }
    // Fallback: return as-is (caller may log it)
    return { raw: data, reply_text: null };
  }

  return { raw: data, reply_text: null };
}

function buildAssistantUrl({ base, conversationId, version }) {
  const safeBase = String(base || '').trim();
  if (!safeBase) return '';

  const trimmedBase = safeBase.replace(/\/$/, '');

  const isAgentRest = /modelartsstudio-agent\/rest/i.test(trimmedBase);
  // The console workflow runtime can be picky about path params; keep it UUID-like.
  const safeConversationId = isAgentRest
    ? toDeterministicUuid(conversationId || '')
    : String(conversationId || '');

  const encodedConversationId = encodeURIComponent(safeConversationId);

  let url = trimmedBase;

  // Support the ModelArts Studio "Call API" URL template.
  if (url.includes('{conversation_id}')) {
    url = url.replace('{conversation_id}', encodedConversationId);
  } else if (url.endsWith('/conversations')) {
    url = `${url}/${encodedConversationId}`;
  }

  // ModelArts Studio console "agent" REST API carries version in the JSON body, not query string.
  if (/modelartsstudio-agent\/rest/i.test(url)) {
    return url;
  }

  return withVersion(url, version);
}

async function callAssistant(payload) {
  if (!config.ai.endpoint) {
    throw new Error('AI assistant endpoint not configured');
  }
  const isConsoleAgentRest = /console-intl\.huaweicloud\.com\/modelartsstudio-agent\/rest/i.test(
    String(config.ai.endpoint)
  );
  if (!isConsoleAgentRest && !config.ai.token) {
    throw new Error('AI assistant token not configured');
  }
  if (isConsoleAgentRest && !config.ai.consoleCookie) {
    throw new Error(
      'AI console cookie not configured (AI_ASSIST_CONSOLE_COOKIE). Use DevTools → Copy as cURL and copy only the Cookie header value.'
    );
  }

  const conversationId =
    payload?.conversation_id || `conv-${Date.now().toString(36)}`;
  const messageText = payload?.message_text || payload?.query || '';
  const language = payload?.language || 'multi';
  const channel = payload?.channel || 'unknown';

  const cacheKey = buildCacheKey(
    conversationId,
    `${channel}:${language}:${String(messageText)}`
  );

  const cached = await cache.getJSON(cacheKey);
  if (cached) {
    logger.log('ai_cache_hit', { conversation_id: conversationId });
    return { data: cached, cached: true };
  }

  const url = buildAssistantUrl({
    base: config.ai.endpoint,
    conversationId,
    version: config.ai.version || 'latest'
  });

  const isStudioAgentRest = /modelartsstudio-agent\/rest/i.test(config.ai.endpoint);
  const isConsoleGateway = /console-intl\.huaweicloud\.com/i.test(String(config.ai.endpoint));
  const isWorkflowConversationApi =
    /\/workflows\/[^/]+\/conversations/i.test(config.ai.endpoint) ||
    config.ai.endpoint.includes('/conversations');

  const versionNum = Number(config.ai.version);
  const requestBody = isStudioAgentRest
    ? {
        // Matches the console Test Run API shape.
        inputs: { query: String(messageText || '') },
        globals: {},
        plugin_configs: [],
        ...(Number.isFinite(versionNum) ? { version: versionNum } : {})
      }
    : isWorkflowConversationApi
      ? { query: String(messageText || '') }
      : payload;

  const doInvoke = async () =>
    axios.post(url, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        // Some ModelArts Studio endpoints sit behind the console gateway and require cftk/cookies.
        // If the user provides them, include them for both agent-rest and workflow conversation APIs.
        ...((isStudioAgentRest || (isConsoleGateway && (config.ai.consoleCookie || config.ai.consoleCftk)))
          ? buildConsoleHeaders()
          : {}),
        ...(config.ai.stage ? { 'X-Stage': String(config.ai.stage) } : {}),
        ...(isConsoleAgentRest ? {} : buildAuthHeaders(config.ai.token))
      },
      timeout: config.ai.timeoutMs || 120000,
      // Important: keep response as-is; console often returns event-stream text.
      responseType: 'text',
      transformResponse: [(d) => d]
    });

  const summarizeStream = (raw) => {
    try {
      const parsed = parseModelArtsEventStream(raw);
      if (!parsed) return null;
      return {
        events_count: parsed.events_count,
        has_reply_text: Boolean(parsed.reply_text)
      };
    } catch {
      return null;
    }
  };

  try {
    let response;
    try {
      response = await doInvoke();
    } catch (err) {
      // One retry for flaky console streams.
      const msg = String(err?.message || '');
      const code = String(err?.code || '');
      const retryable =
        msg.includes('stream has been aborted') ||
        code === 'ECONNRESET' ||
        code === 'ETIMEDOUT' ||
        code === 'EPIPE';

      if (!retryable) throw err;
      logger.log('ai_invoke_retrying', {
        conversation_id: conversationId,
        error: msg,
        code
      });
      await new Promise((r) => setTimeout(r, 300));
      response = await doInvoke();
    }

    const rawData = response.data;
    // If the console endpoint redirected to login, surface a clearer error.
    if (typeof rawData === 'string' && rawData.includes('authui/login')) {
      const err = new Error('ModelArts Studio console session expired. Refresh cookie/cftk.');
      err.response = { status: 401, data: { error: 'console_login_redirect' } };
      throw err;
    }

    const data = normalizeAssistantResponse(rawData, { inputText: String(messageText || '') });

    // Only cache successful, usable replies. Caching null replies makes flakiness "sticky".
    if (data?.reply_text) {
      await cache.setJSON(cacheKey, data, 120);
    } else {
      logger.log('ai_reply_text_missing', {
        conversation_id: conversationId,
        hint: summarizeStream(rawData) || undefined
      });
    }
    logger.log('ai_invoke_success', {
      conversation_id: conversationId,
      intent: data?.intent,
      confidence: data?.confidence,
      has_reply_text: Boolean(data?.reply_text),
      model_latency: data?.latency?.model
    });
    return { data, cached: false };
  } catch (error) {
    const status = error.response?.status;
    const responsePayload =
      typeof error.response?.data === 'string'
        ? error.response.data.slice(0, 500)
        : error.response?.data;
    logger.log('ai_invoke_failed', {
      conversation_id: conversationId,
      status,
      error: error.message,
      response: responsePayload
    });
    throw error;
  }
}

module.exports = {
  callAssistant
};
