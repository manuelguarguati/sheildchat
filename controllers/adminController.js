const { User, Company, AuditLog, Message } = require('../models');
const { Op } = require('sequelize');

/**
 * GET /api/admin/users
 * Get all users in the company (admin only)
 */
exports.getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', role = '', active = '' } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = { company_id: req.company_id };

    if (search) {
      whereClause[Op.or] = [
        { username: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { first_name: { [Op.like]: `%${search}%` } },
        { last_name: { [Op.like]: `%${search}%` } }
      ];
    }

    if (role) whereClause.role = role;
    if (active !== '') whereClause.is_active = active === 'true';

    const { count, rows } = await User.findAndCountAll({
      where: whereClause,
      attributes: { exclude: ['password_hash'] },
      limit: parseInt(limit),
      offset: offset,
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        users: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Admin get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get users.'
    });
  }
};

/**
 * POST /api/admin/users
 * Create a new user (admin only)
 */
exports.createUser = async (req, res) => {
  try {
    const { username, email, password, role = 'user', first_name, last_name } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required.'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters.'
      });
    }

    // Check if username already exists in company
    const existingUser = await User.findOne({
      where: { username, company_id: req.company_id }
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Username already exists in this company.'
      });
    }

    const user = await User.create({
      company_id: req.company_id,
      username,
      email,
      password_hash: password,
      role,
      first_name,
      last_name
    });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'CREATE_USER',
      resource_type: 'user',
      resource_id: user.id,
      details: { username, role, email },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      status: 'success'
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully.',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          first_name: user.first_name,
          last_name: user.last_name
        }
      }
    });
  } catch (error) {
    console.error('Admin create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user.'
    });
  }
};

/**
 * PUT /api/admin/users/:id
 * Update a user (admin only)
 */
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, role, first_name, last_name, is_active } = req.body;

    const user = await User.findOne({
      where: { id, company_id: req.company_id }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    // Prevent self-deactivation
    if (user.id === req.user.id && is_active === false) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate your own account.'
      });
    }

    const updates = {};
    if (email !== undefined) updates.email = email;
    if (role !== undefined) updates.role = role;
    if (first_name !== undefined) updates.first_name = first_name;
    if (last_name !== undefined) updates.last_name = last_name;
    if (is_active !== undefined) updates.is_active = is_active;

    await user.update(updates);

    await AuditLog.create({
      user_id: req.user.id,
      action: 'UPDATE_USER',
      resource_type: 'user',
      resource_id: user.id,
      details: { updates: Object.keys(updates) },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      status: 'success'
    });

    res.json({
      success: true,
      message: 'User updated successfully.',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          first_name: user.first_name,
          last_name: user.last_name,
          is_active: user.is_active
        }
      }
    });
  } catch (error) {
    console.error('Admin update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user.'
    });
  }
};

/**
 * DELETE /api/admin/users/:id
 * Delete a user (admin only)
 */
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findOne({
      where: { id, company_id: req.company_id }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.'
      });
    }

    // Prevent self-deletion
    if (user.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account.'
      });
    }

    await user.destroy();

    await AuditLog.create({
      user_id: req.user.id,
      action: 'DELETE_USER',
      resource_type: 'user',
      resource_id: parseInt(id),
      details: { deleted_username: user.username },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      status: 'success'
    });

    res.json({
      success: true,
      message: 'User deleted successfully.'
    });
  } catch (error) {
    console.error('Admin delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user.'
    });
  }
};

/**
 * GET /api/admin/audit-logs
 * Get audit logs for the company
 */
exports.getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, action = '', user_id = '' } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    
    if (action) whereClause.action = { [Op.like]: `%${action}%` };
    if (user_id) whereClause.user_id = user_id;

    const { count, rows } = await AuditLog.findAndCountAll({
      where: whereClause,
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'username'],
        where: { company_id: req.company_id }
      }],
      limit: parseInt(limit),
      offset: offset,
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        logs: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Admin get audit logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get audit logs.'
    });
  }
};

/**
 * GET /api/admin/stats
 * Get company statistics
 */
exports.getStats = async (req, res) => {
  try {
    const totalUsers = await User.count({
      where: { company_id: req.company_id }
    });

    const activeUsers = await User.count({
      where: { company_id: req.company_id, is_active: true }
    });

    const adminCount = await User.count({
      where: { company_id: req.company_id, role: 'admin' }
    });

    const totalMessages = await Message.count({
      where: { company_id: req.company_id }
    });

    const unreadMessages = await Message.count({
      where: { 
        company_id: req.company_id,
        receiver_id: req.user.id,
        is_read: false
      }
    });

    const recentLogs = await AuditLog.count({
      where: {
        created_at: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      },
      include: [{
        model: User,
        as: 'user',
        where: { company_id: req.company_id }
      }]
    });

    res.json({
      success: true,
      data: {
        stats: {
          totalUsers,
          activeUsers,
          adminCount,
          totalMessages,
          unreadMessages,
          recentActivity: recentLogs
        }
      }
    });
  } catch (error) {
    console.error('Admin get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get statistics.'
    });
  }
};
