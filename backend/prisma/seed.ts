// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

type RolSeed = 'COMPRADOR' | 'ORGANIZADOR' | 'STAFF';

interface UsuarioSeed {
  rut: string;
  email: string;
  nombre: string;
  rol: RolSeed;
}

// Contraseña de prueba SOLO para COMPRADOR (bcrypt local).
// ORGANIZADOR y STAFF se autentican en Keycloak: deben existir allí con el
// mismo email para poder iniciar sesión.
const PASSWORD_COMPRADOR = 'Password123!';

const usuariosPrueba: UsuarioSeed[] = [
  {
    rut: '12.222.222-2',
    email: 'sup.loreto@ticketu.cl',
    nombre: 'Loreto Valenzuela Rojas',
    rol: 'STAFF',
  },
  {
    rut: '13.333.333-3',
    email: 'agente.diego@ticketu.cl',
    nombre: 'Diego Fernando Morales',
    rol: 'COMPRADOR',
  },
  {
    rut: '14.444.444-4',
    email: 'agente.camila@ticketu.cl',
    nombre: 'Camila Ignacia Soto',
    rol: 'ORGANIZADOR',
  },
  {
    rut: '15.555.555-5',
    email: 'agente.rodrigo@ticketu.cl',
    nombre: 'Rodrigo Esteban Castro',
    rol: 'COMPRADOR',
  },
  {
    rut: '16.666.666-6',
    email: 'cliente.valentina@empresa.cl',
    nombre: 'Valentina Paz Sepúlveda',
    rol: 'COMPRADOR',
  },
  {
    rut: '17.777.777-7',
    email: 'cliente.gonzalo@pyme.cl',
    nombre: 'Gonzalo Andrés Fuenzalida',
    rol: 'COMPRADOR',
  },
  {
    rut: '18.888.888-8',
    email: 'cliente.javiera@startup.cl',
    nombre: 'Javiera Belén Muñoz',
    rol: 'COMPRADOR',
  },
  {
    rut: '19.999.999-9',
    email: 'cliente.matias@corp.cl',
    nombre: 'Matías Alejandro Araya',
    rol: 'STAFF',
  },
  {
    rut: '20.000.000-0',
    email: 'cliente.sofia@tech.cl',
    nombre: 'Sofía Andrea Contreras',
    rol: 'ORGANIZADOR',
  },
];

async function main(): Promise<void> {
  console.log('🌱 Poblando la base de datos con usuarios de prueba...');
  const passwordHash = await bcrypt.hash(PASSWORD_COMPRADOR, 10);

  for (const u of usuariosPrueba) {
    const email = u.email.trim().toLowerCase();
    const esComprador = u.rol === 'COMPRADOR';

    await prisma.user.upsert({
      where: { email },
      update: {
        rol: u.rol,
        nombre: u.nombre,
      },
      create: {
        rut: u.rut,
        email,
        nombre: u.nombre,
        rol: u.rol,
        password_hash: esComprador ? passwordHash : null,
        cambio_obligatorio: false,
      },
    });
  }

  // Corrige datos heredados de seeds anteriores
  const legado = await prisma.user.updateMany({
    where: { rol: 'CLIENTE' },
    data: { rol: 'COMPRADOR' },
  });
  if (legado.count > 0) {
    console.log(
      `↺ ${legado.count} usuario(s) con rol CLIENTE migrados a COMPRADOR`,
    );
  }

  const count = await prisma.user.count();
  console.log(`✅ Base de datos poblada. Total registros en 'users': ${count}`);
}

main()
  .catch((e: unknown) => {
    console.error('❌ Error ejecutando seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
