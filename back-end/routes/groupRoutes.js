const express = require('express');
const router = express.Router();
const {
  createGroup,
  getGroups,
  getGroupById,
  updateGroup,
  deleteGroup,
  assignClientsToGroup,
  getGroupMembers,
  addClientsToGroup,
  removeClientFromGroup,
} = require('../controllers/groupController');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRole } = require('../middleware/roleMiddleware');

/**
 * @openapi
 * tags:
 *   - name: Group
 *     description: Group management endpoints
 */

/**
 * @openapi
 * /api/groups:
 *   post:
 *     tags:
 *       - Group
 *     summary: Create a new group (Admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: Clients - Nov 2026
 *               contacts:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: John
 *                     phone:
 *                       type: string
 *                       example: +1234567890
 *                 example:
 *                   - name: John
 *                     phone: +1234567890
 *                   - phone: +1987654321
 *     responses:
 *       201:
 *         description: Group created
 */
router.post('/', protect, authorizeRole('admin'), createGroup);

/**
 * @openapi
 * /api/groups:
 *   get:
 *     tags:
 *       - Group
 *     summary: Get all groups with optional search by name
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search groups by name
 *     responses:
 *       200:
 *         description: Group list
 */
router.get('/', protect, getGroups);

router.get('/:id/members', protect, getGroupMembers);
router.post('/:id/clients', protect, authorizeRole('admin'), addClientsToGroup);
router.delete('/:id/clients/:clientId', protect, authorizeRole('admin'), removeClientFromGroup);

/**
 * @openapi
 * /api/groups/{id}:
 *   get:
 *     tags:
 *       - Group
 *     summary: Get single group by ID
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
 *         description: Group details
 */
router.get('/:id', protect, getGroupById);

/**
 * @openapi
 * /api/groups/{id}:
 *   put:
 *     tags:
 *       - Group
 *     summary: Update group (Admin only)
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
 *               name:
 *                 type: string
 *               contacts:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     phone:
 *                       type: string
 *     responses:
 *       200:
 *         description: Group updated
 */
router.put('/:id', protect, authorizeRole('admin'), updateGroup);

/**
 * @openapi
 * /api/groups/{id}:
 *   delete:
 *     tags:
 *       - Group
 *     summary: Delete group (Admin only)
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
 *         description: Group deleted
 */
router.delete('/:id', protect, authorizeRole('admin'), deleteGroup);

/**
 * @openapi
 * /api/groups/{id}/assign-clients:
 *   post:
 *     tags:
 *       - Group
 *     summary: Assign clients to a group (Admin only)
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
 *               clientIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Clients assigned
 */
router.post('/:id/assign-clients', protect, authorizeRole('admin'), assignClientsToGroup);

module.exports = router;
