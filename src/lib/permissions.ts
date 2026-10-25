// Espejo de public.role_has_permission (SQL). Solo decide qué se MUESTRA en la interfaz;
// la autorización real la hace siempre la base de datos.
export type Role = 'owner' | 'admin' | 'manager' | 'staff';
export type Permission = 'operate' | 'customers.view' | 'adjust' | 'stats' | 'config' | 'team' | 'audit' | 'billing';

const MATRIX: Record<Permission, Role[]> = {
  operate: ['owner', 'admin', 'manager', 'staff'],
  'customers.view': ['owner', 'admin', 'manager', 'staff'],
  adjust: ['owner', 'admin', 'manager'],
  stats: ['owner', 'admin', 'manager'],
  config: ['owner', 'admin'],
  team: ['owner', 'admin'],
  audit: ['owner', 'admin'],
  billing: ['owner'],
};

export function roleCan(role: Role | null | undefined, perm: Permission): boolean {
  return !!role && MATRIX[perm].includes(role);
}

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Titular',
  admin: 'Administrador',
  manager: 'Encargado de sucursal',
  staff: 'Empleado',
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  owner: 'Control total, incluida la suscripción.',
  admin: 'Configura tarjetas, recompensas, sucursales y equipo (excepto otros administradores).',
  manager: 'Opera, consulta estadísticas y corrige movimientos en sus sucursales.',
  staff: 'Escanea tarjetas, suma sellos o puntos y registra canjes.',
};

export const PERMISSION_LABEL: Record<Permission, string> = {
  operate: 'Registrar compras y canjes',
  'customers.view': 'Buscar clientes',
  adjust: 'Anular y ajustar movimientos',
  stats: 'Ver estadísticas y movimientos',
  config: 'Configurar comercio, tarjetas y recompensas',
  team: 'Gestionar equipo',
  audit: 'Ver auditoría',
  billing: 'Gestionar suscripción',
};

export const ALL_PERMISSIONS = Object.keys(MATRIX) as Permission[];
export const ALL_ROLES: Role[] = ['owner', 'admin', 'manager', 'staff'];
