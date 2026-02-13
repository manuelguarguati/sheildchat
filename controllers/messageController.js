const { Message, User, Friendship, AuditLog } = require('../models');
const { encryptMessage, decryptMessage } = require('../config/encryption');
const logger = require('../config/logger');

/**
 * Company isolation helper - filters queries by company_id
 */
function scopeToCompany(query, companyId) {
  return { ...query, where: { ...query.where, company_id: companyId } };
}

// Constants for validation
const MAX_MESSAGE_LENGTH = 10000; // 10KB max message size
const VALID_MESSAGE_TYPES = ['text', 'image', 'file', 'audio', 'video'];

/**
 * Validate message content
 */
function validateMessageContent(content) {
  if (!content || typeof content !== 'string') {
    return { valid: false, error: 'Message content is required' };
  }
  
  const trimmed = content.trim();
  
  if (trimmed.length === 0) {
    return { valid: false, error: 'Message content cannot be empty' };
  }
  
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return { valid: false, error: `Message too long. Max ${MAX_MESSAGE_LENGTH} characters allowed` };
  }
  
  return { valid: true, content: trimmed };
}

/**
 * Validate message type
 */
function validateMessageType(messageType) {
  if (!messageType) {
    return { valid: true, value: 'text' };
  }
  if (!VALID_MESSAGE_TYPES.includes(messageType)) {
    return { valid: false, error: `Invalid message type. Allowed: ${VALID_MESSAGE_TYPES.join(', ')}` };
  }
  return { valid: true, value: messageType };
}

/**
 * GET /api/messages/users
 * Get all friends (accepted friendships) for chat
 */
