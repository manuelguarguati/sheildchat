const sequelize = require('../config/database');

// Import models as factory functions
const CompanyModel = require('./Company');
const UserModel = require('./User');
const MessageModel = require('./Message');
const AuditLogModel = require('./AuditLog');
const FriendshipModel = require('./Friendship');

// Initialize models by passing sequelize instance
const Company = CompanyModel(sequelize);
const User = UserModel(sequelize);
const Message = MessageModel(sequelize);
const AuditLog = AuditLogModel(sequelize);
const Friendship = FriendshipModel(sequelize);

/**
 * MODEL RELATIONS (Multi-tenant Architecture)
 */

// Company relationships
Company.hasMany(User, { foreignKey: 'company_id', as: 'users' });
User.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });

Company.hasMany(Message, { foreignKey: 'company_id', as: 'messages' });
Message.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });

// User relationships
User.hasMany(Message, { foreignKey: 'sender_id', as: 'sentMessages' });
Message.belongsTo(User, { foreignKey: 'sender_id', as: 'sender' });

User.hasMany(Message, { foreignKey: 'receiver_id', as: 'receivedMessages' });
Message.belongsTo(User, { foreignKey: 'receiver_id', as: 'receiver' });

User.hasMany(AuditLog, { foreignKey: 'user_id', as: 'auditLogs' });
AuditLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Friendship relationships
User.belongsToMany(User, {
  as: 'friends',
  through: Friendship,
  foreignKey: 'sender_id',
  otherKey: 'receiver_id'
});

Friendship.belongsTo(User, { as: 'sender', foreignKey: 'sender_id' });
Friendship.belongsTo(User, { as: 'receiver', foreignKey: 'receiver_id' });

module.exports = {
  sequelize,
  Company,
  User,
  Message,
  AuditLog,
  Friendship
};
