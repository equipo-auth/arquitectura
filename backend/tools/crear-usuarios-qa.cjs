#!/usr/bin/env node
/**
 * Cuentas de integración QA, OPCIONALES y SOLO en Docker de desarrollo.
 * Compradores: Prisma PostgreSQL. STAFF y ORGANIZADOR: Keycloak Admin API,
 *   /api/auth/provision para espejo UUID y, SOLO en QA, activación sin invitación.
 * Requiere QA_SEED_ALLOW=SI; la contraseña pública de QA es SOLO de demostración.
 */
'use strict';
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: false });

const pass = 'TicketuQA2026!'; // SOLO cuentas @ticketu.test en Docker local
const realm = process.env.KEYCLOAK_REALM || 'ticketu-realm';
const kcBase = (process.env.KEYCLOAK_URL || 'http://localhost:8081').replace(/\/+$/, '');
const authBase = (process.env.QA_AUTH_URL || 'http://localhost:10000').replace(/\/+$/, '');
const dbUrl = process.env.DATABASE_URL || '';
const prisma = new PrismaClient();

function exigir(condicion, msg) { if (!condicion) throw new Error(msg); }
function hostAprobado(url, hosts) {
  try { const u = new URL(url); return u.protocol === 'http:' && hosts.includes(u.hostname); }
  catch { return false; }
}
function bdAprobada(url) {
  try { const u = new URL(url); return ['postgresql:','postgres:'].includes(u.protocol) && ['localhost','127.0.0.1','ticketu-db'].includes(u.hostname); }
  catch { return false; }
}
function crearRut(numero) {
  let total = 0, m = 2;
  for (const x of String(numero).split('').reverse()) {
    total += Number(x) * m; m = m === 7 ? 2 : m + 1;
  }
  let dv = 11 - (total % 11);
  const digito = dv === 11 ? '0' : dv === 10 ? 'K' : String(dv);
  const n = String(numero);
  return `${n.slice(0, -6)}.${n.slice(-6, -3)}.${n.slice(-3)}-${digito}`;
}
const personas = [
  ...[1,2,3].map(i => ({ email: `comprador${i}@ticketu.test`, firstName: 'Prueba', lastName: `Comprador${i}`, rol: 'COMPRADOR', rut: crearRut(98500100 + i) })),
  ...[1,2,3].map(i => ({ email: `staff${i}@ticketu.test`, firstName: 'Prueba', lastName: `Staff${i}`, rol: 'STAFF', rut: crearRut(98500200 + i) })),
  ...[1,2,3].map(i => ({ email: `organizador${i}@ticketu.test`, firstName: 'Prueba', lastName: `Organizador${i}`, rol: 'ORGANIZADOR', rut: crearRut(98500300 + i) })),
];

async function solicitar(url, options={}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(12000) });
  if (!res.ok) {
    // Evitar imprimir la respuesta: algunos sistemas reflejan datos secretos.
    throw new Error(`HTTP ${res.status} al consultar ${new URL(url).pathname}`);
  }
  if (res.status === 204 || res.status === 201 && res.headers.get('content-length') === '0') return null;
  const txt = await res.text();
  if (!txt) return null;
  try { return JSON.parse(txt); } catch { return txt; }
}
function headers(token) { return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }; }

async function prepararRutKeycloak(token) {
  // Keycloak 26 no siempre conserva atributos no definidos en User Profile.
  // Solo se modifica el realm QA local cuando el operador activa QA_SEED_ALLOW=SI.
  const endpoint = `${kcBase}/admin/realms/${encodeURIComponent(realm)}/users/profile`;
  let config = await solicitar(endpoint, {headers:headers(token)});
  exigir(config && Array.isArray(config.attributes),
    'Keycloak no devolvio User Profile; revisar realm y permisos administrativos');
  let rut = config.attributes.find(a => a.name === 'rut');
  if (!rut) {
    const atributo = {
      name:'rut', displayName:'RUT', multivalued:false,
      permissions:{view:['admin'], edit:['admin']},
    };
    await solicitar(endpoint, {
      method:'PUT', headers:headers(token),
      body:JSON.stringify({...config, attributes:[...config.attributes, atributo]}),
    });
    console.log('[KEYCLOAK] atributo rut habilitado en User Profile de QA');
  }
  config = await solicitar(endpoint, {headers:headers(token)});
  rut = config?.attributes?.find(a => a.name === 'rut');
  exigir(rut && rut.permissions?.view?.includes('admin') && rut.permissions?.edit?.includes('admin'),
    'El atributo rut no permite lectura/escritura administrativa en Keycloak');
}

