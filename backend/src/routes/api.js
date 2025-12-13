const express = require('express');
const { Prisma } = require('@prisma/client');
const adapters = require('../adapters');
const { prisma } = require('../db/client');
const { processUnifiedMessage } = require('../services/messageService');
const { callAssistant } = require('../services/aiService');
const { getSignedUrl } = require('../services/obsService');
const logger = require('../logger');

const router = express.Router();

router.get('/conversations', async (req, res, next) => {
  try {
    const conversations = await prisma.conversation.findMany({
      orderBy: { last_ts: 'desc' },
      take: 50
    });
    res.json(conversations);
  } catch (error) {
    next(error);
  }
});

router.patch('/conversations/:conversationId', async (req, res, next) => {
  try {
    const { reply_mode } = req.body || {};
    const normalized = String(reply_mode || '').toLowerCase();
    if (!['ai', 'manual'].includes(normalized)) {
      return res.status(400).json({ error: "reply_mode must be 'ai' or 'manual'" });
    }

    const conversation = await prisma.conversation.update({
      where: { conversation_id: req.params.conversationId },
      data: { reply_mode: normalized }
    });

    logger.log('conversation_reply_mode_updated', {
      conversation_id: req.params.conversationId,
      reply_mode: normalized
    });

    res.json(conversation);
  } catch (error) {
    next(error);
  }
});

router.get('/conversations/:conversationId/messages', async (req, res, next) => {
  try {
    const messages = await prisma.message.findMany({
      where: { conversation_id: req.params.conversationId },
      orderBy: { created_at: 'asc' },
      take: 200
    });

    const decorated = messages.map((message) => {
      if (Array.isArray(message.attachments)) {
        message.attachments = message.attachments.map((attachment) => {
          if (attachment.obsKey) {
            return {
              ...attachment,
              signed_url: getSignedUrl(attachment.obsKey) || attachment.url
            };
          }
          return attachment;
        });
      }
      return message;
    });

    res.json(decorated);
  } catch (error) {
    next(error);
  }
});

router.post('/send', async (req, res, next) => {
  try {
    const { channel, conversation_id, recipient_id, type = 'text', text, origin } =
      req.body || {};
    if (!channel || !recipient_id || !text) {
      return res
        .status(400)
        .json({ error: 'channel, recipient_id, and text are required' });
    }

    const adapter = adapters[channel];
    if (!adapter?.sendMessage) {
      return res.status(400).json({ error: 'Unsupported channel' });
    }

    logger.log('outbound_attempt', { channel, conversation_id, recipient_id });

    const unifiedMessage = await adapter.sendMessage({
      channel,
      conversation_id,
      recipient_id,
      type,
      text
    });

    if (origin) {
      unifiedMessage.metadata = { ...(unifiedMessage.metadata || {}), origin };
    }

    const io = req.app.get('io');
    const saved = await processUnifiedMessage(unifiedMessage, io);

    logger.log('outbound_success', {
      channel,
      conversation_id,
      message_id: saved?.message_id
    });

    res.json({ status: 'sent', message: saved });
  } catch (error) {
    logger.log('outbound_failed', { error: error.message });
    next(error);
  }
});

router.get('/inventory', async (req, res, next) => {
  try {
    const { search } = req.query;
    const items = await prisma.inventoryItem.findMany({
      take: 100,
      orderBy: { updated_at: 'desc' },
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { sku: { contains: search, mode: 'insensitive' } }
            ]
          }
        : undefined
    });
    res.json(items);
  } catch (error) {
    next(error);
  }
});

