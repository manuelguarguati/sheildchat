/**
 * Script to create initial admin user and company
 * Run: node scripts/create-admin.js
 */

require('dotenv').config();
const sequelize = require('../config/database');
const { Company, User } = require('../models');

const COMPANY_NAME = 'Shield Corp';
const COMPANY_DOMAIN = 'shieldcorp.com';
const ADMIN_USERNAME = 'admin123';
const ADMIN_EMAIL = 'admin@shieldcorp.com';
const ADMIN_PASSWORD = '1234';

async function createAdmin() {
  try {
    console.log('🔄 Conectando a la base de datos...');
    
    // Authenticate database connection
    await sequelize.authenticate();
    console.log('✅ Conexión a la base de datos establecida.');
    
    // Sync models
    await sequelize.sync({ alter: true });
    console.log('✅ Modelos sincronizados.');
    
    // Check if company exists
    console.log(`🔄 Verificando empresa: ${COMPANY_NAME} (${COMPANY_DOMAIN})...`);
    let company = await Company.findOne({
      where: { domain: COMPANY_DOMAIN }
    });
    
    if (!company) {
      company = await Company.create({
        name: COMPANY_NAME,
        domain: COMPANY_DOMAIN,
        settings: {},
        is_active: true
      });
      console.log(`✅ Empresa "${COMPANY_NAME}" creada exitosamente.`);
    } else {
      console.log(`ℹ️  La empresa "${COMPANY_NAME}" ya existe.`);
    }
    
    // Delete existing admin if exists (to ensure fresh password with correct hash)
    const existingAdmin = await User.findOne({
      where: { company_id: company.id, username: ADMIN_USERNAME }
    });
    if (existingAdmin) {
      console.log(`🔄 Eliminando admin existente: ${ADMIN_USERNAME}...`);
      await existingAdmin.destroy();
    }
    
    // Generate hash with salt 12 (matching User model hook)
    const bcrypt = require('bcrypt');
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);
    console.log(`🔍 [DEBUG] Hash generado: ${hashedPassword}`);
    
    // Create admin user using raw query to bypass validation
    await sequelize.query(`
      INSERT INTO users (company_id, username, email, password_hash, role, is_active, login_attempts, lock_until, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `, {
      replacements: [company.id, ADMIN_USERNAME, ADMIN_EMAIL, hashedPassword, 'admin', true, 0, null],
      type: sequelize.QueryTypes.INSERT
    });
    
    console.log('✅ Admin creado correctamente');
    console.log(`   Username: ${ADMIN_USERNAME}`);
    console.log(`   Password: ${ADMIN_PASSWORD}`);
    console.log(`   Email: ${ADMIN_EMAIL}`);
    console.log(`   Empresa: ${COMPANY_NAME}`);
    
    console.log('\n🎉 Configuración completada exitosamente!');
    console.log('═══════════════════════════════════════════════════');
    
    await sequelize.close();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error al crear el admin:', error.message);
    console.error(error);
    await sequelize.close();
    process.exit(1);
  }
}

// Run the script
createAdmin();
