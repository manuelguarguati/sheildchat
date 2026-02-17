const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate, companyIsolation } = require('../middleware/auth');

/**
 * GET /api/users
 * Get all users in the company
 */
router.get('/', authenticate, companyIsolation, userController.getUsers);

/**
 * GET /api/users/search
 * Search users by name, email, or username
 */
router.get('/search', authenticate, companyIsolation, userController.searchUsers);

/**
 * GET /api/users/:id
 * Get a specific user
 */
router.get('/:id', authenticate, companyIsolation, userController.getUser);

/**
 * PUT /api/users/profile
 * Update current user's profile
 */
router.put('/profile', authenticate, companyIsolation, userController.updateProfile);

/**
 * PUT /api/users/password
 * Change password
 */
router.put('/password', authenticate, companyIsolation, userController.changePassword);

module.exports = router;
