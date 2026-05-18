let io = null;

const isChatDebugEnabled = () => String(process.env.CHAT_DEBUG || '').toLowerCase() === 'true';

const setSocketServer = (socketServer) => {
  io = socketServer;
};

const emitChatUpdate = (event) => {
  console.log('[SOCKET EMIT]', {
    eventType: event?.eventType,
    phone: event?.phone,
    messageId: event?.messageId,
    status: event?.status,
  });

  if (!io) {
    console.log('[SOCKET EMIT SKIPPED]', { reason: 'io not set' });
    return;
  }

  if (isChatDebugEnabled()) {
    console.log('[CHAT_DEBUG]', 'socket:emit chat:update', {
      eventType: event?.eventType,
      phone: event?.phone,
      messageId: event?.messageId,
      status: event?.status,
    });
  }
  io.emit('chat:update', {
    ...event,
    timestamp: event?.timestamp || new Date().toISOString(),
  });
};

module.exports = {
  setSocketServer,
  emitChatUpdate,
};