router.post('/inventory', async (req, res, next) => {
  try {
    const {
      sku,
      name,
      description,
      price,
      currency = 'EGP',
      stock = 0,
      image_url,
      attributes
    } = req.body || {};

    if (!sku || !name || typeof price === 'undefined') {
      return res.status(400).json({ error: 'sku, name, and price are required' });
    }

    const item = await prisma.inventoryItem.upsert({
      where: { sku },
      update: {
        name,
        description,
        price: new Prisma.Decimal(price),
        currency,
        stock,
        image_url,
        attributes: attributes || undefined
      },
      create: {
        sku,
        name,
        description,
        price: new Prisma.Decimal(price),
        currency,
        stock,
        image_url,
        attributes: attributes || undefined
      }
    });

    res.json(item);
  } catch (error) {
    next(error);
  }
});

router.get('/orders', async (req, res, next) => {
  try {
    const { conversation_id } = req.query;
    const orders = await prisma.order.findMany({
      orderBy: { created_at: 'desc' },
      take: 50,
      where: conversation_id ? { conversation_id } : undefined,
      include: {
        items: {
          include: {
            inventory: true
          }
        }
      }
    });
    res.json(orders);
  } catch (error) {
    next(error);
  }
});

router.post('/orders', async (req, res, next) => {
  try {
    const {
      conversation_id,
      channel,
      customer_name,
      customer_contact,
      currency = 'EGP',
      items = [],
      metadata = {}
    } = req.body || {};

    if (!conversation_id || !items.length) {
      return res
        .status(400)
        .json({ error: 'conversation_id and items are required' });
    }

    const skus = items.map((item) => item.sku);
    const inventoryRecords = await prisma.inventoryItem.findMany({
      where: { sku: { in: skus } }
    });

    if (!inventoryRecords.length) {
      return res.status(400).json({ error: 'No matching inventory records' });
    }

    const summary = items.map((item) => {
      const record = inventoryRecords.find((r) => r.sku === item.sku);
      if (!record) {
        throw new Error(`Inventory SKU ${item.sku} not found`);
      }
      const quantity = Number(item.quantity || 1);
      if (record.stock < quantity) {
        throw new Error(`Inventory for ${item.sku} is insufficient`);
      }
      return {
        inventory: record,
        quantity,
        unitPrice: record.price,
        metadata: item.metadata || {}
      };
    });

    const total = summary.reduce(
      (acc, item) => acc + Number(item.unitPrice) * item.quantity,
      0
    );

    const orderNumber = `ORD-${Date.now().toString(16).toUpperCase()}`;

    const order = await prisma.order.create({
      data: {
        order_number: orderNumber,
        conversation_id,
        channel,
        customer_name,
        customer_contact,
        status: 'pending',
        total: new Prisma.Decimal(total),
        currency,
        metadata,
        items: {
          create: summary.map((item) => ({
            inventory_id: item.inventory.id,
            quantity: item.quantity,
            unit_price: new Prisma.Decimal(item.unitPrice),
            metadata: item.metadata
          }))
        }
      },
      include: {
        items: {
          include: { inventory: true }
        }
      }
    });

    await Promise.all(
      summary.map((item) =>
        prisma.inventoryItem.update({
          where: { id: item.inventory.id },
          data: { stock: { decrement: item.quantity } }
        })
      )
    );

    logger.log('order_created', {
      order_id: order.id,
      order_number,
      conversation_id
    });

    res.json(order);
  } catch (error) {
    logger.log('order_failed', { error: error.message });
    next(error);
  }
});

router.post('/ai/assist', async (req, res, next) => {
  try {
    const payload = {
      conversation_id: req.body.conversation_id,
      channel: req.body.channel,
      language: req.body.language,
      message_text: req.body.message_text,
      history: req.body.history || [],
      metadata: req.body.metadata || {}
    };

    const { data, cached } = await callAssistant(payload);

    if (data?.reply_text) {
      const io = req.app.get('io');
      await processUnifiedMessage(
        {
          channel: payload.channel || 'system',
          platform_user_id: '',
          conversation_id: payload.conversation_id,
          message_id: `ai-${Date.now()}`,
          sender: 'system',
          type: 'ai_assist',
          text: data.reply_text,
          metadata: { ai: data, cached }
        },
        io
      );
    }

    res.json(data);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

