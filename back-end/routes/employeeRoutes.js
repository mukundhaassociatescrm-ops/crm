const express = require('express');
const router = express.Router();
const {
  addEmployee,
  getEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
  resetEmployeePassword,
} = require('../controllers/employeeController');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRole } = require('../middleware/roleMiddleware');

/**
 * @openapi
 * tags:
 *   - name: Employee
 *     description: Employee management APIs
 */

/**
 * @openapi
 * /api/employees:
 *   post:
 *     tags:
 *       - Employee
 *     summary: Create employee (Admin only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullName
 *               - email
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@example.com
 *               phone:
 *                 type: string
 *                 example: +123456789
 *               address:
 *                 type: string
 *                 example: 123 Main St
 *               role:
 *                 type: string
 *                 enum: [Admin, Employee]
 *                 example: Employee
 *               status:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Employee created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post('/', protect, authorizeRole('Admin'), addEmployee);

/**
 * @openapi
 * /api/employees:
 *   get:
 *     tags:
 *       - Employee
 *     summary: Get all employees with optional search and status filter
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by fullName, email or phone
 *       - in: query
 *         name: status
 *         schema:
 *           type: boolean
 *         description: Filter by active/inactive status
 *     responses:
 *       200:
 *         description: Employee list
 */
router.get('/', protect, getEmployees);

router.post('/:employeeId/reset-password', protect, authorizeRole('admin'), resetEmployeePassword);

/**
 * @openapi
 * /api/employees/{id}:
 *   get:
 *     tags:
 *       - Employee
 *     summary: Get single employee by ID
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
 *         description: Employee found
 *       404:
 *         description: Employee not found
 */
router.get('/:id', protect, getEmployeeById);

/**
 * @openapi
 * /api/employees/{id}:
 *   put:
 *     tags:
 *       - Employee
 *     summary: Update employee (Admin only)
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
 *               fullName:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *               address:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [Admin, Employee]
 *               status:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Employee updated
 *       404:
 *         description: Employee not found
 */
router.put('/:id', protect, authorizeRole('Admin'), updateEmployee);

/**
 * @openapi
 * /api/employees/{id}:
 *   delete:
 *     tags:
 *       - Employee
 *     summary: Delete employee (Admin only)
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
 *         description: Employee deleted
 *       404:
 *         description: Employee not found
 */
router.delete('/:id', protect, authorizeRole('Admin'), deleteEmployee);

module.exports = router;
