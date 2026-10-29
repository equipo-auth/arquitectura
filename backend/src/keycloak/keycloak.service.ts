import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import axios from 'axios';
import { assertValidRut } from '../common/rut';

export interface KeycloakStaffProfile {
  id: string;
  email: string;
  nombre: string;
  rut: string;
  rol: 'STAFF' | 'ORGANIZADOR';
  enabled: boolean;
}

interface KeycloakAccount {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  attributes?: Record<string, string[] | string>;
  requiredActions?: string[];
}

@Injectable()
export class KeycloakService {
  private readonly logger = new Logger(KeycloakService.name);
  private readonly keycloakUrl: string = process.env.KEYCLOAK_URL || 'http://localhost:8081';
  private readonly realm: string = process.env.KEYCLOAK_REALM || 'ticketu-realm';
  private readonly clientId: string = process.env.KEYCLOAK_CLIENT_ID || 'ticketu-backend';
  private readonly clientSecret: string = process.env.KEYCLOAK_CLIENT_SECRET || '';
  private readonly adminUser: string = process.env.KEYCLOAK_ADMIN_USER || 'admin';
  private readonly adminPassword: string = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';

  async validateUserCredentials(email: string, password: string) {
    try {
      const response = await axios.post(
        `${this.keycloakUrl}/realms/${encodeURIComponent(this.realm)}/protocol/openid-connect/token`,
        new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'password',
          username: email,
          password,
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 5000 },
      );
      return response.data;
    } catch (error) {
      const errorData = axios.isAxiosError(error) ? error.response?.data : undefined;
      if (errorData?.error_description === 'Account is not fully set up') {
        throw new Error('resolve_required_actions');
      }
      if (axios.isAxiosError(error) && (!error.response || error.response.status >= 500)) {
        throw new ServiceUnavailableException('Keycloak no está disponible');
      }
      throw new UnauthorizedException('Credenciales inválidas en Keycloak');
    }
  }

  private async getAdminToken(): Promise<string> {
    try {
      const response = await axios.post(
        `${this.keycloakUrl}/realms/master/protocol/openid-connect/token`,
        new URLSearchParams({
          client_id: 'admin-cli',
          grant_type: 'password',
          username: this.adminUser,
          password: this.adminPassword,
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 5000 },
      );
      return response.data.access_token;
    } catch (error) {
      this.logger.error('[getAdminToken] No fue posible autenticar al administrador de Keycloak');
      throw new ServiceUnavailableException('No se pudo consultar la administración de Keycloak');
    }
  }

  /** Solo consulta Keycloak: NUNCA crea usuarios. */
  private async findAccountByEmail(email: string): Promise<KeycloakAccount | null> {
    const token = await this.getAdminToken();
    const normalized = email.trim().toLowerCase();
    try {
      const { data } = await axios.get<KeycloakAccount[]>(
        `${this.keycloakUrl}/admin/realms/${encodeURIComponent(this.realm)}/users`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { email: normalized, exact: true },
          timeout: 5000,
        },
      );
      const matches = data.filter(
        (user) => user.email?.trim().toLowerCase() === normalized,
      );
      if (matches.length > 1) {
        throw new ConflictException('Existen varias cuentas en Keycloak con el mismo correo');
      }
      return matches[0] ?? null;
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      this.logger.error('[findAccountByEmail] No fue posible consultar los usuarios de Keycloak');
      throw new ServiceUnavailableException('No se pudo consultar Keycloak');
    }
  }

  /** Garantiza unicidad entre PostgreSQL y Keycloak al registrar COMPRADORES. */
  async emailExists(email: string): Promise<boolean> {
    return (await this.findAccountByEmail(email)) !== null;
  }

  /** Lectura paginada; NO cambia usuarios. Usada por el sincronizador automático. */
  async listUsersPage(first: number, max: number): Promise<KeycloakAccount[]> {
    const adminToken = await this.getAdminToken();
    try {
      const response = await axios.get<KeycloakAccount[]>(
        `${this.keycloakUrl}/admin/realms/${encodeURIComponent(this.realm)}/users`,
        {
          headers: { Authorization: `Bearer ${adminToken}` },
          params: { first, max, briefRepresentation: true },
          timeout: 8000,
        },
      );
      return response.data;
    } catch {
      throw new ServiceUnavailableException('No se pudo listar usuarios de Keycloak');
    }
  }

  /**
   * Recupera el usuario que el administrador creó MANUALMENTE en Keycloak.
   * Los roles STAFF/ORGANIZADOR deben estar asignados como realm roles.
   * El RUT debe encontrarse como atributo de usuario `rut`.
   */
  async getUserByEmail(email: string): Promise<KeycloakStaffProfile> {
    const account = await this.findAccountByEmail(email);
    if (!account) {
      throw new NotFoundException('Primero debe crear la cuenta en Keycloak');
    }
    if (!account.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(account.id)) {
      throw new BadGatewayException('Keycloak devolvió un UUID inválido');
    }

    const token = await this.getAdminToken();
    const base = `${this.keycloakUrl}/admin/realms/${encodeURIComponent(this.realm)}/users/${encodeURIComponent(account.id)}`;
    let profile: KeycloakAccount;
    let realmRoles: Array<{ name: string }>;
    try {
      const [userResponse, rolesResponse] = await Promise.all([
        axios.get<KeycloakAccount>(base, {
          headers: { Authorization: `Bearer ${token}` }, timeout: 5000,
        }),
        axios.get<Array<{ name: string }>>(`${base}/role-mappings/realm/composite`, {
          headers: { Authorization: `Bearer ${token}` }, timeout: 5000,
        }),
      ]);
      profile = userResponse.data;
      realmRoles = rolesResponse.data;
    } catch (error) {
      this.logger.error('[getUserByEmail] No fue posible leer perfil o roles de Keycloak');
      throw new ServiceUnavailableException('No se pudo consultar el perfil en Keycloak');
    }
    const adminRoles = realmRoles
      .map(({ name }) => name.toUpperCase())
      .filter((role) => role === 'STAFF' || role === 'ORGANIZADOR');
    const distinct = [...new Set(adminRoles)];
    if (distinct.length !== 1) {
      throw new BadRequestException('Asigne exactamente un realm role STAFF u ORGANIZADOR en Keycloak');
    }

    const rutAttribute = profile.attributes?.rut;
    const rutRaw = (Array.isArray(rutAttribute) ? rutAttribute[0] : rutAttribute) || '';
    const rut = rutRaw ? assertValidRut(rutRaw) : '';
    const nombre = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();
    if (!rut || !nombre) {
      throw new BadRequestException('Complete el nombre y el atributo rut en Keycloak');
    }
    const profileEmail = profile.email?.trim().toLowerCase();
    if (profile.id !== account.id || !profileEmail || profileEmail !== email.trim().toLowerCase()) {
      throw new ConflictException('La identidad de Keycloak cambió durante la consulta');
    }

    return {
      id: profile.id,
      email: profileEmail,
      nombre,
      rut,
      rol: distinct[0] as 'STAFF' | 'ORGANIZADOR',
      enabled: profile.enabled === true,
    };
  }

  /** Actualiza una contraseña ya autorizada por un token temporal de Auth. */
  async updateUserPassword(email: string, newPassword: string, expectedUuid?: string) {
    const account = await this.getUserByEmail(email);
    if (!account.enabled || (expectedUuid && expectedUuid !== account.id)) {
      throw new ConflictException('La cuenta de Keycloak no coincide con el espejo de PostgreSQL');
    }
    const adminToken = await this.getAdminToken();
    const base = `${this.keycloakUrl}/admin/realms/${encodeURIComponent(this.realm)}/users/${encodeURIComponent(account.id)}`;
    const headers = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };
    try {
      await axios.put(`${base}/reset-password`, {
        type: 'password', value: newPassword, temporary: false,
      }, { headers, timeout: 5000 });

      // Quitar solo UPDATE_PASSWORD; conservar otras acciones de seguridad.
      const { data: profile } = await axios.get<KeycloakAccount>(base, { headers, timeout: 5000 });
      const requiredActions = (profile.requiredActions ?? []).filter((action) => action !== 'UPDATE_PASSWORD');
      await axios.put(base, { requiredActions }, { headers, timeout: 5000 });
      this.logger.log(`[updateUserPassword] Contraseña administrativa actualizada uuid=${account.id}`);
      return true;
    } catch (error) {
      this.logger.error('[updateUserPassword] Falló la actualización de la contraseña administrativa');
      throw new InternalServerErrorException('No fue posible actualizar la contraseña en Keycloak');
    }
  }
}
