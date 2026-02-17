const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Company = sequelize.define('Company', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: { msg: 'Company name is required' },
        len: { args: [2, 100], msg: 'Company name must be between 2 and 100 characters' }
      }
    },
    domain: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
      validate: {
        isDomain(value) {
          if (value && !/^[a-zA-Z0-9][a-zA-Z0-9-]*(\.[a-zA-Z]{2,})+$/.test(value)) {
            throw new Error('Invalid domain format');
          }
        }
      }
    },
    settings: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {}
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'companies',
    underscored: true,
    timestamps: true,
    indexes: [
      { unique: true, fields: ['domain'] }
    ]
  });

  return Company;
};
