const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  protocol: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
});

async function connectDB() {
  try {
    await sequelize.authenticate();
    console.log('Base de datos conectada correctamente');
  } catch (error) {
    console.error('Error conectando la base de datos:', error);
    throw error;
  }
}

module.exports = sequelize;
module.exports.connectDB = connectDB;
