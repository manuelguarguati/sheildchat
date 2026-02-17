const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Message = sequelize.define('Message', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    company_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    sender_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    receiver_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    encrypted_message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    iv: {
      type: DataTypes.STRING(64),
      allowNull: false
    },
    message_type: {
      type: DataTypes.STRING(20),
      defaultValue: 'text',
      validate: {
        isIn: { args: [['text', 'file', 'image', 'system']], msg: 'Invalid message type' }
      }
    },
    file_url: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    is_read: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    read_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    is_edited: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    edited_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: 'messages',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['company_id'] },
      { fields: ['sender_id'] },
      { fields: ['receiver_id'] }
    ]
  });

  return Message;
};
