const jwt = require('jsonwebtoken');
const { User, Message, Company, Friendship } = require('../models');
const { encryptMessage, decryptMessage } = require('./encryption');
const { AuditLog } = require('../models');
const logger = require('./logger');

/**
 * Socket.io Configuration with JWT Authentication and Multi-tenant Isolation
 * Enhanced with robust error handling, input validation, and structured logging
 */

// Store connected users: Map<userId, Set<socketId>>
const connectedUsers = new Map();

// Constants for validation
const MAX_MESSAGE_LENGTH = 10000; // 10KB max message size
const VALID_MESSAGE_TYPES = ['text', 'image', 'file', 'audio', 'video'];
const TYPING_TIMEOUT_MS = 5000;

/**
 * Input validation helpers
 */
const validators = {
  /**
   * Validate sender ID
   */
  validateSenderId: (senderId) => {
    if (!senderId || typeof senderId !== 'number' || !Number.isInteger(senderId)) {
      return { valid: false, error: 'Invalid sender ID' };
    }
    return { valid: true };
  },

  /**
   * Validate receiver ID
   */
  validateReceiverId: (receiverId) => {
    if (!receiverId || typeof receiverId !== 'number' || !Number.isInteger(receiverId)) {
      return { valid: false, error: 'Invalid receiver ID' };
    }
    if (receiverId <= 0) {
      return { valid: false, error: 'Receiver ID must be positive' };
    }
    return { valid: true };
  },

  /**
   * Validate message content
   */
  validateContent: (content) => {
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
    
    return { valid: true, trimmed: trimmed };
  },

  /**
   * Validate message type
   */
  validateMessageType: (messageType) => {
    if (!messageType) {
      return { valid: true, value: 'text' }; // Default to text
    }
    if (!VALID_MESSAGE_TYPES.includes(messageType)) {
      return { valid: false, error: `Invalid message type. Allowed: ${VALID_MESSAGE_TYPES.join(', ')}` };
    }
    return { valid: true, value: messageType };
  },

  /**
   * Sanitize and validate incoming data object
   */
  validateMessagePayload: (data) => {
    const errors = [];
    
    if (!data || typeof data !== 'object') {
      return { valid: false, errors: ['Invalid data format'] };
    }

    const { receiver_id, content, message_type } = data;

    const receiverValidation = validators.validateReceiverId(receiver_id);
    if (!receiverValidation.valid) {
      errors.push(receiverValidation.error);
    }

    const contentValidation = validators.validateContent(content);
    if (!contentValidation.valid) {
      errors.push(contentValidation.error);
    }

    const typeValidation = validators.validateMessageType(message_type);
    if (!typeValidation.valid) {
      errors.push(typeValidation.error);
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return {
      valid: true,
      data: {
        receiver_id: parseInt(receiver_id),
        content: contentValidation.trimmed,
        message_type: typeValidation.value
      }
    };
  }
};

/**
 * Safe callback wrapper - ensures callback is called only once
 */
function safeCallback(callback) {
  let called = false;
  return function(...args) {
    if (called) {
      logger.warn('Callback already called', { callback: args[0]?.message });
      return;
    }
    called = true;
    callback.apply(this, args);
  };
}

module.exports = (io) => {
  // Authentication middleware for Socket.io
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      
      if (!token) {
        logger.logSecurity('AUTH_MISSING_TOKEN', null, { ip: socket.handshake.address });
        return next(new Error('Authentication required'));
      }

      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (jwtError) {
        if (jwtError.name === 'TokenExpiredError') {
          logger.logSecurity('AUTH_TOKEN_EXPIRED', null, { ip: socket.handshake.address });
          return next(new Error('Token expired'));
        }
        logger.logSecurity('AUTH_INVALID_TOKEN', null, { ip: socket.handshake.address, error: jwtError.message });
        return next(new Error('Invalid token'));
      }
      
      const user = await User.findByPk(decoded.user_id, {
        attributes: { exclude: ['password_hash'] },
        include: [{ model: Company, as: 'company' }]
      });

      if (!user || !user.is_active) {
        logger.logSecurity('AUTH_USER_INACTIVE', decoded.user_id, { ip: socket.handshake.address });
        return next(new Error('User not found or inactive'));
      }

      // Attach user info to socket
      socket.user = user;
      socket.company_id = user.company_id;
      socket.userId = user.id; // Numeric ID for easier access
      
      logger.info('Socket authenticated', { userId: user.id, companyId: user.company_id });
      next();
    } catch (error) {
      logger.error('Authentication error', { error: error.message, stack: error.stack });
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.user;
    const userId = socket.userId;
    const companyId = socket.company_id;

    logger.info('User connected', { userId, companyId, socketId: socket.id });

    // Add user to company room
    socket.join(`company:${companyId}`);
    
    // Add user to their personal room
    socket.join(`user:${userId}`);

    // Register handler - explicit room joining for user
    socket.on('register', (targetUserId, callback) => {
      const cb = safeCallback(callback || (() => {}));
      
      try {
        if (typeof targetUserId !== 'number' && typeof targetUserId !== 'string') {
          cb({ success: false, error: 'Invalid user ID' });
          return;
        }
        
        // Join to consistent room format
        socket.join(`user:${targetUserId}`);
        logger.logSocketEvent('register', userId, { registeredTo: targetUserId });
        
        console.log("✅ Usuario conectado:", targetUserId, "- Socket:", socket.id);
        cb({ success: true });
      } catch (error) {
        logger.error('Register error', { error: error.message, userId });
        cb({ success: false, error: 'Registration failed' });
      }
    });

    // Track connected users
    if (!connectedUsers.has(companyId)) {
      connectedUsers.set(companyId, new Map());
    }
    connectedUsers.get(companyId).set(userId, socket.id);

    // Broadcast online status to company
    io.to(`company:${companyId}`).emit('user:online', {
      userId: userId,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name
    });

    /**
     * Handle sending messages via Socket.io
     * With full validation, error handling, and ACK
     */
    socket.on('message:send', async (data, callback) => {
      const cb = safeCallback(callback || (() => {}));
      
      try {
        // Validate input
        const validation = validators.validateMessagePayload(data);
        
        if (!validation.valid) {
          logger.warn('Message validation failed', { userId, errors: validation.errors });
          cb({ 
            success: false, 
            error: 'Invalid message data',
            details: validation.errors 
          });
          return;
        }

        const { receiver_id, content, message_type } = validation.data;

        // Verify receiver belongs to same company (multi-tenant isolation)
        const receiver = await User.findOne({
          where: { id: receiver_id, company_id: companyId, is_active: true }
        });

        if (!receiver) {
          logger.warn('Receiver not found or inactive', { userId, receiver_id });
          cb({ 
            success: false, 
            error: 'Recipient not found or inactive' 
          });
          return;
        }

        // Prevent self-messaging
        if (receiver_id === userId) {
          logger.warn('Self-messaging attempt', { userId });
          cb({ 
            success: false, 
            error: 'Cannot send messages to yourself' 
          });
          return;
        }

        // Encrypt message
        let encryptedData;
        try {
          encryptedData = encryptMessage(content);
        } catch (encryptError) {
          logger.error('Encryption failed', { userId, error: encryptError.message });
          cb({ 
            success: false, 
            error: 'Failed to process message' 
          });
          return;
        }

        // Save to database
        let message;
        try {
          message = await Message.create({
            company_id: companyId,
            sender_id: userId,
            receiver_id: receiver_id,
            encrypted_message: encryptedData.encrypted,
            iv: encryptedData.iv,
            message_type: message_type
          });
        } catch (dbError) {
          logger.error('Database error saving message', { userId, error: dbError.message });
          cb({ 
            success: false, 
            error: 'Failed to save message' 
          });
          return;
        }

        const messageData = {
          id: message.id,
          sender_id: userId,
          receiver_id: receiver_id,
          content: content, // Send decrypted to sender
          iv: encryptedData.iv,
          message_type: message_type,
          created_at: message.created_at,
          sender: {
            id: userId,
            username: user.username,
            first_name: user.first_name,
            last_name: user.last_name
          }
        };

        // Emit to receiver using consistent user room format
        io.to(`user:${receiver_id}`).emit('new_message', messageData);

        // Log action
        try {
          await AuditLog.create({
            user_id: userId,
            action: 'SOCKET_MESSAGE',
            resource_type: 'message',
            resource_id: message.id,
            details: { receiver_id, message_type },
            ip_address: socket.handshake.address,
            status: 'success'
          });
        } catch (auditError) {
          logger.error('Failed to create audit log', { userId, error: auditError.message });
          // Non-critical error, message was already sent
        }

        logger.info('Message sent successfully', { 
          userId, 
          receiverId: receiver_id, 
          messageId: message.id 
        });

        cb({ success: true, message: messageData });
        
      } catch (error) {
        // Catch-all for unexpected errors
        logger.error('Unexpected message send error', { 
          userId, 
          error: error.message, 
          stack: error.stack 
        });
        cb({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    });

    /**
     * Handle typing indicator
     */
    socket.on('typing:start', async (data, callback) => {
      const cb = safeCallback(callback || (() => {}));
      
      try {
        const { receiver_id } = data || {};
        
        if (!receiver_id || typeof receiver_id !== 'number') {
          cb({ success: false, error: 'Invalid receiver ID' });
          return;
        }

        io.to(`user:${receiver_id}`).emit('typing:start', {
          sender_id: userId,
          username: user.username
        });
        
        cb({ success: true });
      } catch (error) {
        logger.error('Typing start error', { userId, error: error.message });
        cb({ success: false, error: 'Failed to send typing status' });
      }
    });

    socket.on('typing:stop', async (data, callback) => {
      const cb = safeCallback(callback || (() => {}));
      
      try {
        const { receiver_id } = data || {};
        
        if (!receiver_id || typeof receiver_id !== 'number') {
          cb({ success: false, error: 'Invalid receiver ID' });
          return;
        }

        io.to(`user:${receiver_id}`).emit('typing:stop', {
          sender_id: userId
        });
        
        cb({ success: true });
      } catch (error) {
        logger.error('Typing stop error', { userId, error: error.message });
        cb({ success: false, error: 'Failed to send typing status' });
      }
    });

    /**
     * Handle message read status
     */
    socket.on('message:read', async (data, callback) => {
      const cb = safeCallback(callback || (() => {}));
      
      try {
        const { message_id, sender_id } = data || {};
        
        if (!message_id || typeof message_id !== 'number') {
          cb({ success: false, error: 'Invalid message ID' });
          return;
        }

        // Mark message as read in database
        const [updatedCount] = await Message.update(
          { is_read: true, read_at: new Date() },
          { 
            where: { 
              id: message_id, 
              receiver_id: userId 
            } 
          }
        );

        // Notify sender only if message was actually marked as read
        if (updatedCount > 0) {
          io.to(`user:${sender_id}`).emit('message:read:ack', {
            message_id,
            reader_id: userId
          });
          
          logger.info('Message marked as read', { userId, messageId: message_id });
        }
        
        cb({ success: true, updated: updatedCount > 0 });
      } catch (error) {
        logger.error('Mark as read error', { userId, error: error.message });
        cb({ success: false, error: 'Failed to mark message as read' });
      }
    });

    /**
     * Mark all messages from a sender as read when opening chat
     */
    socket.on('messages:mark:read', async (data, callback) => {
      const cb = safeCallback(callback || (() => {}));
      
      try {
        const { sender_id } = data || {};
        
        if (!sender_id || typeof sender_id !== 'number') {
          cb({ success: false, error: 'Invalid sender ID' });
          return;
        }

        // Mark all unread messages from this sender as read
        const [updatedCount] = await Message.update(
          { is_read: true, read_at: new Date() },
          { 
            where: { 
              sender_id: sender_id,
              receiver_id: userId,
              is_read: false
            } 
          }
        );

        // Notify sender about read status
        io.to(`user:${sender_id}`).emit('messages:read:bulk', {
          reader_id: userId,
          count: updatedCount
        });
        
        logger.info('Messages marked as read', { userId, senderId: sender_id, count: updatedCount });
        cb({ success: true, updated: updatedCount });
      } catch (error) {
        logger.error('Mark messages as read error', { userId, error: error.message });
        cb({ success: false, error: 'Failed to mark messages as read' });
      }
    });

    /**
     * Handle friend request notifications
     */
    socket.on('friend:request:sent', async (data, callback) => {
      const cb = safeCallback(callback || (() => {}));
      
      try {
        const { receiver_id } = data || {};
        
        if (!receiver_id || typeof receiver_id !== 'number') {
          cb({ success: false, error: 'Invalid receiver ID' });
          return;
        }

        // Get receiver info
        const receiver = await User.findByPk(receiver_id, {
          attributes: ['id', 'username', 'first_name', 'last_name']
        });

        if (receiver) {
          // Notify receiver
          io.to(`user:${receiver_id}`).emit('friend:request:received', {
            sender_id: userId,
            sender_name: user.first_name ? `${user.first_name} ${user.last_name}` : user.username
          });
          
          logger.info('Friend request notification sent', { senderId: userId, receiverId: receiver_id });
        }
        
        cb({ success: true });
      } catch (error) {
        logger.error('Friend request notification error', { userId, error: error.message });
        cb({ success: false, error: 'Failed to send notification' });
      }
    });

    /**
     * Handle friend request accepted notifications
     */
    socket.on('friend:request:accepted', async (data, callback) => {
      const cb = safeCallback(callback || (() => {}));
      
      try {
        const { sender_id } = data || {};
        
        if (!sender_id || typeof sender_id !== 'number') {
          cb({ success: false, error: 'Invalid sender ID' });
          return;
        }

        // Notify sender that their request was accepted
        io.to(`user:${sender_id}`).emit('friend:request:accepted:notification', {
          receiver_id: userId,
          receiver_name: user.first_name ? `${user.first_name} ${user.last_name}` : user.username
        });
        
        logger.info('Friend request accepted notification sent', { senderId: sender_id, receiverId: userId });
        cb({ success: true });
      } catch (error) {
        logger.error('Friend request accepted notification error', { userId, error: error.message });
        cb({ success: false, error: 'Failed to send notification' });
      }
    });

    /**
     * Update last seen
     */
    socket.on('update:last:seen', async (callback) => {
      const cb = safeCallback(callback || (() => {}));
      
      try {
        await User.update(
          { last_seen: new Date() },
          { where: { id: userId } }
        );
        cb({ success: true });
      } catch (error) {
        logger.error('Update last seen error', { userId, error: error.message });
        cb({ success: false, error: 'Failed to update last seen' });
      }
    });

    /**
     * Handle getting user last seen
     */
    socket.on('get:last:seen', async (data, callback) => {
      const cb = safeCallback(callback || (() => {}));
      
      try {
        const { target_user_id } = data || {};
        
        if (!target_user_id || typeof target_user_id !== 'number') {
          cb({ success: false, error: 'Invalid target user ID' });
          return;
        }

        const targetUser = await User.findByPk(target_user_id, {
          attributes: ['id', 'username', 'first_name', 'last_name', 'last_seen']
        });

        if (targetUser) {
          cb({ 
            success: true, 
            last_seen: targetUser.last_seen,
            is_online: connectedUsers.get(companyId)?.has(target_user_id) 
          });
        } else {
          cb({ success: false, error: 'User not found' });
        }
      } catch (error) {
        logger.error('Get last seen error', { userId, error: error.message });
        cb({ success: false, error: 'Failed to get last seen' });
      }
    });

    /**
     * Handle disconnect
     */
    socket.on('disconnect', async (reason) => {
      logger.info('User disconnected', { 
        userId, 
        companyId, 
        socketId: socket.id,
        reason 
      });
      
      // Remove from connected users
      if (connectedUsers.has(companyId)) {
        connectedUsers.get(companyId).delete(userId);
        if (connectedUsers.get(companyId).size === 0) {
          connectedUsers.delete(companyId);
        }
      }

      // Update last seen before disconnecting
      try {
        await User.update(
          { last_seen: new Date() },
          { where: { id: userId } }
        );
      } catch (error) {
        logger.error('Failed to update last seen on disconnect', { userId, error: error.message });
      }

      // Broadcast offline status
      io.to(`company:${companyId}`).emit('user:offline', {
        userId: userId,
        username: user.username,
        last_seen: new Date()
      });
    });

    /**
     * Handle connection errors
     */
    socket.on('error', (error) => {
      logger.error('Socket error', { 
        userId, 
        error: error.message,
        stack: error.stack 
      });
    });
  });

  return io;
};

/**
 * Helper function to get online users for a company
 */
module.exports.getOnlineUsers = (companyId) => {
  const companyUsers = connectedUsers.get(companyId);
  if (!companyUsers) return [];
  return Array.from(companyUsers.keys());
};

/**
 * Helper function to get online users count for a company
 */
module.exports.getOnlineCount = (companyId) => {
  const companyUsers = connectedUsers.get(companyId);
  return companyUsers ? companyUsers.size : 0;
};

/**
 * Get validator functions for testing
 */
module.exports.validators = validators;
