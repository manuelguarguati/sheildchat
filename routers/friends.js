const express = require('express');
const router = express.Router();
const friendsController = require('../controllers/friendsController');
const { authenticate, companyIsolation } = require('../middleware/auth');

/**
 * GET /api/users/search
 * Search users by name
 */
router.get('/search', authenticate, companyIsolation, friendsController.searchUsers);

/**
 * POST /api/friends/request
 * Send a friend request
 */
router.post('/request', authenticate, companyIsolation, friendsController.sendFriendRequest);

/**
 * PUT /api/friends/accept/:id
 * Accept a friend request
 */
router.put('/accept/:id', authenticate, companyIsolation, friendsController.acceptFriendRequest);

/**
 * PUT /api/friends/reject/:id
 * Reject a friend request
 */
router.put('/reject/:id', authenticate, companyIsolation, friendsController.rejectFriendRequest);

/**
 * GET /api/friends/pending
 * Get pending friend requests
 */
router.get('/pending', authenticate, companyIsolation, friendsController.getPendingRequests);

/**
 * GET /api/friends/list
 * Get list of accepted friends
 */
router.get('/list', authenticate, companyIsolation, friendsController.getFriends);

/**
 * DELETE /api/friends/:friendId
 * Remove a friend
 */
router.delete('/:friendId', authenticate, companyIsolation, friendsController.removeFriend);

module.exports = router;