async function adminToken() {
  const data = await solicitar(`${kcBase}/realms/master/protocol/openid-connect/token`, {
    method:'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'},
    body: new URLSearchParams({client_id:'admin-cli',grant_type:'password',
      username:process.env.KEYCLOAK_ADMIN_USER || 'admin',
      password:process.env.KEYCLOAK_ADMIN_PASSWORD || ''}),
  });
  exigir(data && data.access_token, 'No se pudo obtener token administrativo Keycloak');
  return data.access_token;
}

async function buscarKc(email, token) {
  const url = new URL(`${kcBase}/admin/realms/${encodeURIComponent(realm)}/users`);
  url.searchParams.set('email',email); url.searchParams.set('exact','true');
  const lista = await solicitar(url.toString(),{headers:headers(token)});
  const exactos = lista.filter(x => String(x.email || '').toLowerCase() === email);
  exigir(exactos.length <= 1, `Email duplicado en Keycloak: ${email}`);
  return exactos[0] || null;
}
async function rolesKc(uuid, token) {
  return solicitar(`${kcBase}/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(uuid)}/role-mappings/realm/composite`, {headers:headers(token)});
}
async function aplicarRol(uuid, rol, token) {
  const role = await solicitar(`${kcBase}/admin/realms/${encodeURIComponent(realm)}/roles/${rol}`, {headers:headers(token)});
  await solicitar(`${kcBase}/admin/realms/${encodeURIComponent(realm)}/users/${uuid}/role-mappings/realm`,
    {method:'POST',headers:headers(token),body:JSON.stringify([role])});
}
async function claveKc(uuid, token) {
  const userPath = `${kcBase}/admin/realms/${encodeURIComponent(realm)}/users/${uuid}`;
  await solicitar(`${userPath}/reset-password`,{method:'PUT',headers:headers(token),body:JSON.stringify({type:'password',value:pass,temporary:false})});
  const perfil = await solicitar(userPath,{headers:headers(token)});
  if ((perfil.requiredActions || []).includes('UPDATE_PASSWORD')) {
    await solicitar(userPath,{method:'PUT',headers:headers(token),body:JSON.stringify({requiredActions:perfil.requiredActions.filter(a=>a!=='UPDATE_PASSWORD')})});
  }
}
async function crearKc(p, token) {
  let cuenta = await buscarKc(p.email,token);
  let creada = false;
  if (!cuenta) {
    const nuevo = {username:p.email,email:p.email,enabled:true,emailVerified:true,
      firstName:p.firstName,lastName:p.lastName,attributes:{rut:[p.rut]},requiredActions:[]};
    await solicitar(`${kcBase}/admin/realms/${encodeURIComponent(realm)}/users`,{
      method:'POST',headers:headers(token),body:JSON.stringify(nuevo),
    });
    cuenta = await buscarKc(p.email,token);
    exigir(cuenta,`Keycloak no creo ${p.email}`);
    await aplicarRol(cuenta.id,p.rol,token);
    creada = true;
    console.log(`[KEYCLOAK] creada cuenta ${p.email} (${p.rol})`);
  }
  const urlPerfil = `${kcBase}/admin/realms/${encodeURIComponent(realm)}/users/${cuenta.id}`;
  let perfil = await solicitar(urlPerfil,{headers:headers(token)});
  const roles = (await rolesKc(cuenta.id,token)).map(x=>x.name).filter(x=>['STAFF','ORGANIZADOR'].includes(x));
  exigir(roles.length === 1 && roles[0] === p.rol,
    `Rol incorrecto en Keycloak para ${p.email}; no se modifica`);
  exigir(perfil.enabled === true && perfil.email?.toLowerCase() === p.email &&
         perfil.firstName === p.firstName && perfil.lastName === p.lastName,
    `La cuenta ${p.email} ya existe con otra identidad o esta deshabilitada; no se modifica`);
  const leerRut = u => Array.isArray(u.attributes?.rut) ? u.attributes.rut[0] : u.attributes?.rut;
  const rutAnterior = leerRut(perfil);
  if (!rutAnterior && !creada) {
    // Solo repara una cuenta QA exacta, incompleta, cuyo email, nombre y rol ya coinciden.
    // Nunca pisa un RUT distinto ni modifica cuentas fuera de las nueve identidades.
    const atributos = {...(perfil.attributes || {}),rut:[p.rut]};
    await solicitar(urlPerfil,{
      method:'PUT',headers:headers(token),body:JSON.stringify({
        username:perfil.username,email:perfil.email,enabled:perfil.enabled,
        emailVerified:perfil.emailVerified,firstName:perfil.firstName,
        lastName:perfil.lastName,attributes:atributos,
        requiredActions:perfil.requiredActions || [],
      }),
    });
    perfil = await solicitar(urlPerfil,{headers:headers(token)});
    console.log(`[KEYCLOAK] completado rut faltante de ${p.email}`);
  }
  exigir(leerRut(perfil) === p.rut,
    `Keycloak no conservo el rut ${p.rut} de ${p.email}; revisar User Profile`);

  const espejoPrevio = await prisma.user.findUnique({where:{uuid:cuenta.id}});
  if (espejoPrevio) exigir(espejoPrevio.email === p.email &&
        espejoPrevio.rut === p.rut && espejoPrevio.rol === p.rol,
    `Espejo preexistente no coincide con la identidad QA ${p.email}; no se modifica`);
  // En cuentas existentes es idempotente; Auth no cambia sus claves en PostgreSQL.
  await solicitar(`${authBase}/api/auth/provision`,{
    method:'POST',headers:{'Content-Type':'application/json','x-api-key':process.env.INTERNAL_API_KEY || ''},
    body:JSON.stringify({email:p.email}),
  });
  const espejo = await prisma.user.findUnique({where:{uuid:cuenta.id}});
  exigir(espejo && espejo.email === p.email && espejo.rut === p.rut && espejo.rol === p.rol,
    `Espejo PostgreSQL no coincide para ${p.email}`);

  // Crear la clave conocida solo en una identidad nueva, seed incompleto o reset explicito.
  // Un arranque repetido no revoca sesiones ni sobreescribe contrasenas existentes.
  const activar = creada || !espejoPrevio || espejo.cambio_obligatorio === true ||
    process.env.QA_SEED_RESET === 'SI';
  if (activar) {
    await claveKc(cuenta.id,token);
    await prisma.$transaction([
      prisma.user.update({where:{uuid:cuenta.id},data:{
        cambio_obligatorio:false,activo:true,token_version:{increment:1},
      }}),
      prisma.staffInvitationOutbox.updateMany({where:{user_uuid:cuenta.id},data:{
        status:'CANCELLED',locked_until:null,
      }}),
      prisma.passwordResetToken.updateMany({where:{user_uuid:cuenta.id,used_at:null},data:{used_at:new Date()}}),
    ]);
    console.log(`[QA] preparada identidad ${p.email} (${p.rol})`);
  } else {
    console.log(`[QA] existente sin cambios ${p.email} (${p.rol})`);
  }
}
async function crearComprador(p) {
  const conflicto = await prisma.user.findFirst({where:{OR:[{email:p.email},{rut:p.rut}]}});
  if (conflicto) {
    exigir(conflicto.email === p.email && conflicto.rut === p.rut && conflicto.rol === 'COMPRADOR',
      `Colision de identidad para ${p.email}: revisar BD; no se modifico`);
    if (process.env.QA_SEED_RESET === 'SI') {
      const hash = await bcrypt.hash(pass,10);
      await prisma.user.update({where:{uuid:conflicto.uuid},data:{
        password_hash:hash,activo:true,token_version:{increment:1},
      }});
      console.log(`[PRISMA] comprador de QA restablecido ${p.email}`);
    } else {
      console.log(`[PRISMA] comprador existente sin cambios ${p.email}`);
    }
  } else {
    const hash = await bcrypt.hash(pass,10);
    await prisma.user.create({data:{email:p.email,rut:p.rut,nombre:`${p.firstName} ${p.lastName}`,
      password_hash:hash,rol:'COMPRADOR',token_version:0,activo:true}});
    console.log(`[PRISMA] comprador de QA creado ${p.email}`);
  }
}
async function verificarLogin(p) {
  const res = await fetch(`${authBase}/api/auth/login`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:p.email,password:pass,admin:p.rol!=='COMPRADOR'}),
    signal:AbortSignal.timeout(12000),
  });
  if (res.status === 401 && p.rol === 'STAFF') throw new Error('Login de STAFF devolvió HTTP 401 en Auth/Keycloak. Verifica usuario habilitado, contraseña vigente, realm, cliente y Direct Access Grants; respuesta HTTP y credenciales no se muestran.'); exigir(res.status === 200, `Login de ${p.email} devolvió HTTP ${res.status} en vez de 200`);
  const cookie = (res.headers.get('set-cookie') || '').split(';')[0];
  exigir(cookie.startsWith('jwt='), `Falta cookie jwt de ${p.email}`);
  const ses = await fetch(`${authBase}/api/auth/validar-sesion`, {
    headers:{Cookie:cookie},signal:AbortSignal.timeout(12000),
  });
  exigir(ses.status === 200, `Sesión de ${p.email} devolvió HTTP ${ses.status}`);
  const contrato = await ses.json();
  const rolEsperado = p.rol === 'COMPRADOR' ? 'usuario' : p.rol.toLowerCase();
  exigir(contrato?.valido === true && contrato?.usuario?.rol === rolEsperado,
    `Rol de sesión inesperado para ${p.email}`);
  console.log(`[LOGIN 200] ${p.email} => ${rolEsperado}`);
}

