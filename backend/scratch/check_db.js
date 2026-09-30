const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- CONEXIÓN EXITOSA A POSTGRESQL ---');
  
  const userCount = await prisma.user.count();
  const resetCount = await prisma.passwordResetToken.count();
  const revocationCount = await prisma.sessionRevocada.count();
  
  console.log(`Tabla 'users': ${userCount} registros`);
  console.log(`Tabla 'password_reset_tokens': ${resetCount} registros`);
  console.log(`Tabla 'session_revocada': ${revocationCount} registros`);
  
  // Listar estructuras de las tablas
  const tables = await prisma.$queryRaw`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `;
  
  console.log('\nTablas existentes en el esquema public:');
  console.table(tables);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
