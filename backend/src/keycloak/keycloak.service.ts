import { Injectable, UnauthorizedException, InternalServerErrorException, Logger } from '@nestjs/common';
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
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
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
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      return response.data.access_token;
    } catch (error) {
      this.logger.error(`[getAdminToken] Error obteniendo token de Admin Keycloak: ${error.message}`);
      throw new InternalServerErrorException('Error de conexión interna con Keycloak');
    }
  }

  async updateUserPassword(email: string, newPassword: string) {
    try {
      const adminToken = await this.getAdminToken();

      const userResponse = await axios.get(
        `${this.keycloakUrl}/admin/realms/${this.realm}/users?email=${email}&exact=true`,
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
