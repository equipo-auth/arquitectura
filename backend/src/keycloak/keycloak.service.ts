// src/keycloak/keycloak.service.ts
import { Injectable, UnauthorizedException, InternalServerErrorException, ConflictException, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class KeycloakService {
  private readonly logger = new Logger(KeycloakService.name);

  private readonly keycloakUrl: string = process.env.KEYCLOAK_URL || 'http://localhost:8080';
  private readonly realm: string = process.env.KEYCLOAK_REALM || 'ticketu';
  private readonly clientId: string = process.env.KEYCLOAK_CLIENT_ID || 'ticketu-backend';
  private readonly clientSecret: string = process.env.KEYCLOAK_CLIENT_SECRET || '';

  private readonly adminUser: string = process.env.KEYCLOAK_ADMIN_USER || 'admin';
  private readonly adminPassword: string = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';

  // Debe ser menor al timeout de la transacción de provisión (20 s)
  private readonly httpTimeoutMs = 4000;

  async validateUserCredentials(email: string, password: string) {
    try {
      const response = await axios.post(
        `${this.keycloakUrl}/realms/${this.realm}/protocol/openid-connect/token`,
        new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'password',
          username: email,
          password: password,
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: this.httpTimeoutMs }
      );
      return response.data;
    } catch (error) {
      const errorData = error.response?.data;
      
      if (errorData?.error_description === 'Account is not fully set up') {
        throw new Error('resolve_required_actions');
      }

      this.logger.error(`[validateUserCredentials] Error de autenticación en Keycloak: ${JSON.stringify(errorData)}`);
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
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: this.httpTimeoutMs }
      );
      return response.data.access_token;
    } catch (error) {
      this.logger.error(`[getAdminToken] Error obteniendo token de Admin Keycloak: ${error.message}`);
      throw new InternalServerErrorException('Error de conexión interna con Keycloak');
    }
  }

  /**
   * HU-B4: crea el usuario en Keycloak sin credencial, con la acción requerida
   * UPDATE_PASSWORD y el realm role indicado (ORGANIZADOR | STAFF).
   * Retorna el ID de Keycloak. Si la asignación de rol falla, elimina el usuario
   * recién creado para no dejar cuentas huérfanas.
   */
  async createStaffUser(params: { email: string; nombre: string; rol: 'ORGANIZADOR' | 'STAFF' }): Promise<string> {
    const adminToken = await this.getAdminToken();
    const headers = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };
    const base = `${this.keycloakUrl}/admin/realms/${this.realm}`;

    let keycloakUserId: string;
    try {
      const response = await axios.post(
        `${base}/users`,
        {
          username: params.email,
          email: params.email,
          firstName: params.nombre,
          enabled: true,
          emailVerified: true,
          requiredActions: ['UPDATE_PASSWORD'],
        },
        { headers, timeout: this.httpTimeoutMs },
      );
      const location: string = response.headers?.location ?? '';
      keycloakUserId = location.substring(location.lastIndexOf('/') + 1);
      if (!keycloakUserId) {
        throw new Error('Keycloak no retornó el ID del usuario creado');
      }
    } catch (error) {
      if (error.response?.status === 409) {
        throw new ConflictException('Los datos ingresados ya se encuentran registrados en la plataforma');
      }
      this.logger.error(`[createStaffUser] Error creando usuario en Keycloak: ${error.message}`);
      throw new InternalServerErrorException('No se pudo crear la cuenta en Keycloak');
    }

    try {
      const role = await axios.get(`${base}/roles/${encodeURIComponent(params.rol)}`, {
        headers,
        timeout: this.httpTimeoutMs,
      });
      await axios.post(`${base}/users/${keycloakUserId}/role-mappings/realm`, [role.data], {
        headers,
        timeout: this.httpTimeoutMs,
      });
    } catch (error) {
      this.logger.error(`[createStaffUser] Error asignando rol ${params.rol} en Keycloak: ${error.message}`);
      await this.deleteUser(keycloakUserId).catch(() => undefined);
      throw new InternalServerErrorException('No se pudo asignar el rol en Keycloak');
    }

    this.logger.log(`Usuario ${params.rol} creado en Keycloak: ${params.email} (id=${keycloakUserId})`);
    return keycloakUserId;
  }

  /** Compensación: elimina un usuario de Keycloak por su ID. */
  async deleteUser(keycloakUserId: string): Promise<void> {
    try {
      const adminToken = await this.getAdminToken();
      await axios.delete(`${this.keycloakUrl}/admin/realms/${this.realm}/users/${keycloakUserId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        timeout: this.httpTimeoutMs,
      });
      this.logger.warn(`Usuario eliminado de Keycloak (compensación): id=${keycloakUserId}`);
    } catch (error) {
      this.logger.error(`[deleteUser] No se pudo eliminar el usuario ${keycloakUserId} de Keycloak: ${error.message}`);
      throw error;
    }
  }

  async updateUserPassword(email: string, newPassword: string) {
    try {
      const adminToken = await this.getAdminToken();

      const userResponse = await axios.get(
        `${this.keycloakUrl}/admin/realms/${this.realm}/users?email=${encodeURIComponent(email)}&exact=true`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );

      if (!userResponse.data || userResponse.data.length === 0) {
        throw new Error('Usuario no encontrado en Keycloak');
      }

      const keycloakUserId = userResponse.data[0].id;

      await axios.put(
        `${this.keycloakUrl}/admin/realms/${this.realm}/users/${keycloakUserId}/reset-password`,
        {
          type: 'password',
          value: newPassword,
          temporary: false,
        },
        { headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' } }
      );

      await axios.put(
        `${this.keycloakUrl}/admin/realms/${this.realm}/users/${keycloakUserId}`,
        { requiredActions: [] },
        { headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' } }
      );

      this.logger.log(`Clave actualizada con éxito en Keycloak para: ${email}`);
      return true;

    } catch (error) {
      this.logger.error(`[updateUserPassword] Error actualizando password en Keycloak: ${error.message}`);
      throw new InternalServerErrorException('No se pudo actualizar la contraseña en Keycloak');
    }
  }
}
