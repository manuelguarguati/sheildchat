const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate, companyIsolation } = require('../middleware/auth');

/**
 * POST /api/auth/login
 * Public endpoint - no authentication required
 */
router.post('/login', authController.login);

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get('/me', authenticate, companyIsolation, authController.getMe);

/**
 * POST /api/auth/logout
 * Logout current user
 */
router.post('/logout', authenticate, authController.logout);

module.exports = router;
