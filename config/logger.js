/**
 * Structured Logger Module
 * Provides structured logging for the application
 */

const fs = require('fs');
const path = require('path');

// Log levels enum
const LOG_LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

// Get log level from environment
const currentLevel = process.env.LOG_LEVEL || 'INFO';

// Level hierarchy
const levelHierarchy = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

/**
 * Check if a log level should be output
 */
function shouldLog(level) {
  return levelHierarchy[level] >= levelHierarchy[currentLevel];
}

/**
 * Format log entry with structured data
 */
function formatLog(level, message, meta = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: 'shield-chat',
    ...meta
  };
  
  return JSON.stringify(logEntry);
}

/**
 * Log error messages
 */
function error(message, meta = {}) {
  if (!shouldLog(LOG_LEVELS.ERROR)) return;
  
  const logEntry = formatLog(LOG_LEVELS.ERROR, message, meta);
  console.error(logEntry);
  
  // In production, you could send to external logging service
  if (process.env.NODE_ENV === 'production') {
    // sendToExternalLogger(logEntry);
  }
}

/**
 * Log warning messages
 */
function warn(message, meta = {}) {
  if (!shouldLog(LOG_LEVELS.WARN)) return;
  
  const logEntry = formatLog(LOG_LEVELS.WARN, message, meta);
  console.warn(logEntry);
}

/**
 * Log info messages
 */
function info(message, meta = {}) {
  if (!shouldLog(LOG_LEVELS.INFO)) return;
  
  const logEntry = formatLog(LOG_LEVELS.INFO, message, meta);
  console.log(logEntry);
}

/**
 * Log debug messages
 */
function debug(message, meta = {}) {
  if (!shouldLog(LOG_LEVELS.DEBUG)) return;
  
  const logEntry = formatLog(LOG_LEVELS.DEBUG, message, meta);
  console.log(logEntry);
}

/**
 * Log socket events
 */
function logSocketEvent(event, userId, meta = {}) {
  debug(`Socket event: ${event}`, {
    event,
    userId,
    ...meta
  });
}

/**
 * Log security events
 */
function logSecurity(event, userId, meta = {}) {
  warn(`Security event: ${event}`, {
    event,
    userId,
    security: true,
    ...meta
  });
}

/**
 * Log database operations
 */
function logDatabase(operation, model, meta = {}) {
  debug(`Database ${operation}`, {
    database: {
      operation,
      model
    },
    ...meta
  });
}

module.exports = {
  LOG_LEVELS,
  error,
  warn,
  info,
  debug,
  logSocketEvent,
  logSecurity,
  logDatabase
};
