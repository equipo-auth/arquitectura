const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const usuariosGenericos = [
  {
    rut: '11.111.111-1',
    email: 'admin.principal@ticketu.cl',
    nombre: 'Carlos Mendoza Silva',
    rol: 'CLIENTE',
    cambioObligatorio: false,
  },
  {
    rut: '12.222.222-2',
    email: 'sup.loreto@ticketu.cl',
    nombre: 'Loreto Valenzuela Rojas',
    rol: 'STAFF',
    cambioObligatorio: false,
  },
  {
    rut: '13.333.333-3',
    email: 'agente.diego@ticketu.cl',
    nombre: 'Diego Fernando Morales',
    rol: 'CLIENTE',
    cambioObligatorio: true,
  },
  {
    rut: '14.444.444-4',
    email: 'agente.camila@ticketu.cl',
    nombre: 'Camila Ignacia Soto',
    rol: 'ORGANIZADOR',
    cambioObligatorio: false,
  },
  {
    rut: '15.555.555-5',
    email: 'agente.rodrigo@ticketu.cl',
    nombre: 'Rodrigo Esteban Castro',
    rol: 'CLIENTE',
    cambioObligatorio: true,
  },
  {
    rut: '16.666.666-6',
    email: 'cliente.valentina@empresa.cl',
    nombre: 'Valentina Paz Sepúlveda',
    rol: 'CLIENTE',
    cambioObligatorio: false,
  },
  {
    rut: '17.777.777-7',
    email: 'cliente.gonzalo@pyme.cl',
    nombre: 'Gonzalo Andrés Fuenzalida',
    rol: 'CLIENTE',
    cambioObligatorio: false,
  },
  {
    rut: '18.888.888-8',
    email: 'cliente.javiera@startup.cl',
    nombre: 'Javiera Belén Muñoz',
    rol: 'CLIENTE',
    cambioObligatorio: false,
  },
  {
    rut: '19.999.999-9',
    email: 'cliente.matias@corp.cl',
    nombre: 'Matías Alejandro Araya',
    rol: 'STAFF',
    cambioObligatorio: false,
  },
  {
    rut: '20.000.000-0',
    email: 'cliente.sofia@tech.cl',
    nombre: 'Sofía Andrea Contreras',
    rol: 'ORGANIZADOR',
    cambioObligatorio: false,
  },
];

async function main() {
  console.log('🚀 Generando hash de contraseña predeterminada...');
  const passwordHash = await bcrypt.hash('Password123!', 10);

  console.log('🌱 Insertando 10 usuarios genéricos en la base de datos...');

  // 1. Crear o actualizar el primer usuario
  const adminData = usuariosGenericos[0];
  const adminCreated = await prisma.user.upsert({
    where: { email: adminData.email },
    update: { rol: adminData.rol },
    create: {
      rut: adminData.rut,
      email: adminData.email,
      nombre: adminData.nombre,
      rol: adminData.rol,
      password_hash: passwordHash,
      cambio_obligatorio: adminData.cambioObligatorio,
    },
  });

  console.log(`✅ [1/10] Actualizado: ${adminCreated.nombre} - Rol: ${adminCreated.rol} (${adminCreated.email})`);

  // 2. Crear o actualizar los 9 usuarios restantes
  for (let i = 1; i < usuariosGenericos.length; i++) {
    const u = usuariosGenericos[i];
    const userCreated = await prisma.user.upsert({
      where: { email: u.email },
      update: { rol: u.rol },
      create: {
        rut: u.rut,
        email: u.email,
        nombre: u.nombre,
        rol: u.rol,
        password_hash: passwordHash,
        cambio_obligatorio: u.cambioObligatorio,
        creado_por_id: adminCreated.uuid,
      },
    });

    console.log(`✅ [${i + 1}/10] Actualizado: ${userCreated.nombre} - Rol: ${userCreated.rol} (${userCreated.email})`);
  }

  const total = await prisma.user.count();
  console.log(`\n🎉 ¡Carga finalizada con éxito! Total usuarios en la BD: ${total}`);
}

main()
  .catch((e) => {
    console.error('❌ Error insertando usuarios:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
