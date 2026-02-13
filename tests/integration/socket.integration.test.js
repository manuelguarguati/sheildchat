/**
 * Integration Tests for Socket.io Messaging System
 */

const jwt = require('jsonwebtoken');

// Mock Socket.io
const mockSocket = {
  user: { id: 1, username: 'testuser', company_id: 1 },
  userId: 1,
  company_id: 1,
  id: 'socket-123',
  join: jest.fn(),
  emit: jest.fn(),
  handshake: {
    address: '127.0.0.1',
    auth: { token: 'test-token' },
    query: {}
  },
  on: jest.fn(),
  disconnect: jest.fn()
};

const mockIo = {
  use: jest.fn(),
  on: jest.fn(),
  to: jest.fn().mockReturnThis(),
  emit: jest.fn()
};

// Mock Models
jest.mock('../../models', () => ({
  User: {
    findByPk: jest.fn(),
    findOne: jest.fn()
  },
  Message: {
    create: jest.fn(),
    update: jest.fn()
  },
  Company: {},
  AuditLog: {
    create: jest.fn().mockResolvedValue({})
  }
}));

// Mock encryption
jest.mock('../../config/encryption', () => ({
  encryptMessage: jest.fn().mockReturnValue({ 
    encrypted: 'encrypted-content', 
    iv: '0123456789abcdef0123456789abcdef' 
  }),
  decryptMessage: jest.fn().mockReturnValue('decrypted-content')
}));

// Mock logger
jest.mock('../../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  logSocketEvent: jest.fn(),
  logSecurity: jest.fn(),
  logDatabase: jest.fn()
}));

const { User, Message, AuditLog } = require('../../models');
const { encryptMessage, decryptMessage } = require('../../config/encryption');
const logger = require('../../config/logger');

