/**
 * Unit Tests for Encryption Module
 */

const { encryptMessage, decryptMessage, testDecryption } = require('../../config/encryption');

describe('Encryption Module', () => {
  describe('encryptMessage', () => {
    test('should encrypt a valid message', () => {
      const plaintext = 'Hello, World!';
      const result = encryptMessage(plaintext);
      
      expect(result).toHaveProperty('encrypted');
      expect(result).toHaveProperty('iv');
      expect(typeof result.encrypted).toBe('string');
      expect(result.encrypted.length).toBeGreaterThan(0);
      expect(result.iv.length).toBe(32); // 16 bytes in hex
    });

    test('should produce different IV for same message', () => {
      const plaintext = 'Same message';
      const result1 = encryptMessage(plaintext);
      const result2 = encryptMessage(plaintext);
      
      expect(result1.encrypted).not.toBe(result2.encrypted);
      expect(result1.iv).not.toBe(result2.iv);
    });

    test('should throw error for empty string', () => {
      expect(() => encryptMessage('')).toThrow('cannot be empty');
    });

    test('should throw error for non-string input', () => {
      expect(() => encryptMessage(123)).toThrow('must be a string');
      expect(() => encryptMessage(null)).toThrow('must be a string');
      expect(() => encryptMessage(undefined)).toThrow('must be a string');
      expect(() => encryptMessage({})).toThrow('must be a string');
    });

    test('should handle special characters', () => {
      const specialChars = 'Hello! @#$%^&*()_+{}[]|\\:";\'<>?,./`~中文🎉';
      const result = encryptMessage(specialChars);
      
      expect(result.encrypted).toBeTruthy();
      expect(result.iv).toBeTruthy();
    });

    test('should handle long messages', () => {
      const longMessage = 'A'.repeat(10000);
      const result = encryptMessage(longMessage);
      
      expect(result.encrypted).toBeTruthy();
      expect(result.encrypted.length).toBeGreaterThan(longMessage.length);
    });

    test('should handle unicode characters', () => {
      const unicodeMessage = 'Hello 🌍 你好 مرحبا Привет';
      const result = encryptMessage(unicodeMessage);
      
      expect(result.encrypted).toBeTruthy();
    });
  });

  describe('decryptMessage', () => {
    test('should decrypt an encrypted message correctly', () => {
      const originalText = 'Secret message';
      const { encrypted, iv } = encryptMessage(originalText);
      const decrypted = decryptMessage(encrypted, iv);
      
      expect(decrypted).toBe(originalText);
    });

    test('should throw error for invalid encrypted text type', () => {
      expect(() => decryptMessage(123, 'abc')).toThrow('must be a string');
      expect(() => decryptMessage(null, 'abc')).toThrow('must be a string');
    });

    test('should throw error for invalid IV type', () => {
      const { encrypted, iv } = encryptMessage('test');
      expect(() => decryptMessage(encrypted, 123)).toThrow('must be a string');
    });

    test('should throw error for invalid hex format in encrypted text', () => {
      expect(() => decryptMessage('not-hex!!', '0123456789abcdef0123456789abcdef'))
        .toThrow('must be valid hex');
    });

    test('should throw error for invalid hex format in IV', () => {
      const { encrypted } = encryptMessage('test');
      expect(() => decryptMessage(encrypted, 'not-hex!!'))
        .toThrow('must be valid hex');
    });

    test('should throw error for wrong IV length', () => {
      const { encrypted } = encryptMessage('test');
      expect(() => decryptMessage(encrypted, 'abc')) // too short
        .toThrow('must be 32 hex characters');
    });

    test('should throw error for tampered encrypted text', () => {
      const { encrypted, iv } = encryptMessage('test');
      const tampered = encrypted.slice(0, -2) + 'ff';
      expect(() => decryptMessage(tampered, iv)).toThrow();
    });

    test('should throw error for tampered IV', () => {
      const { encrypted, iv } = encryptMessage('test');
      const tamperedIv = iv.slice(0, -2) + 'ff';
      expect(() => decryptMessage(encrypted, tamperedIv)).toThrow();
    });
  });

  describe('testDecryption', () => {
    test('should return true for valid encrypted message', () => {
      const { encrypted, iv } = encryptMessage('test');
      expect(testDecryption(encrypted, iv)).toBe(true);
    });

    test('should return false for invalid encrypted message', () => {
      const { iv } = encryptMessage('test');
      expect(testDecryption('invalid-hex', iv)).toBe(false);
    });

    test('should return false for tampered message', () => {
      const { encrypted, iv } = encryptMessage('test');
      const tampered = encrypted.slice(0, -2) + 'ff';
      expect(testDecryption(tampered, iv)).toBe(false);
    });
  });

  describe('Encryption/Decryption Round-trip', () => {
    test('should preserve message integrity for various message types', () => {
      const messages = [
        'Simple text',
        'Multi\nline\ntext',
        'Text with "quotes" and \'apostrophes\'',
        'Special: <>&"\'',
        '_numbers_123',
        ' '.repeat(10), // Multiple spaces
        '\t\tTabs\t\t',
        'Emoji: 🚀🔥💻🎉',
        'Mixed: Hello 你好 مرحبا 123',
        String.fromCharCode(0) + 'Binary data' // Null character
      ];

      messages.forEach(message => {
        const { encrypted, iv } = encryptMessage(message);
        const decrypted = decryptMessage(encrypted, iv);
        expect(decrypted).toBe(message);
      });
    });
  });
});
