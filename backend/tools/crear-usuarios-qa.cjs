#!/usr/bin/env node
/**
 * Cuentas de integración QA, OPCIONALES y SOLO en Docker de desarrollo.
 * Compradores: Prisma PostgreSQL. STAFF y ORGANIZADOR: Keycloak Admin API,
 *   /api/auth/provision para espejo UUID y, SOLO en QA, activación sin invitación.
 * Requiere QA_SEED_ALLOW=SI y QA_SEED_PASSWORD (nunca guardar en Git).
 */
'use strict';
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: false });

const pass = process.env.QA_SEED_PASSWORD || '';
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
  if (!cuenta) {
    const nuevo = {username:p.email,email:p.email,enabled:true,emailVerified:true,
      firstName:p.firstName,lastName:p.lastName,attributes:{rut:[p.rut]},requiredActions:[]};
    await solicitar(`${kcBase}/admin/realms/${encodeURIComponent(realm)}/users`,{
      method:'POST',headers:headers(token),body:JSON.stringify(nuevo),
    });
    cuenta = await buscarKc(p.email,token);
    exigir(cuenta,`Keycloak no creó ${p.email}`);
    await aplicarRol(cuenta.id,p.rol,token);
    console.log(`[KEYCLOAK] creada cuenta ${p.email} (${p.rol})`);
  } else {
    const perfil = await solicitar(`${kcBase}/admin/realms/${encodeURIComponent(realm)}/users/${cuenta.id}`, {headers:headers(token)});
    const actualRut = Array.isArray(perfil.attributes?.rut) ? perfil.attributes.rut[0] : perfil.attributes?.rut;
    exigir(actualRut === p.rut && perfil.firstName === p.firstName && perfil.lastName === p.lastName,
      `La cuenta ${p.email} ya existe con otra identidad. No se modifica.`);
    exigir(perfil.enabled === true, `Cuenta ${p.email} deshabilitada. Revisar manualmente.`);
    const adminRoles = (await rolesKc(cuenta.id,token)).map(x=>x.name).filter(x=>['STAFF','ORGANIZADOR'].includes(x));
    exigir(adminRoles.length === 1 && adminRoles[0] === p.rol, `Rol incorrecto en Keycloak para ${p.email}`);
    console.log(`[KEYCLOAK] cuenta existente verificada ${p.email}`);
  }
  // Restablecer contraseña SOLO para estas nueve identidades QA verificadas.
  await claveKc(cuenta.id,token);
  // El endpoint provisiona una identidad administrativa sin escribir la clave en PG.
  await solicitar(`${authBase}/api/auth/provision`,{
    method:'POST',headers:{'Content-Type':'application/json','x-api-key':process.env.INTERNAL_API_KEY || ''},
    body:JSON.stringify({email:p.email}),
  });
  const espejo = await prisma.user.findUnique({where:{uuid:cuenta.id}});
  exigir(espejo && espejo.email === p.email && espejo.rut === p.rut && espejo.rol === p.rol,
    `Espejo PostgreSQL no coincide para ${p.email}`);
  // EXCEPCIÓN SOLAMENTE PARA DEMO: saltar primer inicio por invitación y permitir
  // que los otros equipos entren con la clave de QA. No hacer en producción.
  await prisma.$transaction([
    prisma.user.update({where:{uuid:cuenta.id},data:{cambio_obligatorio:false,activo:true,token_version:{increment:1}}}),
    prisma.staffInvitationOutbox.updateMany({where:{user_uuid:cuenta.id},data:{status:'CANCELLED',locked_until:null}}),
    prisma.passwordResetToken.updateMany({where:{user_uuid:cuenta.id,used_at:null},data:{used_at:new Date()}}),
  ]);
  console.log(`[QA] habilitada y sincronizada ${p.email} (${p.rol})`);
}
async function crearComprador(p) {
  const conflicto = await prisma.user.findFirst({where:{OR:[{email:p.email},{rut:p.rut}]}});
  const hash = await bcrypt.hash(pass,10);
  if (conflicto) {
    exigir(conflicto.email === p.email && conflicto.rut === p.rut && conflicto.rol === 'COMPRADOR',
      `Colisión de identidad para ${p.email}: revisar BD; no se modificó.`);
    await prisma.user.update({where:{uuid:conflicto.uuid},data:{password_hash:hash,activo:true,token_version:{increment:1}}});
    console.log(`[PRISMA] comprador de QA actualizado ${p.email}`);
  } else {
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
  exigir(res.status === 200, `Login de ${p.email} devolvió HTTP ${res.status} en vez de 200`);
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
    'QA_SEED_PASSWORD debe tener 12+ caracteres con letras y dígitos');
  exigir(dbUrl && bdAprobada(dbUrl), 'DATABASE_URL debe ser la BD local Docker QA');
  exigir(hostAprobado(kcBase,['localhost','127.0.0.1','ticketu-keycloak']), 'Keycloak debe ser el de Docker QA local');
  exigir(hostAprobado(authBase,['localhost','127.0.0.1','ticketu-auth-service']), 'Auth debe ser local Docker QA');
  exigir(process.env.INTERNAL_API_KEY && process.env.INTERNAL_API_KEY.length >= 12,
    'Configura INTERNAL_API_KEY en backend/.env antes de ejecutar');
  await prisma.$connect();
  const token = await adminToken();
  console.log('Preparando 3 cuentas COMPRADOR, 3 STAFF y 3 ORGANIZADOR SOLO para QA.');
  for(const p of personas.filter(p=>p.rol==='COMPRADOR')) await crearComprador(p);
  for(const p of personas.filter(p=>p.rol!=='COMPRADOR')) await crearKc(p,token);
  for (const p of personas) await verificarLogin(p);
  console.log('QA FINALIZADO: 9 cuentas y 9 logins (rol de sesión) correctos.');
}
main().catch(e=>{console.error(`QA falló: ${e.message}`);process.exitCode=1})
  .finally(async()=>{await prisma.$disconnect()});
