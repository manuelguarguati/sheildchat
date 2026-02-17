/**
 * Script de Verificación de Configuración para Producción
 * ==========================================================
 * Este script verifica que la configuración esté lista para producción.
 * 
 * Uso: node scripts/verify-config.js
 */

console.log('═══════════════════════════════════════════════════════════');
console.log('   VERIFICACIÓN DE CONFIGURACIÓN PARA PRODUCCIÓN');
console.log('═══════════════════════════════════════════════════════════\n');

const requiredVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'ENCRYPTION_KEY',
  'FRONTEND_URL'
];

const env = process.env;
let errors = 0;
let warnings = 0;

// Función para verificar variables
function checkVariable(name, validator) {
  const value = env[name];
  
  if (!value) {
    console.log(`❌ ${name}: NO DEFINIDA`);
    errors++;
    return false;
  }
  
  const result = validator(value);
  if (result === true) {
    console.log(`✅ ${name}: Configurada correctamente`);
  } else {
    console.log(`⚠️  ${name}: ${result}`);
    warnings++;
  }
  return true;
}

console.log('1. VERIFICANDO VARIABLES DE ENTORNO\n');

// DATABASE_URL
checkVariable('DATABASE_URL', (value) => {
  if (value.includes('localhost')) {
    return 'ERROR: Usa localhost - debe ser una URL de base de datos en la nube';
  }
  if (!value.startsWith('postgresql://') && !value.startsWith('postgres://')) {
    return 'ADVERTENCIA: Formato no estándar';
  }
  return true;
});

// JWT_SECRET
checkVariable('JWT_SECRET', (value) => {
  if (value.length < 32) {
    return 'ADVERTENCIA: Se recomienda mínimo 32 caracteres';
  }
  return true;
});

// ENCRYPTION_KEY
checkVariable('ENCRYPTION_KEY', (value) => {
  if (value.length !== 32) {
    return `ERROR: Debe tener exactamente 32 caracteres (actuales: ${value.length})`;
  }
  return true;
});

// FRONTEND_URL
checkVariable('FRONTEND_URL', (value) => {
  if (value.includes('localhost')) {
    return 'ERROR: No debe usar localhost en producción';
  }
  if (!value.startsWith('https://')) {
    return 'ADVERTENCIA: Debería usar HTTPS en producción';
  }
  return true;
});

// NODE_ENV
console.log('\n2. VERIFICANDO MODO DE ENTORNO\n');
const nodeEnv = env.NODE_ENV || 'not set';
if (nodeEnv === 'production') {
  console.log('✅ NODE_ENV: production');
} else if (nodeEnv === 'development') {
  console.log('⚠️  NODE_ENV: development (debería ser production)');
  warnings++;
} else {
  console.log(`⚠️  NODE_ENV: ${nodeEnv} (no configurado)`);
  warnings++;
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('   RESUMEN');
console.log('═══════════════════════════════════════════════════════════');

if (errors > 0) {
  console.log(`\n❌ SE ENCONTRARON ${errors} ERROR(ES) - NO DESPLIEGUE`);
  console.log('\n📋 PASOS PARA CORREGIR:');
  console.log('   1. Ve al panel de Vercel > Settings > Environment Variables');
  console.log('   2. Agrega las variables faltantes');
  console.log('   3. Redeploy tu proyecto');
  process.exit(1);
} else if (warnings > 0) {
  console.log(`\n⚠️  SE ENCONTRARON ${warnings} ADVERTENCIA(S)`);
  console.log('   El despliegue puede funcionar, pero revisa las advertencias.');
} else {
  console.log('\n✅ ¡CONFIGURACIÓN CORRECTA! Puedes desplegar a producción.');
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('   URLs CONFIGURADAS');
console.log('═══════════════════════════════════════════════════════════\n');
console.log(`Frontend: ${env.FRONTEND_URL || 'NO CONFIGURADO'}`);
console.log(`API: ${env.VERCEL_URL ? `https://${env.VERCEL_URL}` : 'Se usará el dominio de Vercel'}`);

console.log('\n═══════════════════════════════════════════════════════════');
console.log('   PRÓXIMOS PASOS');
console.log('═══════════════════════════════════════════════════════════\n');
console.log('1. Configura las variables en Vercel Dashboard:');
console.log('   - Ve a: https://vercel.com/dashboard');
console.log('   - Selecciona tu proyecto');
console.log('   - Settings > Environment Variables');
console.log('   - Agrega cada variable del archivo .env.example');
console.log('   - Selecciona "Production" y "Preview"');
console.log('   - Click "Save"');
console.log('\n2. Redeploy el proyecto:');
console.log('   - Ve a la pestaña "Deployments"');
console.log('   - Click en el último deployment');
console.log('   - Click "Redeploy"');
console.log('\n3. Verifica el funcionamiento:');
console.log('   - Visita: https://sheildchatversion.vercel.app/api/health');
console.log('\n═══════════════════════════════════════════════════════════\n');

process.exit(errors > 0 ? 1 : 0);
