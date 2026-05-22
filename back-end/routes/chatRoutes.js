const express = require('express');
const {
	startChatSession,
	getChatSessionStatus,
	getChatTemplates,
	refreshChatTemplates,
	sendChatMessage,
	sendChatFile,
	sendChatTemplate,
	getChatByPhone,
	getChatConversations,
	markConversationRead,
	softDeleteChatMessage,
	toggleChatMessageImportant,
} = require('../controllers/chatController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/start', startChatSession);
router.get('/session-status', getChatSessionStatus);
router.get('/templates', (req, res, next) => {
  console.log('[CHAT TEMPLATE API HIT]', {
    path: '/api/chat/templates',
    query: req.query,
  });
  next();
}, getChatTemplates);
router.post('/templates/refresh', refreshChatTemplates);

/**
 * @openapi
 * tags:
 *   - name: Chat
 *     description: WhatsApp chat APIs powered by Gupshup
 */

/**
 * @openapi
 * /api/chat/send:
 *   post:
 *     tags:
 *       - Chat
 *     summary: Send WhatsApp message through Gupshup
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - text
 *             properties:
 *               to:
 *                 type: string
 *                 example: "919999999999"
 *               text:
 *                 type: string
 *                 example: "Hello from CRM"
 *               message:
 *                 type: string
 *                 example: "Hello from CRM"
 *                 description: Backward-compatible alias for text
 *     responses:
 *       200:
 *         description: Message accepted by Gupshup
 *       400:
 *         description: Invalid payload
 *       500:
 *         description: Provider or server error
 */

// Sends outbound WhatsApp message through Gupshup.
router.post('/send', sendChatMessage);

/**
 * @openapi
 * /api/chat/send-file:
 *   post:
 *     tags:
 *       - Chat
 *     summary: Send WhatsApp file through Gupshup
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - fileUrl
 *               - filename
 *             properties:
 *               to:
 *                 type: string
 *                 example: "919999999999"
 *               fileUrl:
 *                 type: string
 *                 example: "https://api.example.com/uploads/1710000000-sample.pdf"
 *               filename:
 *                 type: string
 *                 example: "sample.pdf"
 *               mimeType:
 *                 type: string
 *                 example: "application/pdf"
 *     responses:
 *       200:
 *         description: File message accepted by Gupshup
 *       400:
 *         description: Invalid payload
 *       500:
 *         description: Provider or server error
 */
// Sends outbound WhatsApp file through Gupshup.
router.post('/send-file', sendChatFile);

/**
 * @openapi
 * /api/chat/send-template:
 *   post:
 *     tags:
 *       - Chat
 *     summary: Send approved WhatsApp template through Gupshup
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - templateId
 *             properties:
 *               to:
 *                 type: string
 *                 example: "919999999999"
 *               templateId:
 *                 type: string
 *                 example: "welcome_template_v1"
 *               params:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Template message accepted by Gupshup
 *       400:
 *         description: Invalid payload
 *       500:
 *         description: Provider or server error
 */
router.post('/send-template', sendChatTemplate);

/**
 * @openapi
 * /api/chat/conversations:
 *   get:
 *     tags:
 *       - Chat
 *     summary: Get chat conversation list
 *     responses:
 *       200:
 *         description: Conversation summaries
 */

// Fetches conversation list for chat sidebar.
router.get('/conversations', getChatConversations);

/**
 * @openapi
 * /api/chat/{phone}:
 *   get:
 *     tags:
 *       - Chat
 *     summary: Get chat history by phone number
 *     parameters:
 *       - in: path
 *         name: phone
 *         required: true
 *         schema:
 *           type: string
 *         example: "919999999999"
 *     responses:
 *       200:
 *         description: Sorted chat history
 *       400:
 *         description: Missing or invalid phone number
 */

/**
 * @openapi
 * /api/chat/{phone}/read:
 *   post:
 *     tags:
 *       - Chat
 *     summary: Mark a chat conversation as read
 *     parameters:
 *       - in: path
 *         name: phone
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Conversation unread count reset
 */
router.post('/:phone/read', markConversationRead);

router.patch('/messages/:messageId/delete', protect, softDeleteChatMessage);
router.patch('/messages/:messageId/important', protect, toggleChatMessageImportant);

// Fetches chat history for one phone number.
router.get('/:phone', getChatByPhone);

module.exports = router;
