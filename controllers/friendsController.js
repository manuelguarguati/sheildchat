const { Op } = require('sequelize');
const { User, Friendship } = require('../models');
const logger = require('../config/logger');

/**
 * GET /api/users/search
 * Search users by name (username, first_name, last_name)
 */
exports.searchUsers = async (req, res) => {
  try {
    const { name } = req.query;
    const companyId = req.company_id;
    const currentUserId = req.user.id;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Search term is required'
      });
    }

    const searchTerm = `%${name.trim()}%`;

    // Find users matching search criteria
    // Exclude: current user, already friends (accepted), already have pending requests
    const users = await User.findAll({
      where: {
        company_id: companyId,
        id: { [Op.ne]: currentUserId },
        [Op.or]: [
          { username: { [Op.like]: searchTerm } },
          { first_name: { [Op.like]: searchTerm } },
          { last_name: { [Op.like]: searchTerm } }
        ],
        is_active: true
      },
      attributes: ['id', 'username', 'first_name', 'last_name', 'avatar']
    });

    // Get existing friendship relationships for current user
    const existingFriendships = await Friendship.findAll({
      where: {
        company_id: companyId,
        [Op.or]: [
          { sender_id: currentUserId },
          { receiver_id: currentUserId }
        ],
        status: { [Op.in]: ['pending', 'accepted'] }
      }
    });

    // Filter out users who are already friends or have pending requests
    const filteredUsers = users.filter(user => {
      const isFriendOrPending = existingFriendships.some(f => 
        (f.sender_id === user.id || f.receiver_id === user.id)
      );
      return !isFriendOrPending;
    });

    logger.info('User search performed', {
      userId: currentUserId,
      companyId,
      searchTerm: name,
      resultsCount: filteredUsers.length
    });

    res.json({
      success: true,
      data: { users: filteredUsers }
    });
  } catch (error) {
    logger.error('Search users error', {
      userId: req.user.id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Failed to search users'
    });
  }
};

/**
 * POST /api/friends/request
 * Send a friend request
 */
exports.sendFriendRequest = async (req, res) => {
  try {
    console.log('Send friend request - Raw body:', JSON.stringify(req.body));
    
    const { receiver_id } = req.body;
    const senderId = req.user.id;
    const companyId = req.company_id;

    console.log('Send friend request:', { senderId, receiver_id, companyId });

    // Validate receiver_id - handle various input formats
    if (receiver_id === undefined || receiver_id === null) {
      console.log('Validation failed: receiver_id is undefined/null');
      return res.status(400).json({
        success: false,
        message: 'receiver_id is required'
      });
    }

    // Convert to number if it's a string (handle "5", "  5  ", etc.)
    let parsedReceiverId;
    if (typeof receiver_id === 'string') {
      const trimmed = receiver_id.trim();
      if (trimmed === '') {
        console.log('Validation failed: receiver_id is empty string');
        return res.status(400).json({
          success: false,
          message: 'receiver_id is required'
        });
      }
      parsedReceiverId = parseInt(trimmed, 10);
    } else if (typeof receiver_id === 'number') {
      parsedReceiverId = receiver_id;
    } else {
      console.log('Validation failed: receiver_id has invalid type:', typeof receiver_id);
      return res.status(400).json({
        success: false,
        message: 'receiver_id must be a valid number'
      });
    }

    // Check if parsed correctly
    if (isNaN(parsedReceiverId) || !isFinite(parsedReceiverId)) {
      console.log('Validation failed: receiver_id is not a valid number, received:', receiver_id, 'type:', typeof receiver_id);
      return res.status(400).json({
        success: false,
        message: 'receiver_id must be a valid number'
      });
    }

    // Prevent self-friend request
    if (parsedReceiverId === senderId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot send friend request to yourself'
      });
    }

    // Verify receiver exists and belongs to same company
    const receiver = await User.findOne({
      where: { id: parsedReceiverId, company_id: companyId, is_active: true }
    });

    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if friendship already exists
    const existingFriendship = await Friendship.findOne({
      where: {
        company_id: companyId,
        [Op.or]: [
          { sender_id: senderId, receiver_id: parsedReceiverId },
          { sender_id: parsedReceiverId, receiver_id: senderId }
        ]
      }
    });

    if (existingFriendship) {
      // If already friends (accepted)
      if (existingFriendship.status === 'accepted') {
        return res.status(200).json({
          success: true,
          message: 'Ya son amigos'
        });
      }

      // If pending request exists
      if (existingFriendship.status === 'pending') {
        // If I sent the request, inform user
        if (existingFriendship.sender_id === senderId) {
          return res.status(200).json({
            success: true,
            message: 'Solicitud ya enviada'
          });
        }

        // If the other user sent the request, auto-accept
        existingFriendship.status = 'accepted';
        existingFriendship.updated_at = new Date();
        await existingFriendship.save();

        logger.info('Friend request auto-accepted', {
          senderId: existingFriendship.sender_id,
          receiverId: existingFriendship.receiver_id,
          companyId,
          friendshipId: existingFriendship.id
        });

        return res.status(200).json({
          success: true,
          message: 'Solicitud aceptada automáticamente'
        });
      }

      // If rejected or other status, allow creating new request
    }

    // Create friendship request
    const friendship = await Friendship.create({
      company_id: companyId,
      sender_id: senderId,
      receiver_id: parsedReceiverId,
      status: 'pending',
      created_at: new Date(),
      updated_at: new Date()
    });

    logger.info('Friend request sent', {
      senderId,
      receiverId: parsedReceiverId,
      companyId,
      friendshipId: friendship.id
    });

    res.status(201).json({
      success: true,
      message: 'Friend request sent successfully',
      data: { friendship }
    });
  } catch (error) {
    logger.error('Send friend request error', {
      userId: req.user.id,
      error: error.message,
      stack: error.stack
    });
    console.error('Send friend request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send friend request'
    });
  }
};

