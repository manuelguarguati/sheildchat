const jwt = require('jsonwebtoken');
const { User, Company, AuditLog } = require('../models');

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000; // 15 minutes

/**
 * Generate JWT Token
 */
function generateToken(user) {
  return jwt.sign(
    {
      user_id: user.id,
      company_id: user.company_id,
      username: user.username,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
}

/**
 * POST /api/auth/login
 * Authenticate user and return JWT
 */
exports.login = async (req, res) => {
  try {
    const { username, password, companyDomain } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required.'
      });
    }

    // Find user by username and optionally by company domain
    const whereClause = { username };
    if (companyDomain) {
      const company = await Company.findOne({ 
        where: { domain: companyDomain, is_active: true } 
      });
      if (company) {
        whereClause.company_id = company.id;
      } else {
        // Company not found or inactive
        await AuditLog.create({
          user_id: null,
          action: 'LOGIN_FAILED',
          resource_type: 'auth',
          details: { username, reason: 'Company not found or inactive', companyDomain },
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          status: 'failure'
        });
        
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials.'
        });
      }
    }

    const user = await User.findOne({ 
      where: whereClause,
      include: [{ model: Company, as: 'company', attributes: ['id', 'name'] }]
    });

    if (!user) {
      await AuditLog.create({
        user_id: null,
        action: 'LOGIN_FAILED',
        resource_type: 'auth',
        details: { username, reason: 'User not found' },
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        status: 'failure'
      });
      
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.'
      });
    }

    // Check if account is locked
    if (user.isLocked()) {
      const remainingTime = Math.ceil((user.lock_until - new Date()) / 1000 / 60);
      await AuditLog.create({
        user_id: user.id,
        action: 'LOGIN_LOCKED',
        resource_type: 'auth',
        details: { reason: 'Account locked', remaining_minutes: remainingTime },
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        status: 'warning'
      });

      return res.status(423).json({
        success: false,
        message: `Account locked. Try again in ${remainingTime} minutes.`
      });
    }

    // Validate password
    const isValidPassword = await user.validatePassword(password);

    if (!isValidPassword) {
      user.login_attempts += 1;
      
      if (user.login_attempts >= MAX_LOGIN_ATTEMPTS) {
        user.lock_until = new Date(Date.now() + LOCK_TIME);
        user.login_attempts = 0;
        await user.save();
        
        await AuditLog.create({
          user_id: user.id,
          action: 'ACCOUNT_LOCKED',
          resource_type: 'auth',
          details: { reason: 'Max login attempts exceeded' },
          ip_address: req.ip,
          user_agent: req.headers['user-agent'],
          status: 'warning'
        });

        return res.status(423).json({
          success: false,
          message: 'Account locked due to too many failed attempts. Try again in 15 minutes.'
        });
      }
      
      await user.save();
      
      await AuditLog.create({
        user_id: user.id,
        action: 'LOGIN_FAILED',
        resource_type: 'auth',
        details: { reason: 'Invalid password', attempts: user.login_attempts },
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        status: 'failure'
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.'
      });
    }

    // Check if account is active
    if (!user.is_active) {
      await AuditLog.create({
        user_id: user.id,
        action: 'LOGIN_INACTIVE',
        resource_type: 'auth',
        details: { reason: 'Account deactivated' },
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        status: 'failure'
      });

      return res.status(403).json({
        success: false,
        message: 'Account is deactivated.'
      });
    }

    // Successful login
    user.login_attempts = 0;
    user.lock_until = null;
    user.last_login = new Date();
    await user.save();

    const token = generateToken(user);

    await AuditLog.create({
      user_id: user.id,
      action: 'LOGIN_SUCCESS',
      resource_type: 'auth',
      details: { method: 'password' },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      status: 'success'
    });

    res.json({
      success: true,
      message: 'Login successful.',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.'
    });
  }
};

/**
 * GET /api/auth/me
 * Get current user info
 */
exports.getMe = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password_hash'] },
      include: [{ model: Company, as: 'company', attributes: ['id', 'name'] }]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user info.'
    });
  }
};

/**
 * POST /api/auth/logout
 * Logout user (client-side token removal)
 */
exports.logout = async (req, res) => {
  try {
    await AuditLog.create({
      user_id: req.user.id,
      action: 'LOGOUT',
      resource_type: 'auth',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      status: 'success'
    });

    res.json({
      success: true,
      message: 'Logged out successfully.'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed.'
    });
  }
};
