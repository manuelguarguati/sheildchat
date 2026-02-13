/**
 * Unit Tests for Socket Validators
 */

const { validators } = require('../../config/socket');

describe('Socket Validators', () => {
  describe('validateSenderId', () => {
    test('should accept valid sender ID', () => {
      expect(validators.validateSenderId(123)).toEqual({ valid: true });
      expect(validators.validateSenderId(1)).toEqual({ valid: true });
      expect(validators.validateSenderId(999999)).toEqual({ valid: true });
    });

    test('should reject null sender ID', () => {
      expect(validators.validateSenderId(null)).toEqual({ 
        valid: false, 
        error: 'Invalid sender ID' 
      });
    });

    test('should reject undefined sender ID', () => {
      expect(validators.validateSenderId(undefined)).toEqual({ 
        valid: false, 
        error: 'Invalid sender ID' 
      });
    });

    test('should reject non-number sender ID', () => {
      expect(validators.validateSenderId('123')).toEqual({ 
        valid: false, 
        error: 'Invalid sender ID' 
      });
      expect(validators.validateSenderId({})).toEqual({ 
        valid: false, 
        error: 'Invalid sender ID' 
      });
    });

    test('should reject non-integer number', () => {
      expect(validators.validateSenderId(123.456)).toEqual({ 
        valid: false, 
        error: 'Invalid sender ID' 
      });
    });

    test('should reject negative numbers', () => {
      expect(validators.validateSenderId(-1)).toEqual({ 
        valid: false, 
        error: 'Invalid sender ID' 
      });
    });
  });

  describe('validateReceiverId', () => {
    test('should accept valid receiver ID', () => {
      expect(validators.validateReceiverId(456)).toEqual({ valid: true });
    });

    test('should reject zero receiver ID', () => {
      expect(validators.validateReceiverId(0)).toEqual({ 
        valid: false, 
        error: 'Receiver ID must be positive' 
      });
    });

    test('should reject negative receiver ID', () => {
      expect(validators.validateReceiverId(-5)).toEqual({ 
        valid: false, 
        error: 'Receiver ID must be positive' 
      });
    });

    test('should reject invalid types', () => {
      expect(validators.validateReceiverId('abc')).toEqual({ 
        valid: false, 
        error: 'Invalid receiver ID' 
      });
      expect(validators.validateReceiverId(null)).toEqual({ 
        valid: false, 
        error: 'Invalid receiver ID' 
      });
    });
  });

  describe('validateContent', () => {
    test('should accept valid content', () => {
      expect(validators.validateContent('Hello world')).toEqual({ 
        valid: true, 
        trimmed: 'Hello world' 
      });
    });

    test('should trim whitespace', () => {
      expect(validators.validateContent('  Hello  ')).toEqual({ 
        valid: true, 
        trimmed: 'Hello' 
      });
    });

    test('should reject empty string after trim', () => {
      expect(validators.validateContent('   ')).toEqual({ 
        valid: false, 
        error: 'Message content cannot be empty' 
      });
    });

    test('should reject null content', () => {
      expect(validators.validateContent(null)).toEqual({ 
        valid: false, 
        error: 'Message content is required' 
      });
    });

    test('should reject undefined content', () => {
      expect(validators.validateContent(undefined)).toEqual({ 
        valid: false, 
        error: 'Message content is required' 
      });
    });

    test('should reject non-string content', () => {
      expect(validators.validateContent(123)).toEqual({ 
        valid: false, 
        error: 'Message content is required' 
      });
    });

    test('should reject too long content', () => {
      const tooLong = 'A'.repeat(10001);
      expect(validators.validateContent(tooLong)).toEqual({ 
        valid: false, 
        error: expect.stringContaining('Message too long') 
      });
    });

    test('should accept content at max length', () => {
      const maxLength = 'A'.repeat(10000);
      expect(validators.validateContent(maxLength)).toEqual({ 
        valid: true, 
        trimmed: maxLength 
      });
    });
  });

  describe('validateMessageType', () => {
    test('should accept valid message types', () => {
      expect(validators.validateMessageType('text')).toEqual({ 
        valid: true, 
        value: 'text' 
      });
      expect(validators.validateMessageType('image')).toEqual({ 
        valid: true, 
        value: 'image' 
      });
      expect(validators.validateMessageType('file')).toEqual({ 
        valid: true, 
        value: 'file' 
      });
      expect(validators.validateMessageType('audio')).toEqual({ 
        valid: true, 
        value: 'audio' 
      });
      expect(validators.validateMessageType('video')).toEqual({ 
        valid: true, 
        value: 'video' 
      });
    });

    test('should default to text when undefined', () => {
      expect(validators.validateMessageType(undefined)).toEqual({ 
        valid: true, 
        value: 'text' 
      });
      expect(validators.validateMessageType(null)).toEqual({ 
        valid: true, 
        value: 'text' 
      });
      expect(validators.validateMessageType('')).toEqual({ 
        valid: true, 
        value: 'text' 
      });
    });

    test('should reject invalid message types', () => {
      expect(validators.validateMessageType('invalid')).toEqual({ 
        valid: false, 
        error: expect.stringContaining('Invalid message type') 
      });
      expect(validators.validateMessageType('document')).toEqual({ 
        valid: false, 
        error: expect.stringContaining('Invalid message type') 
      });
    });
  });

  describe('validateMessagePayload', () => {
    test('should accept valid payload', () => {
      const validPayload = {
        receiver_id: 123,
        content: 'Hello',
        message_type: 'text'
      };
      
      const result = validators.validateMessagePayload(validPayload);
      
      expect(result.valid).toBe(true);
      expect(result.data.receiver_id).toBe(123);
      expect(result.data.content).toBe('Hello');
      expect(result.data.message_type).toBe('text');
    });

    test('should accept payload without message_type', () => {
      const payload = {
        receiver_id: 123,
        content: 'Hello'
      };
      
      const result = validators.validateMessagePayload(payload);
      
      expect(result.valid).toBe(true);
      expect(result.data.message_type).toBe('text');
    });

    test('should reject non-object payload', () => {
      expect(validators.validateMessagePayload('string')).toEqual({ 
        valid: false, 
        errors: ['Invalid data format'] 
      });
      expect(validators.validateMessagePayload(null)).toEqual({ 
        valid: false, 
        errors: ['Invalid data format'] 
      });
    });

    test('should collect multiple validation errors', () => {
      const invalidPayload = {
        receiver_id: null,
        content: '',
        message_type: 'invalid'
      };
      
      const result = validators.validateMessagePayload(invalidPayload);
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });

    test('should reject payload without receiver_id', () => {
      const payload = { content: 'Hello' };
      
      const result = validators.validateMessagePayload(payload);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid receiver ID');
    });

    test('should reject payload without content', () => {
      const payload = { receiver_id: 123 };
      
      const result = validators.validateMessagePayload(payload);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Message content is required');
    });

    test('should handle numeric receiver_id as string', () => {
      const payload = {
        receiver_id: '456',
        content: 'Test'
      };
      
      const result = validators.validateMessagePayload(payload);
      
      expect(result.valid).toBe(true);
      expect(result.data.receiver_id).toBe(456);
    });
  });
});
