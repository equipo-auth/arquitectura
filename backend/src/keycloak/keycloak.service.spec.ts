import axios from 'axios';
import { BadRequestException } from '@nestjs/common';
import { KeycloakService } from './keycloak.service';

jest.mock('axios');
const http = axios as jest.Mocked<typeof axios>;

const UUID = 'bd752bae-dfcf-41cf-bbaa-2cad30bebf1b';

describe('KeycloakService: usuarios preexistentes', () => {
  let service: KeycloakService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new KeycloakService();
    http.post.mockResolvedValue({ data: { access_token: 'admin-token' } });
    http.get.mockImplementation(async (url: string) => {
      if (url.endsWith('/users')) {
        return { data: [{ id: UUID, email: 'diego.admin@ticketu.cl' }] };
      }
      if (url.endsWith('/role-mappings/realm/composite')) {
        return { data: [{ name: 'STAFF' }] };
      }
      return {
        data: {
          id: UUID, email: 'diego.admin@ticketu.cl', enabled: true,
          firstName: 'Diego', lastName: 'Prueba',
          attributes: { rut: ['12.345.678-5'] },
        },
      };
    });
  });

  it('obtiene UUID, rol real y RUT de Keycloak por email', async () => {
    const profile = await service.getUserByEmail('Diego.Admin@ticketu.cl');
    expect(profile).toEqual({
      id: UUID, email: 'diego.admin@ticketu.cl',
      nombre: 'Diego Prueba', rut: '12.345.678-5',
      rol: 'STAFF', enabled: true,
    });
    expect(http.get).toHaveBeenCalledWith(
      expect.stringContaining('/users'),
      expect.objectContaining({ params: { email: 'diego.admin@ticketu.cl', exact: true } }),
    );
    expect(http.post).not.toHaveBeenCalledWith(expect.stringContaining('/admin/realms/'), expect.anything(), expect.anything());
  });

  it('no infiere el rol de la palabra admin en el email', async () => {
    http.get.mockImplementation(async (url: string) => {
      if (url.endsWith('/users')) return { data: [{ id: UUID, email: 'diego.admin@ticketu.cl' }] };
      if (url.endsWith('/role-mappings/realm/composite')) return { data: [] };
      return { data: {
        id: UUID, email: 'diego.admin@ticketu.cl', enabled: true,
        firstName: 'Diego', attributes: { rut: ['12.345.678-5'] },
      } };
    });
    await expect(service.getUserByEmail('diego.admin@ticketu.cl'))
      .rejects.toThrow(BadRequestException);
  });
});
