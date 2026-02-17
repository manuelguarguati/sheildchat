/**
 * Unit Tests for Logger Module
 */

const logger = require('../../config/logger');

// Mock console methods
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();

describe('Logger Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('LOG_LEVELS', () => {
    test('should have all expected log levels', () => {
      expect(logger.LOG_LEVELS.ERROR).toBe('ERROR');
      expect(logger.LOG_LEVELS.WARN).toBe('WARN');
      expect(logger.LOG_LEVELS.INFO).toBe('INFO');
      expect(logger.LOG_LEVELS.DEBUG).toBe('DEBUG');
    });
  });

  describe('error', () => {
    test('should log error messages with structured format', () => {
      logger.error('Test error message', { userId: 123 });
      
      expect(mockConsoleError).toHaveBeenCalled();
      const loggedOutput = mockConsoleError.mock.calls[0][0];
      const parsed = JSON.parse(loggedOutput);
      
      expect(parsed.level).toBe('ERROR');
      expect(parsed.message).toBe('Test error message');
      expect(parsed.userId).toBe(123);
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.service).toBe('shield-chat');
    });

    test('should log without meta', () => {
      logger.error('Simple error');
      
      const loggedOutput = mockConsoleError.mock.calls[0][0];
      const parsed = JSON.parse(loggedOutput);
      
      expect(parsed.message).toBe('Simple error');
    });
  });

  describe('warn', () => {
    test('should log warning messages', () => {
      logger.warn('Test warning', { code: 'WARN001' });
      
      expect(mockConsoleWarn).toHaveBeenCalled();
      const loggedOutput = mockConsoleWarn.mock.calls[0][0];
      const parsed = JSON.parse(loggedOutput);
      
      expect(parsed.level).toBe('WARN');
      expect(parsed.message).toBe('Test warning');
    });
  });

  describe('info', () => {
    test('should log info messages', () => {
      logger.info('User logged in', { userId: 456 });
      
      expect(mockConsoleLog).toHaveBeenCalled();
      const loggedOutput = mockConsoleLog.mock.calls[0][0];
      const parsed = JSON.parse(loggedOutput);
      
      expect(parsed.level).toBe('INFO');
      expect(parsed.message).toBe('User logged in');
    });
  });

  describe('debug', () => {
    test('should log debug messages', () => {
      logger.debug('Debug info', { detail: 'test' });
      
      expect(mockConsoleLog).toHaveBeenCalled();
      const loggedOutput = mockConsoleLog.mock.calls[0][0];
      const parsed = JSON.parse(loggedOutput);
      
      expect(parsed.level).toBe('DEBUG');
    });
  });

  describe('logSocketEvent', () => {
    test('should log socket events with debug level', () => {
      logger.logSocketEvent('message:send', 123, { messageId: 456 });
      
      const loggedOutput = mockConsoleLog.mock.calls[0][0];
      const parsed = JSON.parse(loggedOutput);
      
      expect(parsed.level).toBe('DEBUG');
      expect(parsed.message).toContain('Socket event: message:send');
      expect(parsed.userId).toBe(123);
      expect(parsed.messageId).toBe(456);
    });
  });

  describe('logSecurity', () => {
    test('should log security events with warning level', () => {
      logger.logSecurity('AUTH_FAILED', 123, { ip: '192.168.1.1' });
      
      const loggedOutput = mockConsoleWarn.mock.calls[0][0];
      const parsed = JSON.parse(loggedOutput);
      
      expect(parsed.level).toBe('WARN');
      expect(parsed.message).toContain('Security event: AUTH_FAILED');
      expect(parsed.security).toBe(true);
      expect(parsed.userId).toBe(123);
    });
  });

  describe('logDatabase', () => {
    test('should log database operations', () => {
      logger.logDatabase('INSERT', 'Message', { affectedRows: 1 });
      
      const loggedOutput = mockConsoleLog.mock.calls[0][0];
      const parsed = JSON.parse(loggedOutput);
      
      expect(parsed.database.operation).toBe('INSERT');
      expect(parsed.database.model).toBe('Message');
      expect(parsed.affectedRows).toBe(1);
    });
  });

  describe('Structured Log Format', () => {
    test('should include all required fields', () => {
      logger.info('Test', { custom: 'data' });
      
      const loggedOutput = mockConsoleLog.mock.calls[0][0];
      const parsed = JSON.parse(loggedOutput);
      
      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('level', 'INFO');
      expect(parsed).toHaveProperty('message', 'Test');
      expect(parsed).toHaveProperty('service', 'shield-chat');
      expect(parsed).toHaveProperty('custom', 'data');
    });

    test('should have valid ISO timestamp', () => {
      logger.info('Timestamp test');
      
      const loggedOutput = mockConsoleLog.mock.calls[0][0];
      const parsed = JSON.parse(loggedOutput);
      
      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
