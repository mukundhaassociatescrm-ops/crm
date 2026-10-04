const express = require('express');
const router = express.Router();
const {
  createTask,
  getTasks,
  getUpcomingReminders,
  getTaskById,
  updateTask,
  deleteTask,
  sendTaskReminder,
  getTaskReminderLogs,
  addTaskAttachment,
} = require('../controllers/taskController');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRole } = require('../middleware/roleMiddleware');

/**
 * @openapi
 * tags:
 *   - name: Task
 *     description: CRM task management endpoints
 */

/**
 * @openapi
 * /api/tasks:
 *   post:
 *     tags:
 *       - Task
 *     summary: Create a new task (admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - assignedTo
 *             properties:
 *               title:
 *                 type: string
 *                 example: Follow up with client
 *               description:
 *                 type: string
 *                 example: Call prospect and share pricing
 *               createdFrom:
 *                 type: string
 *                 enum: [CRM, CALL_TRACKER]
 *                 default: CRM
 *                 example: CALL_TRACKER
 *               assignedTo:
 *                 type: string
 *                 example: 64a2f1f2de0edc1234d56789
 *               priority:
 *                 type: string
 *                 enum: [Low, Medium, High]
 *                 example: High
 *               status:
 *                 type: string
 *                 enum: [Pending, In Progress, Completed]
 *                 example: Pending
 *               dueDate:
 *                 type: string
 *                 format: date
 *               reminderEnabled:
 *                 type: boolean
 *                 example: true
 *               reminderBefore:
 *                 type: number
 *                 example: 15
 *                 description: Minutes before due date to send reminder
 *     responses:
 *       201:
 *         description: Task created
 */
router.post('/', protect, authorizeRole('admin'), createTask);

/**
 * @openapi
 * /api/tasks:
 *   get:
 *     tags:
 *       - Task
 *     summary: Get tasks with filters
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [Pending, In Progress, Completed]
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [Low, Medium, High]
 *       - in: query
 *         name: assignedTo
 *         schema:
 *           type: string
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: createdFrom
 *         schema:
 *           type: string
 *           enum: [CRM, CALL_TRACKER]
 *     responses:
 *       200:
 *         description: Task list
 */
router.get('/', protect, getTasks);

/**
 * @openapi
 * /api/tasks/reminders/upcoming:
 *   get:
 *     tags:
 *       - Task
 *     summary: Get upcoming task reminders
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Upcoming reminder list
 */
router.get('/reminders/upcoming', protect, getUpcomingReminders);

/**
 * @openapi
 * /api/tasks/{id}:
 *   get:
 *     tags:
 *       - Task
 *     summary: Get single task by id
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task details
 *       404:
 *         description: Not found
 */
router.get('/:id', protect, getTaskById);

/**
 * @openapi
 * /api/tasks/{id}:
 *   put:
 *     tags:
 *       - Task
 *     summary: Update a task (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               assignedTo:
 *                 type: string
 *               priority:
 *                 type: string
 *                 enum: [Low, Medium, High]
 *               status:
 *                 type: string
 *                 enum: [Pending, In Progress, Completed]
 *               dueDate:
 *                 type: string
 *                 format: date
 *               reminderEnabled:
 *                 type: boolean
 *               reminderBefore:
 *                 type: number
 *                 description: Minutes before due date to send reminder
 *     responses:
 *       200:
 *         description: Task updated
 */
router.put('/:id', protect, updateTask);

/**
 * @openapi
 * /api/tasks/{id}:
 *   delete:
 *     tags:
 *       - Task
 *     summary: Delete a task (admin only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Task deleted
 */
router.delete('/:id', protect, authorizeRole('admin'), deleteTask);

/**
 * @openapi
 * /api/tasks/{id}/reminder:
 *   post:
 *     tags:
 *       - Task
 *     summary: Send manual reminder for a task
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Reminder sent
 */
router.post('/:id/reminder', protect, sendTaskReminder);

/**
 * @openapi
 * /api/tasks/{taskId}/reminder-logs:
 *   get:
 *     tags:
 *       - Task
 *     summary: Get reminder logs for a task
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Reminder logs
 */
router.get('/:taskId/reminder-logs', protect, getTaskReminderLogs);

/**
 * @openapi
 * /api/tasks/{id}/attachments:
 *   post:
 *     tags:
 *       - Task
 *     summary: Add attachment proof to a task
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *               - fileName
 *             properties:
 *               url:
 *                 type: string
 *               fileName:
 *                 type: string
 *               mimeType:
 *                 type: string
 *               note:
 *                 type: string
 *     responses:
 *       200:
 *         description: Attachment added
 */
router.post('/:id/attachments', protect, addTaskAttachment);

module.exports = router;
