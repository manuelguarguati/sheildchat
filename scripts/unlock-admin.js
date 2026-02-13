/**
 * Script to unlock admin account
 * Run: node scripts/unlock-admin.js
 */

require('dotenv').config();
const sequelize = require('../config/database');
const { Company, User } = require('../models');

const COMPANY_DOMAIN = 'shieldcorp.com';
const ADMIN_USERNAME = 'admin123';

async function unlockAdmin() {
  try {
    console.log('🔄 Conectando a la base de datos...');
    
    await sequelize.authenticate();
    console.log('✅ Conexión establecida.');
    
    // Find company
    const company = await Company.findOne({
      where: { domain: COMPANY_DOMAIN }
    });
    
    if (!company) {
      console.error('❌ Empresa no encontrada:', COMPANY_DOMAIN);
      await sequelize.close();
      process.exit(1);
    }
    
    // Find and unlock admin
    const admin = await User.findOne({
      where: { company_id: company.id, username: ADMIN_USERNAME }
    });
    
    if (!admin) {
      console.error('❌ Admin no encontrado:', ADMIN_USERNAME);
      await sequelize.close();
      process.exit(1);
    }
    
    admin.login_attempts = 0;
    admin.lock_until = null;
    admin.is_active = true;
    await admin.save();
    
    console.log('✅ Admin desbloqueado correctamente!');
    console.log(`   Username: ${ADMIN_USERNAME}`);
    console.log(`   Login attempts: ${admin.login_attempts}`);
    console.log(`   Locked: ${admin.lock_until || 'No'}`);
    console.log(`   Active: ${admin.is_active}`);
    
    await sequelize.close();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    await sequelize.close();
    process.exit(1);
  }
}

unlockAdmin();