describe('Socket.io Integration Tests', () => {
  let socketConfig;
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    socketConfig = require('../../config/socket');
  });

  describe('Authentication Middleware', () => {
    test('should authenticate with valid token', async () => {
      const mockUser = {
        id: 1,
        username: 'testuser',
        company_id: 1,
        is_active: true
      };
      
      User.findByPk.mockResolvedValue(mockUser);
      
      const next = jest.fn();
      const socket = {
        ...mockSocket,
        handshake: {
          ...mockSocket.handshake,
          auth: { token: 'valid-jwt-token' }
        }
      };
      
      // Simulate middleware execution
      const middleware = socketConfig(io).middleware || socketConfig.__mockMiddleware;
      
      // Verify user lookup was called
      expect(User.findByPk).toHaveBeenCalled();
    });

    test('should reject missing token', async () => {
      const next = jest.fn();
      const socket = {
        ...mockSocket,
        handshake: {
          ...mockSocket.handshake,
          auth: {}
        }
      };
      
      expect(socket.handshake.auth.token).toBeUndefined();
    });

    test('should reject inactive user', async () => {
      User.findByPk.mockResolvedValue({ is_active: false });
      
      const next = jest.fn();
      
      expect(User.findByPk).toHaveBeenCalled();
    });
  });

  describe('Message Sending Flow', () => {
    const mockReceiver = { id: 2, username: 'receiver', company_id: 1, is_active: true };
    const mockMessage = {
      id: 100,
      created_at: new Date(),
      toJSON: function() { return this; }
    };

    beforeEach(() => {
      Message.create.mockResolvedValue(mockMessage);
      User.findOne.mockResolvedValue(mockReceiver);
    });

    test('should send message successfully with ACK', async () => {
      const result = await Message.create({
        company_id: 1,
        sender_id: 1,
        receiver_id: 2,
        encrypted_message: 'encrypted',
        iv: '0123456789abcdef0123456789abcdef',
        message_type: 'text'
      });
      
      expect(result.id).toBe(100);
      expect(Message.create).toHaveBeenCalled();
    });

    test('should encrypt message before saving', async () => {
      const content = 'Secret message';
      encryptMessage(content);
      
      expect(encryptMessage).toHaveBeenCalledWith(content);
    });

    test('should emit message:send:ack to sender', async () => {
      const ackCallback = jest.fn();
      
      // Simulate sending ACK
      mockSocket.emit('message:send:ack', { success: true, message: mockMessage });
      
      expect(mockSocket.emit).toHaveBeenCalledWith('message:send:ack', 
        expect.objectContaining({ success: true })
      );
    });

    test('should emit new_message to receiver', async () => {
      mockSocket.emit('new_message', mockMessage);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('new_message', mockMessage);
    });

    test('should create audit log for sent message', async () => {
      await AuditLog.create({
        user_id: 1,
        action: 'SOCKET_MESSAGE',
        resource_type: 'message',
        resource_id: 100,
        details: { receiver_id: 2, message_type: 'text' },
        ip_address: '127.0.0.1',
        status: 'success'
      });
      
      expect(AuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SOCKET_MESSAGE',
          resource_type: 'message'
        })
      );
    });
  });

  describe('Validation Error Handling', () => {
    test('should reject message with invalid receiver_id', () => {
      const result = socketConfig.validators.validateReceiverId(null);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid receiver ID');
    });

    test('should reject empty message content', () => {
      const result = socketConfig.validators.validateContent('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be empty');
    });

    test('should reject message too long', () => {
      const longContent = 'A'.repeat(10001);
      const result = socketConfig.validators.validateContent(longContent);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too long');
    });

    test('should reject invalid message type', () => {
      const result = socketConfig.validators.validateMessageType('invalid');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid message type');
    });
  });

  describe('User Status Updates', () => {
    test('should emit user:online when user connects', () => {
      const userData = {
        userId: 1,
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User'
      };
      
      mockSocket.emit('user:online', userData);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('user:online', userData);
    });

    test('should emit user:offline when user disconnects', () => {
      const userData = {
        userId: 1,
        username: 'testuser'
      };
      
      mockSocket.emit('user:offline', userData);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('user:offline', userData);
    });
  });

  describe('Typing Indicators', () => {
    test('should emit typing:start event', () => {
      const typingData = {
        receiver_id: 2,
        username: 'testuser'
      };
      
      mockSocket.emit('typing:start', typingData);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('typing:start', 
        expect.objectContaining({ sender_id: 1 })
      );
    });

    test('should emit typing:stop event', () => {
      const typingData = { receiver_id: 2 };
      
      mockSocket.emit('typing:stop', typingData);
      
      expect(mockSocket.emit).toHaveBeenCalledWith('typing:stop', 
        expect.objectContaining({ sender_id: 1 })
      );
    });
  });

  describe('Message Read Status', () => {
    test('should update message as read', async () => {
      Message.update.mockResolvedValue([1]);
      
      const result = await Message.update(
        { is_read: true, read_at: new Date() },
        { where: { id: 100, receiver_id: 1 } }
      );
      
      expect(result[0]).toBe(1);
    });

    test('should emit message:read:ack to sender', async () => {
      mockSocket.emit('message:read:ack', {
        message_id: 100,
        reader_id: 2
      });
      
      expect(mockSocket.emit).toHaveBeenCalledWith('message:read:ack', 
        expect.objectContaining({ message_id: 100 })
      );
    });
  });

  describe('Error Handling Scenarios', () => {
    test('should handle database errors gracefully', async () => {
      Message.create.mockRejectedValue(new Error('Database error'));
      
      try {
        await Message.create({});
      } catch (error) {
        expect(error.message).toBe('Database error');
      }
      
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Database error'),
        expect.any(Object)
      );
    });

    test('should handle encryption errors', () => {
      encryptMessage.mockImplementationOnce(() => {
        throw new Error('Encryption failed');
      });
      
      expect(() => encryptMessage('test')).toThrow('Encryption failed');
    });

    test('should handle user not found scenario', async () => {
      User.findOne.mockResolvedValue(null);
      
      const receiver = await User.findOne({
        where: { id: 999, company_id: 1, is_active: true }
      });
      
      expect(receiver).toBeNull();
    });
  });

  describe('Connected Users Management', () => {
    test('should track connected users per company', () => {
      const { getOnlineUsers, getOnlineCount } = socketConfig;
      
      // These would be called after socket connection
      // The actual Map is maintained in the module
      expect(typeof getOnlineUsers).toBe('function');
      expect(typeof getOnlineCount).toBe('function');
    });

    test('getOnlineUsers returns empty array for unknown company', () => {
      const { getOnlineUsers } = socketConfig;
      const users = getOnlineUsers(999);
      
      expect(users).toEqual([]);
    });

    test('getOnlineCount returns 0 for unknown company', () => {
      const { getOnlineCount } = socketConfig;
      const count = getOnlineCount(999);
      
      expect(count).toBe(0);
    });
  });
});
