const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { authenticate, companyIsolation } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: './public/uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|zip|mp3|mp4/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image and document files are allowed'));
  }
});

/**
 * GET /api/messages/users
 * Get all users in the company for chat
 */
router.get('/users', authenticate, companyIsolation, messageController.getUsers);

/**
 * GET /api/messages/conversation/:userId
 * Get conversation history with a specific user
 */
router.get('/conversation/:userId', authenticate, companyIsolation, messageController.getConversation);

/**
 * POST /api/messages/send/:userId
 * Send a message to another user
 */
router.post('/send/:userId', authenticate, companyIsolation, messageController.sendMessage);

/**
 * POST /api/messages/upload
 * Upload and send a file/image
 */
router.post('/upload', authenticate, companyIsolation, upload.single('file'), async (req, res) => {
  try {
    const { receiver_id, message_type } = req.body;
    const senderId = req.user.id;
    const companyId = req.company_id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Validate receiver_id
    const parsedReceiverId = parseInt(receiver_id);
    if (isNaN(parsedReceiverId) || parsedReceiverId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid receiver ID'
      });
    }

    // Prevent sending to yourself
    if (parsedReceiverId === senderId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot send files to yourself'
      });
    }

    // Verify receiver exists and belongs to same company
    const { User, Friendship } = require('../models');
    const receiver = await User.findOne({
      where: { id: parsedReceiverId, company_id: companyId, is_active: true }
    });

    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: 'Recipient not found'
      });
    }

    // Verify they are friends
    const friendship = await Friendship.findOne({
      where: {
        company_id: companyId,
        [require('sequelize').Op.or]: [
          { sender_id: senderId, receiver_id: parsedReceiverId },
          { sender_id: parsedReceiverId, receiver_id: senderId }
        ],
        status: 'accepted'
      }
    });

    if (!friendship) {
      return res.status(403).json({
        success: false,
        message: 'You can only send files to friends'
      });
    }

    // Determine message type if not provided
    let msgType = message_type;
    if (!msgType) {
      const mimeType = req.file.mimetype;
      if (mimeType.startsWith('image/')) {
        msgType = 'image';
      } else {
        msgType = 'file';
      }
    }

    // Create message with encrypted filename (using filename as content)
    const { Message, AuditLog } = require('../models');
    const { encryptMessage } = require('../config/encryption');
    const logger = require('../config/logger');

    const encryptedData = encryptMessage(req.file.filename);

    const newMessage = await Message.create({
      company_id: companyId,
      sender_id: senderId,
      receiver_id: parsedReceiverId,
      encrypted_message: encryptedData.encrypted,
      iv: encryptedData.iv,
      message_type: msgType,
      file_url: `/uploads/${req.file.filename}`
    });

    await AuditLog.create({
      user_id: senderId,
      action: 'UPLOAD_FILE',
      resource_type: 'message',
      resource_id: newMessage.id,
      details: { 
        receiver_id: parsedReceiverId, 
        file_type: msgType,
        filename: req.file.filename
      },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      status: 'success'
    });

    logger.info('File uploaded and message sent', {
      userId: senderId,
      receiverId: parsedReceiverId,
      messageId: newMessage.id,
      fileType: msgType
    });

    // Return the message data
    const messageData = newMessage.toJSON();
    messageData.decrypted_message = req.file.originalname;

    res.status(201).json({
      success: true,
      message: 'File uploaded successfully',
      data: { message: messageData }
    });
  } catch (error) {
    console.error('Upload error:', error);
    const logger = require('../config/logger');
    logger.error('File upload error', {
      userId: req.user.id,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Failed to upload file'
    });
  }
});

/**
 * PUT /api/messages/:messageId/read
 * Mark a message as read
 */
router.put('/:messageId/read', authenticate, companyIsolation, messageController.markAsRead);

/**
 * PUT /api/messages/:messageId
 * Edit a message
 */
router.put('/:messageId', authenticate, companyIsolation, messageController.editMessage);

/**
 * DELETE /api/messages/:messageId
 * Delete a message
 */
router.delete('/:messageId', authenticate, companyIsolation, messageController.deleteMessage);

/**
 * DELETE /api/messages/conversation/:userId
 * Delete entire conversation (soft delete)
 */
router.delete('/conversation/:userId', authenticate, companyIsolation, messageController.deleteConversation);

module.exports = router;
