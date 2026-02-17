const { User, AuditLog } = require('../models');

/**
 * GET /api/users
 * Get all users in the company
 */
exports.getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {
      company_id: req.company_id
    };

    if (search) {
      whereClause[require('sequelize').Op.or] = [
        { username: { [require('sequelize').Op.like]: `%${search}%` } },
        { email: { [require('sequelize').Op.like]: `%${search}%` } },
        { first_name: { [require('sequelize').Op.like]: `%${search}%` } },
        { last_name: { [require('sequelize').Op.like]: `%${search}%` } }
      ];
    }

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
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get users.'
    });
  }
};

/**
 * GET /api/users/search
 * Search users by name, email, or username
 */
exports.searchUsers = async (req, res) => {
  try {
    const { name, limit = 20 } = req.query;

    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Search term is required (name parameter)'
      });
    }

    const whereClause = {
      company_id: req.company_id,
      [require('sequelize').Op.or]: [
        { username: { [require('sequelize').Op.like]: `%${name}%` } },
        { email: { [require('sequelize').Op.like]: `%${name}%` } },
        { first_name: { [require('sequelize').Op.like]: `%${name}%` } },
        { last_name: { [require('sequelize').Op.like]: `%${name}%` } }
      ]
    };

    const users = await User.findAll({
      where: whereClause,
      attributes: { exclude: ['password_hash'] },
      limit: parseInt(limit),
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        users: users,
        count: users.length
      }
    });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search users.'
    });
  }
};

/**
 * GET /api/users/:id
 * Get a specific user
 */
exports.getUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findOne({
      where: { id, company_id: req.company_id },
      attributes: { exclude: ['password_hash'] }
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
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user.'
    });
  }
};

/**
 * PUT /api/users/profile
 * Update current user's profile
 */
exports.updateProfile = async (req, res) => {
  try {
    const { first_name, last_name, email, avatar } = req.body;

    const updates = {};
    if (first_name !== undefined) updates.first_name = first_name;
    if (last_name !== undefined) updates.last_name = last_name;
    if (email !== undefined) updates.email = email;
    if (avatar !== undefined) updates.avatar = avatar;

    await req.user.update(updates);

    await AuditLog.create({
      user_id: req.user.id,
      action: 'UPDATE_PROFILE',
      resource_type: 'user',
      resource_id: req.user.id,
      details: { fields: Object.keys(updates) },
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      status: 'success'
    });

    res.json({
      success: true,
      message: 'Profile updated successfully.',
      data: {
        user: {
          id: req.user.id,
          username: req.user.username,
          email: req.user.email,
          first_name: req.user.first_name,
          last_name: req.user.last_name,
          avatar: req.user.avatar
        }
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile.'
    });
  }
};

/**
 * PUT /api/users/password
 * Change password
 */
exports.changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({
        success: false,
        message: 'Current and new password are required.'
      });
    }

    if (new_password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters.'
      });
    }

    const isValid = await req.user.validatePassword(current_password);

    if (!isValid) {
      await AuditLog.create({
        user_id: req.user.id,
        action: 'PASSWORD_CHANGE_FAILED',
        resource_type: 'user',
        resource_id: req.user.id,
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
        status: 'failure'
      });

      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect.'
      });
    }

    req.user.password_hash = new_password;
    await req.user.save();

    await AuditLog.create({
      user_id: req.user.id,
      action: 'PASSWORD_CHANGED',
      resource_type: 'user',
      resource_id: req.user.id,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      status: 'success'
    });

    res.json({
      success: true,
      message: 'Password changed successfully.'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password.'
    });
  }
};
