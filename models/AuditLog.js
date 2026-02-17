const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AuditLog = sequelize.define('AuditLog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: { msg: 'Action is required' },
        len: { args: [3, 100], msg: 'Action must be between 3 and 100 characters' }
      }
    },
    resource_type: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    resource_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    details: {
      type: DataTypes.JSON,
      allowNull: true
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true
    },
    user_agent: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'success',
      validate: {
        isIn: { args: [['success', 'failure', 'warning']], msg: 'Invalid status' }
      }
    }
  }, {
    tableName: 'audit_logs',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['action'] }
    ]
  });

  return AuditLog;
};