/**
 * PUT /api/friends/accept/:id
 * Accept a friend request
 */
exports.acceptFriendRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const receiverId = req.user.id;
    const companyId = req.company_id;

    const parsedId = parseInt(id);
    if (isNaN(parsedId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request ID'
      });
    }

    console.log('Accept friend request:', { parsedId, receiverId, companyId });

    // Find the friendship request - either as receiver accepting, or sender confirming mutual
    const friendship = await Friendship.findOne({
      where: {
        id: parsedId,
        company_id: companyId,
        [Op.or]: [
          { receiver_id: receiverId },
          { sender_id: receiverId }
        ],
        status: 'pending'
      }
    });

    if (!friendship) {
      return res.status(404).json({
        success: false,
        message: 'Friend request not found or already processed'
      });
    }

    // Update status to accepted
    friendship.status = 'accepted';
    friendship.updated_at = new Date();
    await friendship.save();

    logger.info('Friend request accepted', {
      requestId: parsedId,
      receiverId,
      senderId: friendship.sender_id
    });

    res.json({
      success: true,
      message: 'Friend request accepted',
      data: { friendship }
    });
  } catch (error) {
    logger.error('Accept friend request error', {
      userId: req.user.id,
      error: error.message,
      stack: error.stack
    });
    console.error('Accept friend request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept friend request'
    });
  }
};

/**
 * PUT /api/friends/reject/:id
 * Reject a friend request
 */
exports.rejectFriendRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const receiverId = req.user.id;
    const companyId = req.company_id;

    const parsedId = parseInt(id);
    if (isNaN(parsedId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request ID'
      });
    }

    // Find the friendship request
    const friendship = await Friendship.findOne({
      where: {
        id: parsedId,
        company_id: companyId,
        receiver_id: receiverId,
        status: 'pending'
      }
    });

    if (!friendship) {
      return res.status(404).json({
        success: false,
        message: 'Friend request not found or already processed'
      });
    }

    // Update status to rejected
    friendship.status = 'rejected';
    friendship.updated_at = new Date();
    await friendship.save();

    logger.info('Friend request rejected', {
      requestId: parsedId,
      receiverId,
      senderId: friendship.sender_id
    });

    res.json({
      success: true,
      message: 'Friend request rejected',
      data: { friendship }
    });
  } catch (error) {
    logger.error('Reject friend request error', {
      userId: req.user.id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Failed to reject friend request'
    });
  }
};

