const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const { ensureUploadsDir, resolveUploadsDir } = require('./config/uploads');
const { createUploadsServeMiddleware } = require('./middleware/uploadsServeMiddleware');

dotenv.config();

console.log('[ENV GUPSHUP APP ID]', process.env.GUPSHUP_APP_ID ? 'present' : 'missing');

try {
  const { resolveGupshupSource } = require('./services/gupshupApiService');
  const gupshupSource = resolveGupshupSource();
  console.log('[GUPSHUP STARTUP] WhatsApp business source ready:', gupshupSource);
} catch (error) {
  console.warn('[GUPSHUP STARTUP] GUPSHUP_SOURCE not configured — WhatsApp sends will fail until set:', error?.message || error);
}

const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employeeRoutes');
const taskRoutes = require('./routes/taskRoutes');
const groupRoutes = require('./routes/groupRoutes');
const messageRoutes = require('./routes/messageRoutes');
const chatRoutes = require('./routes/chatRoutes');
const conversationRoutes = require('./routes/conversationRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const fileRoutes = require('./routes/fileRoutes');
const contactRoutes = require('./routes/contactRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const reportRoutes = require('./routes/reportRoutes');
const clientRoutes = require('./routes/clientRoutes');
const historyRoutes = require('./routes/historyRoutes');
const smsRoutes = require('./routes/smsRoutes');
const whatsappCampaignRoutes = require('./routes/whatsappCampaignRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const allowedOrigins = [
  'https://crm.mukundhaassociates.com',
  'http://localhost:4200',
  'http://localhost:3000',
];
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    // Temporary fail-open mode to prevent production lockouts while proxy/origin settings stabilize.
    callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions));

// Handle all preflight requests early without wildcard route patterns.
app.use((req, res, next) => {
  if (req.method !== 'OPTIONS') {
    next();
    return;
  }

  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
  }

  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type,Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(204);
});

// Serve persistent uploads with optional forced download via ?download=true
const uploadsDir = ensureUploadsDir(resolveUploadsDir(process.env));
app.use('/uploads', createUploadsServeMiddleware(uploadsDir));
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Auth API',
      version: '1.0.0',
      description: 'Login authentication API with JWT and Swagger docs',
    },
    servers: [{ url: 'http://localhost:' + (process.env.PORT || 3000) }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/', (req, res) => {
  res.send({ success: true, message: 'API is running', version: '1.0.0' });
});

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/sms', smsRoutes);
app.use('/api/whatsapp-campaigns', whatsappCampaignRoutes);
app.use('/webhook', webhookRoutes);
app.use(errorHandler);

module.exports = app;

