const jwt = require('jsonwebtoken');
const { User, AuditLog } = require('../models');

/**
 * JWT Authentication Middleware
 * Validates JWT token and attaches user to request
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access denied. No token provided.' 
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findByPk(decoded.user_id, {
      attributes: { exclude: ['password_hash'] }
    });

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token. User not found.' 
      });
    }

    if (!user.is_active) {
      return res.status(403).json({ 
        success: false, 
        message: 'Account is deactivated.' 
      });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token expired.' 
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token.' 
      });
    }
    
    console.error('Auth middleware error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Authentication failed.' 
    });
  }
};

/**
 * Company Isolation Middleware
 * Ensures all database operations are scoped to the user's company
 */
const companyIsolation = async (req, res, next) => {
  try {
    if (!req.user || !req.user.company_id) {
      return res.status(400).json({ 
        success: false, 
        message: 'Company context not established.' 
      });
    }

    // Attach company_id to request for easy access
    req.company_id = req.user.company_id;
    
    // For Socket.io, we'll handle company isolation differently
    next();
  } catch (error) {
    console.error('Company isolation error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Company isolation check failed.' 
    });
  }
};

/**
 * Role-based Authorization Middleware
 * @param {string[]} allowedRoles - Array of allowed roles
 */
const authorize = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required.' 
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Insufficient permissions.' 
      });
    }

    next();
  };
};

/**
 * Audit Logger Middleware
 */
const auditLogger = (action, resourceType) => {
  return async (req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(data) {
      const status = res.statusCode >= 200 && res.statusCode < 400 ? 'success' : 'failure';
      
      AuditLog.create({
        user_id: req.user ? req.user.id : null,
        action: action,
        resource_type: resourceType,
        resource_id: req.params.id || null,
        details: {
          method: req.method,
          path: req.path,
          query: req.query,
          body: sanitizeBody(req.body)
        },
        ip_address: req.ip || req.connection.remoteAddress,
        user_agent: req.headers['user-agent'],
        status: status
      }).catch(err => console.error('Audit log error:', err));
      
      originalSend.call(this, data);
    };
    
    next();
  };
};

// Helper to sanitize body for audit logs
function sanitizeBody(body) {
  if (!body) return null;
  const sanitized = { ...body };
  if (sanitized.password) sanitized.password = '[REDACTED]';
  if (sanitized.token) sanitized.token = '[REDACTED]';
  return sanitized;
}

module.exports = {
  authenticate,
  companyIsolation,
  authorize,
  auditLogger
};
