const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Friendship = sequelize.define('Friendship', {
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
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'pending',
      allowNull: false,
      validate: {
        isIn: { args: [['pending', 'accepted', 'rejected']], msg: 'Invalid status' }
      }
    }
  }, {
    tableName: 'friendships',
    underscored: true,
    timestamps: true,
    indexes: [
      {
        name: 'friendships_company_id_idx',
        fields: ['company_id']
      },
      {
        name: 'friendships_sender_receiver_idx',
        fields: ['sender_id', 'receiver_id']
      },
      {
        name: 'friendships_status_idx',
        fields: ['status']
      }
    ]
  });

  return Friendship;
};
