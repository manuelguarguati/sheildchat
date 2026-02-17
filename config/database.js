const { Sequelize } = require('sequelize');

// Lazy initialization - only create sequelize when needed
let sequelize = null;
function getSequelize() {
  if (!sequelize) {
    if (!process.env.DATABASE_URL) {
      console.error("⚠️ DATABASE_URL no está definida.");
      console.error("📌 Solución: Configura la variable DATABASE_URL en el panel de Vercel:");
      console.error("   1. Ve a vercel.com > Tu Proyecto > Settings > Environment Variables");
      console.error("   2. Agrega: DATABASE_URL con el valor de tu conexión PostgreSQL");
      console.error("   3. Selecciona los entornos (Production, Preview, Development)");
      console.error("   4. Save > Redeploy");
      return null;
    }
    
    sequelize = new Sequelize(process.env.DATABASE_URL, {
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
  }
  return sequelize;
}

async function connectDB() {
  try {
    const db = getSequelize();
    await db.authenticate();
    console.log('✅ Base de datos conectada correctamente');
  } catch (error) {
    console.error('❌ Error conectando la base de datos:', error);
    throw error;
  }
}

module.exports = { getSequelize, connectDB };
