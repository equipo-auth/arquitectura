const { PrismaClient } = require('@prisma/client');
const client = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
(async () => {
  try {
    await client.$connect();
    const rows = await client.$queryRawUnsafe('SELECT 1 as ok');
    console.log(rows[0]?.ok === 1 ? 'PRISMA_OK' : 'PRISMA_BAD_RESULT');
  } catch (err) {
    console.log('PRISMA_CONNECT_FAIL');
    process.exitCode = 1;
  } finally {
    await client.$disconnect();
  }
})();
