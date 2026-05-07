let io = null;

const isChatDebugEnabled = () => String(process.env.CHAT_DEBUG || '').toLowerCase() === 'true';

const setSocketServer = (socketServer) => {
  io = socketServer;
};

const emitChatUpdate = (event) => {
  if (!io) {
    if (isChatDebugEnabled()) {
      console.log('[CHAT_DEBUG]', 'socket:emit skipped (io not set)', {
        eventType: event?.eventType,
        phone: event?.phone,
        messageId: event?.messageId,
        status: event?.status,
      });
    }
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
