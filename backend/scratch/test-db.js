const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

// Cargar .env manualmente si existe
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const val = valueParts.join('=').replace(/^"|"$/g, '');
        process.env[key.trim()] = val;
      }
    }
  });
}

async function main() {
  console.log('Conectando a Neon DB con URL:', process.env.DATABASE_URL ? 'OK' : 'FALTANTE');
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    console.log('✅ Conexión exitosa a la base de datos PostgreSQL en Neon DB!');

    const userCount = await prisma.user.count();
    console.log(`📊 Cantidad de usuarios en la tabla 'users': ${userCount}`);
  } catch (error) {
    console.error('❌ Error en la base de datos:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
