import { describe, expect, it } from 'vitest';
import { destinoParaRol } from './redirect-destinos';

const origin = 'http://localhost:3001';

describe('Destinos por rol tras login', () => {
  it('mantiene rutas locales sin configuración externa', () => {
    expect(destinoParaRol('staff', origin, {})).toBe('/checkin');
    expect(destinoParaRol('organizador', origin, {})).toBe('/organizador');
    expect(destinoParaRol('COMPRADOR', origin, {})).toBe('/entradas');
    expect(destinoParaRol('usuario', origin, {})).toBe('/entradas');
  });
  it('usa los puertos de las interfaces que indique cada equipo', () => {
    expect(destinoParaRol('staff', origin, { checkin: 'http://localhost:4321/acceso' })).toBe('http://localhost:4321/acceso');
    expect(destinoParaRol('organizador', origin, { organizador: 'http://localhost:5173/' })).toBe('http://localhost:5173/');
    expect(destinoParaRol('COMPRADOR', origin, { entradas: 'http://localhost:4322/' })).toBe('http://localhost:4322/');
  });
  it('rechaza esquemas inseguros, URLs con usuario y roles desconocidos', () => {
    expect(destinoParaRol('staff', origin, { checkin: 'javascript:alert(1)' })).toBe('/checkin');
    expect(destinoParaRol('staff', origin, { checkin: 'http://otra-maquina:3005' })).toBe('/checkin');
    expect(destinoParaRol('staff', origin, { checkin: 'https://user:pwd@ejemplo.cl/' })).toBe('/checkin');
    expect(destinoParaRol('ADMIN', origin, {})).toBeNull();
  });
  it('evita enviar al organizador a la portada por URL legado', () => {
    expect(destinoParaRol('organizador', origin, { organizador: 'http://localhost:3001' })).toBe('/organizador');
  });
  it('respeta HTTPS para frontends remotos', () => {
    expect(destinoParaRol('organizador', origin, { organizador: 'https://panel.ticketu.example/dashboard' })).toBe('https://panel.ticketu.example/dashboard');
  });
});
