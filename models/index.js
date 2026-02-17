const { getSequelize } = require('../config/database');

// Import models as factory functions
const CompanyModel = require('./Company');
const UserModel = require('./User');
const MessageModel = require('./Message');
const AuditLogModel = require('./AuditLog');
const FriendshipModel = require('./Friendship');

// Lazy initialization - don't call getSequelize() immediately to avoid
// errors in serverless environments where DATABASE_URL might not be available during build
let _sequelize = null;
let _models = null;

function getSequelizeInstance() {
  if (!_sequelize) {
    // Check if DATABASE_URL is available
    if (!process.env.DATABASE_URL) {
      console.warn('⚠️ DATABASE_URL no está definida. Los modelos se inicializarán cuando se requiera.');
      // Return null for now, will be initialized later when DB is connected
      return null;
    }
    _sequelize = getSequelize();
  }
  return _sequelize;
}

function initializeModels() {
  if (_models) {
    return _models;
  }

  const sequelize = getSequelizeInstance();
  
  // If sequelize is not available yet, return null models
  // This allows the app to start in Vercel without crashing during build
  if (!sequelize) {
    return {
      Company: null,
      User: null,
      Message: null,
      AuditLog: null,
      Friendship: null,
      sequelize: null
    };
  }

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

  _models = {
    sequelize,
    Company,
    User,
    Message,
    AuditLog,
    Friendship
  };

  return _models;
}

// Export the initialize function and get models on demand
// For backward compatibility, also export getter properties
let _Company, _User, _Message, _AuditLog, _Friendship;

Object.defineProperty(exports, 'sequelize', {
  get: function() {
    const models = initializeModels();
    return models ? models.sequelize : null;
  }
});

Object.defineProperty(exports, 'Company', {
  get: function() {
    if (!_Company) {
      const models = initializeModels();
      _Company = models ? models.Company : null;
    }
    return _Company;
  }
});

Object.defineProperty(exports, 'User', {
  get: function() {
    if (!_User) {
      const models = initializeModels();
      _User = models ? models.User : null;
    }
    return _User;
  }
});

Object.defineProperty(exports, 'Message', {
  get: function() {
    if (!_Message) {
      const models = initializeModels();
      _Message = models ? models.Message : null;
    }
    return _Message;
  }
});

Object.defineProperty(exports, 'AuditLog', {
  get: function() {
    if (!_AuditLog) {
      const models = initializeModels();
      _AuditLog = models ? models.AuditLog : null;
    }
    return _AuditLog;
  }
});

Object.defineProperty(exports, 'Friendship', {
  get: function() {
    if (!_Friendship) {
      const models = initializeModels();
      _Friendship = models ? models.Friendship : null;
    }
    return _Friendship;
  }
});

// Also export the initializeModels function for manual initialization
module.exports = initializeModels();