exports.getUsers = async (req, res) => {
  try {
    const userId = req.user.id;
    const companyId = req.company_id;

    // Find all accepted friendships where user is sender or receiver
    const friendships = await Friendship.findAll({
      where: {
        company_id: companyId,
        [require('sequelize').Op.or]: [
          { sender_id: userId },
          { receiver_id: userId }
        ],
        status: 'accepted'
      }
    });

    // Get friend IDs
    const friendIds = friendships.map(f => 
      f.sender_id === userId ? f.receiver_id : f.sender_id
    );

    if (friendIds.length === 0) {
      return res.json({
        success: true,
        data: { users: [] }
      });
    }

    // Get friend user details
    const users = await User.findAll({
      where: {
        id: { [require('sequelize').Op.in]: friendIds },
        is_active: true
      },
      attributes: ['id', 'username', 'first_name', 'last_name', 'avatar']
    });

    logger.info('Users retrieved (friends only)', { 
      userId, 
      companyId,
      count: users.length 
    });

    res.json({
      success: true,
      data: { users }
    });
  } catch (error) {
    logger.error('Get users error', { 
      userId: req.user.id, 
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({
      success: false,
      message: 'Failed to get users.'
    });
  }
};

/**
 * GET /api/messages/conversation/:userId
 * Get conversation history with a specific user
 */
exports.getConversation = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Validate userId
    const parsedUserId = parseInt(userId);
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    // Validate pagination parameters
    const parsedLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 100);
    const parsedOffset = Math.max(parseInt(offset) || 0, 0);

    // Verify the other user belongs to the same company
    const otherUser = await User.findOne({
      where: { id: parsedUserId, company_id: req.company_id }
    });

    if (!otherUser) {
      logger.warn('Conversation access denied', { 
        userId: req.user.id, 
        requestedUserId: parsedUserId,
        companyId: req.company_id 
      });
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    const messages = await Message.findAll({
      where: {
        company_id: req.company_id,
        [require('sequelize').Op.or]: [
          { sender_id: req.user.id, receiver_id: parsedUserId },
          { sender_id: parsedUserId, receiver_id: req.user.id }
        ],
        is_deleted: false
      },
      order: [['created_at', 'DESC']],
      limit: parsedLimit,
      offset: parsedOffset,
      include: [
        { model: User, as: 'sender', attributes: ['id', 'username', 'first_name', 'last_name'] },
        { model: User, as: 'receiver', attributes: ['id', 'username', 'first_name', 'last_name'] }
      ]
    });

    // Decrypt messages
    const decryptedMessages = messages.map(msg => {
      try {
        const msgData = msg.toJSON();
        msgData.decrypted_message = decryptMessage(msg.encrypted_message, msg.iv);
        delete msgData.encrypted_message;
        delete msgData.iv;
        return msgData;
      } catch (decryptError) {
        logger.error('Decryption failed', { 
          messageId: msg.id, 
          error: decryptError.message 
        });
        // Return message with error indicator
        const msgData = msg.toJSON();
        msgData.decrypted_message = '[Decryption failed]';
        delete msgData.encrypted_message;
        delete msgData.iv;
        return msgData;
      }
    });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'VIEW_CONVERSATION',
      resource_type: 'message',
      resource_id: parsedUserId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      status: 'success'
    });

    logger.info('Conversation retrieved', { 
      userId: req.user.id,
      otherUserId: parsedUserId,
      messageCount: messages.length 
    });

    res.json({
      success: true,
      data: { 
        messages: decryptedMessages,
        otherUser: {
          id: otherUser.id,
          username: otherUser.username,
          first_name: otherUser.first_name,
          last_name: otherUser.last_name
        }
      }
    });
  } catch (error) {
    logger.error('Get conversation error', { 
      userId: req.user.id, 
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({
      success: false,
      message: 'Failed to get conversation.'
    });
  }
};

/**
 * POST /api/messages/send/:userId
 * Send a message to another user
 */
exports.sendMessage = async (req, res) => {
  try {
    const { userId } = req.params;
    const { content, message_type = 'text' } = req.body;

    // Validate receiver ID
    const receiverId = parseInt(userId);
    if (isNaN(receiverId) || receiverId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid receiver ID'
      });
    }

    // Prevent self-messaging
    if (receiverId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot send messages to yourself'
      });
    }

    // Validate message content
    const contentValidation = validateMessageContent(content);
    if (!contentValidation.valid) {
      return res.status(400).json({
        success: false,
        message: contentValidation.error
      });
    }

    // Validate message type
    const typeValidation = validateMessageType(message_type);
    if (!typeValidation.valid) {
      return res.status(400).json({
        success: false,
        message: typeValidation.error
      });
    }

    // Verify receiver exists and belongs to same company
    const receiver = await User.findOne({
      where: { id: receiverId, company_id: req.company_id, is_active: true }
    });

    if (!receiver) {
      logger.warn('Message send failed - recipient not found', { 
        senderId: req.user.id,
        receiverId,
        companyId: req.company_id 
      });
      return res.status(404).json({
        success: false,
        message: 'Recipient not found.'
      });
    }

    // Encrypt message
    let encryptedData;
    try {
      encryptedData = encryptMessage(contentValidation.content);
    } catch (encryptError) {
      logger.error('Encryption failed', { 
        userId: req.user.id, 
        error: encryptError.message 
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to process message'
      });
    }

    // Save message to database
    let message;
    try {
      message = await Message.create({
        company_id: req.company_id,
        sender_id: req.user.id,
        receiver_id: receiverId,
        encrypted_message: encryptedData.encrypted,
        iv: encryptedData.iv,
        message_type: typeValidation.value
      });
    } catch (dbError) {
      logger.error('Database error saving message', { 
        userId: req.user.id, 
        error: dbError.message 
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to save message'
      });
    }

    const messageData = message.toJSON();
    messageData.decrypted_message = contentValidation.content;

    await AuditLog.create({
      user_id: req.user.id,
      action: 'SEND_MESSAGE',
      resource_type: 'message',
      resource_id: message.id,
      details: { receiver_id: receiverId, message_type: typeValidation.value },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      status: 'success'
    });

    logger.info('Message sent via API', { 
      userId: req.user.id,
      receiverId,
      messageId: message.id 
    });

    res.json({
      success: true,
      message: 'Message sent successfully.',
      data: { message: messageData }
    });
  } catch (error) {
    logger.error('Send message error', { 
      userId: req.user.id, 
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({
      success: false,
      message: 'Failed to send message.'
    });
  }
};

/**
 * PUT /api/messages/:messageId/read
 * Mark a message as read
 */
exports.markAsRead = async (req, res) => {
  try {
    const { messageId } = req.params;

    // Validate message ID
    const parsedMessageId = parseInt(messageId);
    if (isNaN(parsedMessageId) || parsedMessageId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid message ID'
      });
    }

    const message = await Message.findOne({
      where: {
        id: parsedMessageId,
        company_id: req.company_id,
        receiver_id: req.user.id,
        is_read: false
      }
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found.'
      });
    }

    message.is_read = true;
    message.read_at = new Date();
    await message.save();

    logger.info('Message marked as read', { 
      userId: req.user.id,
      messageId: parsedMessageId 
    });

    res.json({
      success: true,
      message: 'Message marked as read.'
    });
  } catch (error) {
    logger.error('Mark as read error', { 
      userId: req.user.id, 
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({
      success: false,
      message: 'Failed to mark message as read.'
    });
  }
};

/**
 * PUT /api/messages/:messageId
 * Edit a message
 */
exports.editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;

    // Validate message ID
    const parsedMessageId = parseInt(messageId);
    if (isNaN(parsedMessageId) || parsedMessageId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid message ID'
      });
    }

    // Validate message content
    const contentValidation = validateMessageContent(content);
    if (!contentValidation.valid) {
      return res.status(400).json({
        success: false,
        message: contentValidation.error
      });
    }

    // Find message
    const message = await Message.findOne({
      where: {
        id: parsedMessageId,
        company_id: req.company_id,
        sender_id: req.user.id
      }
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found or you do not have permission to edit it.'
      });
    }

    // Check if message is deleted
    if (message.is_deleted) {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit a deleted message.'
      });
    }

    // Check 15-minute edit window
    const EDIT_TIME_LIMIT = 15 * 60 * 1000; // 15 minutes in milliseconds
    const messageAge = Date.now() - new Date(message.created_at).getTime();
    
    if (messageAge > EDIT_TIME_LIMIT) {
      return res.status(400).json({
        success: false,
        message: 'No puedes editar después de 15 minutos'
      });
    }

    // Encrypt new content
    let encryptedData;
    try {
      encryptedData = encryptMessage(contentValidation.content);
    } catch (encryptError) {
      logger.error('Encryption failed during edit', { 
        userId: req.user.id, 
        error: encryptError.message 
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to process message'
      });
    }

    // Update message
    message.encrypted_message = encryptedData.encrypted;
    message.iv = encryptedData.iv;
    message.is_edited = true;
    message.edited_at = new Date();
    await message.save();

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`company:${req.company_id}`).emit('messageEdited', {
        id: message.id,
        is_edited: true,
        edited_at: message.edited_at
      });
    }

    await AuditLog.create({
      user_id: req.user.id,
      action: 'EDIT_MESSAGE',
      resource_type: 'message',
      resource_id: parsedMessageId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      status: 'success'
    });

    logger.info('Message edited', { 
      userId: req.user.id,
      messageId: parsedMessageId 
    });

    res.json({
      success: true,
      message: 'Message edited successfully.',
      data: {
        id: message.id,
        is_edited: true,
        edited_at: message.edited_at
      }
    });
  } catch (error) {
    logger.error('Edit message error', { 
      userId: req.user.id, 
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({
      success: false,
      message: 'Failed to edit message.'
    });
  }
};

/**
 * DELETE /api/messages/:messageId
 * Delete a message (soft delete) - Only sender can delete
 */
exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;

    // Validate message ID
    const parsedMessageId = parseInt(messageId);
    if (isNaN(parsedMessageId) || parsedMessageId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid message ID'
      });
    }

    // Only sender can delete their own messages
    const message = await Message.findOne({
      where: {
        id: parsedMessageId,
        company_id: req.company_id,
        sender_id: req.user.id
      }
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found or you do not have permission to delete it.'
      });
    }

    // Soft delete
    message.is_deleted = true;
    message.deleted_at = new Date();
    await message.save();

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`company:${req.company_id}`).emit('messageDeleted', {
        id: message.id
      });
    }

    await AuditLog.create({
      user_id: req.user.id,
      action: 'DELETE_MESSAGE',
      resource_type: 'message',
      resource_id: parsedMessageId,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      status: 'success'
    });

    logger.info('Message deleted', { 
      userId: req.user.id,
      messageId: parsedMessageId 
    });

    res.json({
      success: true,
      message: 'Message deleted.'
    });
  } catch (error) {
    logger.error('Delete message error', { 
      userId: req.user.id, 
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({
      success: false,
      message: 'Failed to delete message.'
    });
  }
};

/**
 * DELETE /api/messages/conversation/:userId
 * Delete conversation (soft delete - marks all messages as deleted for current user)
 */
exports.deleteConversation = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;
    const companyId = req.company_id;

    // Validate userId
    const parsedUserId = parseInt(userId);
    if (isNaN(parsedUserId) || parsedUserId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID'
      });
    }

    // Prevent deleting conversation with yourself
    if (parsedUserId === currentUserId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete conversation with yourself'
      });
    }

    // Verify the other user belongs to the same company
    const otherUser = await User.findOne({
      where: { id: parsedUserId, company_id: companyId }
    });

    if (!otherUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update all messages between both users (where current user is sender OR receiver)
    // to mark them as deleted for this user only
    const [updatedCount] = await Message.update(
      {
        is_deleted: true,
        deleted_at: new Date()
      },
      {
        where: {
          company_id: companyId,
          [require('sequelize').Op.or]: [
            { sender_id: currentUserId, receiver_id: parsedUserId },
            { sender_id: parsedUserId, receiver_id: currentUserId }
          ],
          is_deleted: false
        }
      }
    );

    await AuditLog.create({
      user_id: currentUserId,
      action: 'DELETE_CONVERSATION',
      resource_type: 'conversation',
      resource_id: parsedUserId,
      details: { messages_deleted: updatedCount },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      status: 'success'
    });

    logger.info('Conversation deleted', {
      userId: currentUserId,
      otherUserId: parsedUserId,
      companyId,
      messagesDeleted: updatedCount
    });

    res.json({
      success: true,
      message: 'Conversación eliminada correctamente',
      data: { deleted_count: updatedCount }
    });
  } catch (error) {
    logger.error('Delete conversation error', {
      userId: req.user.id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Failed to delete conversation'
    });
  }
};

// Export validators for testing
exports.validators = {
  validateMessageContent,
  validateMessageType,
  MAX_MESSAGE_LENGTH,
  VALID_MESSAGE_TYPES
};