/**
 * GET /api/friends/pending
 * Get pending friend requests for current user
 */
exports.getPendingRequests = async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.company_id;

    const pendingRequests = await Friendship.findAll({
      where: {
        company_id: companyId,
        receiver_id: userId,
        status: 'pending'
      },
      include: [
        { 
          model: User, 
          as: 'sender', 
          attributes: ['id', 'username', 'first_name', 'last_name', 'avatar'] 
        }
      ],
      order: [['created_at', 'DESC']]
    });

    logger.info('Pending requests retrieved', {
      userId,
      count: pendingRequests.length
    });

    res.json({
      success: true,
      data: { requests: pendingRequests }
    });
  } catch (error) {
    logger.error('Get pending requests error', {
      userId: req.user.id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Failed to get pending requests'
    });
  }
};

/**
 * GET /api/friends/list
 * Get list of accepted friends for current user
 */
exports.getFriends = async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.company_id;

    console.log('Fetching friends for user:', userId, 'company:', companyId);

    // Find all accepted friendships where user is sender or receiver
    const friendships = await Friendship.findAll({
      where: {
        company_id: companyId,
        [Op.or]: [
          { sender_id: userId },
          { receiver_id: userId }
        ],
        status: 'accepted'
      },
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['id', 'username', 'first_name', 'last_name', 'avatar']
        },
        {
          model: User,
          as: 'receiver',
          attributes: ['id', 'username', 'first_name', 'last_name', 'avatar']
        }
      ],
      order: [['updated_at', 'DESC']]
    });

    console.log('Found friendships:', friendships.length);

    // Transform data to get friend info regardless of sender/receiver role
    const friends = friendships.map(f => {
      // Determine which user is the "friend" (not the current user)
      const friendData = f.sender_id === userId ? f.receiver : f.sender;
      
      // Skip if friendData is undefined
      if (!friendData) {
        console.warn('Friend data missing for friendship:', f.id);
        return null;
      }
      
      return {
        id: friendData.id,
        username: friendData.username,
        first_name: friendData.first_name,
        last_name: friendData.last_name,
        avatar: friendData.avatar,
        friendship_id: f.id,
        since: f.updated_at
      };
    }).filter(f => f !== null);

    console.log('Returning friends count:', friends.length);

    logger.info('Friends list retrieved', {
      userId,
      count: friends.length
    });

    res.json({
      success: true,
      data: { friends }
    });
  } catch (error) {
    logger.error('Get friends error', {
      userId: req.user.id,
      error: error.message,
      stack: error.stack
    });
    console.error('Get friends error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get friends list'
    });
  }
};

/**
 * DELETE /api/friends/:friendId
 * Remove a friend (delete friendship)
 */
exports.removeFriend = async (req, res) => {
  try {
    const { friendId } = req.params;
    const currentUserId = req.user.id;
    const companyId = req.company_id;

    const parsedFriendId = parseInt(friendId);
    if (isNaN(parsedFriendId) || parsedFriendId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid friend ID'
      });
    }

    // Prevent removing yourself
    if (parsedFriendId === currentUserId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove yourself as a friend'
      });
    }

    // Find friendship where either user is sender and the other is receiver
    const friendship = await Friendship.findOne({
      where: {
        company_id: companyId,
        [Op.or]: [
          { sender_id: currentUserId, receiver_id: parsedFriendId },
          { sender_id: parsedFriendId, receiver_id: currentUserId }
        ],
        status: 'accepted'
      }
    });

    if (!friendship) {
      return res.status(404).json({
        success: false,
        message: 'Friendship not found'
      });
    }

    // Delete the friendship
    await friendship.destroy();

    logger.info('Friend removed', {
      userId: currentUserId,
      removedFriendId: parsedFriendId,
      companyId
    });

    res.json({
      success: true,
      message: 'Amigo eliminado correctamente'
    });
  } catch (error) {
    logger.error('Remove friend error', {
      userId: req.user.id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Failed to remove friend'
    });
  }
};
