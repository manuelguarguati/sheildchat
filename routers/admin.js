const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, companyIsolation, authorize } = require('../middleware/auth');

/**
 * GET /api/admin/stats
 * Get company statistics (admin only)
 */
router.get('/stats', authenticate, companyIsolation, authorize(['admin']), adminController.getStats);

/**
 * GET /api/admin/users
 * Get all users (admin only)
 */
router.get('/users', authenticate, companyIsolation, authorize(['admin']), adminController.getUsers);

/**
 * POST /api/admin/users
 * Create a new user (admin only)
 */
router.post('/users', authenticate, companyIsolation, authorize(['admin']), adminController.createUser);

/**
 * PUT /api/admin/users/:id
 * Update a user (admin only)
 */
router.put('/users/:id', authenticate, companyIsolation, authorize(['admin']), adminController.updateUser);

/**
 * DELETE /api/admin/users/:id
 * Delete a user (admin only)
 */
router.delete('/users/:id', authenticate, companyIsolation, authorize(['admin']), adminController.deleteUser);

/**
 * GET /api/admin/audit-logs
 * Get audit logs (admin only)
 */
router.get('/audit-logs', authenticate, companyIsolation, authorize(['admin']), adminController.getAuditLogs);

module.exports = router;