async function main() {
  exigir(process.env.QA_SEED_ALLOW === 'SI', 'Acción deliberada requerida: QA_SEED_ALLOW=SI');
  exigir(process.env.NODE_ENV === 'development', 'Solo se permite NODE_ENV=development; prohibido en producción');
  exigir(pass.length >= 12 && /[a-zA-Z]/.test(pass) && /[0-9]/.test(pass),
    'La contraseña de demostración QA debe tener 12+ caracteres con letras y dígitos');
  exigir(dbUrl && bdAprobada(dbUrl), 'DATABASE_URL debe ser la BD local Docker QA');
  exigir(hostAprobado(kcBase,['localhost','127.0.0.1','ticketu-keycloak']), 'Keycloak debe ser el de Docker QA local');
  exigir(hostAprobado(authBase,['localhost','127.0.0.1','auth-service','ticketu-auth-service']), 'Auth debe ser local Docker QA');
  exigir(process.env.INTERNAL_API_KEY && process.env.INTERNAL_API_KEY.length >= 12,
    'Configura INTERNAL_API_KEY en backend/.env antes de ejecutar');
  await prisma.$connect();
  const token = await adminToken();
  await prepararRutKeycloak(token);
  console.log('Preparando 3 cuentas COMPRADOR, 3 STAFF y 3 ORGANIZADOR SOLO para QA.');
  for(const p of personas.filter(p=>p.rol==='COMPRADOR')) await crearComprador(p);
  for(const p of personas.filter(p=>p.rol!=='COMPRADOR')) await crearKc(p,token);
  for (const p of personas) await verificarLogin(p);
  console.log('QA FINALIZADO: 9 cuentas y 9 logins (rol de sesión) correctos.');
}
main().catch(e=>{console.error(`QA falló: ${e.message}`);process.exitCode=1})
  .finally(async()=>{await prisma.$disconnect()});
