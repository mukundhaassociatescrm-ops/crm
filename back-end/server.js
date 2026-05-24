require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const { applyEnvironmentMode } = require('./config/appMode');

applyEnvironmentMode(process.env);

const app = require('./app');
const connectDB = require('./config/db');
const { initializeReminders, cleanupAllReminders } = require('./services/reminderService');
const {
  initializeOwnerSessionReminderScheduler,
  stopOwnerSessionReminderScheduler,
} = require('./services/ownerNotificationSessionService');
const { ensureDefaultSuperadmin } = require('./services/superadminService');
const { setSocketServer } = require('./services/socketService');
const {
  initializeCampaignProcessor,
  stopCampaignProcessor,
} = require('./services/whatsappCampaignProcessor');

const PORT = process.env.PORT || 3000;

let server;

const startServer = async () => {
  try {
    await connectDB();
    await ensureDefaultSuperadmin();

    server = http.createServer(app);
    const io = new Server(server, {
      cors: {
        origin: [
          'https://crm.mukundhaassociates.com',
          'http://localhost:4200',
        ],
        methods: ['GET', 'POST'],
        credentials: true,
      },
    });

    setSocketServer(io);

    io.on('connection', (socket) => {
      socket.emit('chat:connected', { success: true, timestamp: new Date().toISOString() });
    });

    server.listen(PORT, async () => {
      console.log('Server running on http://localhost:' + PORT);
      console.log('Swagger docs available at http://localhost:' + PORT + '/api-docs');

      try {
        await initializeReminders();
      } catch (error) {
        console.error('Failed to initialize reminders:', error.message);
      }

      try {
        initializeOwnerSessionReminderScheduler();
      } catch (error) {
        console.error('Failed to initialize owner session reminder scheduler:', error.message);
      }

      try {
        initializeCampaignProcessor();
      } catch (error) {
        console.error('Failed to initialize campaign processor:', error.message);
      }
    });
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  cleanupAllReminders();
  stopOwnerSessionReminderScheduler();
  stopCampaignProcessor();
  if (!server) {
    process.exit(0);
  }
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  cleanupAllReminders();
  stopOwnerSessionReminderScheduler();
  stopCampaignProcessor();
  if (!server) {
    process.exit(0);
  }
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

