const crypto = require('crypto');

const algorithm = 'aes-256-cbc';

// Generar clave de 32 bytes desde cualquier string del .env
const key = crypto
  .createHash('sha256')
  .update(process.env.ENCRYPTION_KEY || 'shield_chat_super_secret_2026')
  .digest();

/**
 * Encrypt a message with AES-256-CBC
 * @param {string} text - Plain text message to encrypt
 * @returns {Object} - { encrypted: string, iv: string }
 * @throws {Error} - If encryption fails
 */
function encryptMessage(text) {
  // Validate input
  if (typeof text !== 'string') {
    throw new Error('Invalid input: text must be a string');
  }

  if (text.length === 0) {
    throw new Error('Invalid input: text cannot be empty');
  }

  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
      encrypted,
      iv: iv.toString('hex')
    };
  } catch (error) {
    // Wrap error with context
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt a message with AES-256-CBC
 * @param {string} encryptedText - Encrypted message in hex format
 * @param {string} ivHex - Initialization vector in hex format
 * @returns {string} - Decrypted plain text
 * @throws {Error} - If decryption fails (invalid data or tampered message)
 */
function decryptMessage(encryptedText, ivHex) {
  // Validate input types
  if (typeof encryptedText !== 'string') {
    throw new Error('Invalid input: encryptedText must be a string');
  }

  if (typeof ivHex !== 'string') {
    throw new Error('Invalid input: ivHex must be a string');
  }

  // Validate hex format
  if (!/^[0-9a-fA-F]+$/.test(encryptedText)) {
    throw new Error('Invalid input: encryptedText must be valid hex');
  }

  if (!/^[0-9a-fA-F]+$/.test(ivHex)) {
    throw new Error('Invalid input: ivHex must be valid hex');
  }

  // Validate IV length (16 bytes = 32 hex chars)
  if (ivHex.length !== 32) {
    throw new Error('Invalid IV length: must be 32 hex characters (16 bytes)');
  }

  try {
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);

    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    // Common decryption errors include:
    // - Bad padding (tampered message or wrong key)
    // - Invalid key/IV combination
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * Generate a random encryption key
 * Useful for key rotation or testing
 * @returns {Buffer} - 32-byte random key
 */
function generateKey() {
  return crypto.randomBytes(32);
}

/**
 * Test if a key/IV pair produces valid decryption
 * @param {string} encryptedText - Encrypted message
 * @param {string} ivHex - Initialization vector
 * @returns {boolean} - True if decryption succeeds
 */
function testDecryption(encryptedText, ivHex) {
  try {
    decryptMessage(encryptedText, ivHex);
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = {
  encryptMessage,
  decryptMessage,
  generateKey,
  testDecryption,
  algorithm
};
