export type Role = 'admin' | 'supervisor' | 'agent';

export const PERMISSIONS = {
  'contacts.view': 'Ver contactos',
  'contacts.edit': 'Crear y editar contactos',
  'contacts.delete': 'Eliminar contactos',
  'contacts.import': 'Importar contactos',
  'contacts.export': 'Exportar contactos',
  'tags.manage': 'Gestionar etiquetas y segmentos',
  'inbox.view': 'Ver conversaciones',
  'messages.send': 'Enviar mensajes',
  'campaigns.view': 'Ver campañas',
  'campaigns.manage': 'Crear, programar y controlar campañas',
  'automations.view': 'Ver automatizaciones',
  'automations.manage': 'Editar automatizaciones e IA',
  'templates.manage': 'Gestionar plantillas, respuestas rápidas y multimedia',
  'tasks.manage': 'Gestionar tareas y pipeline',
  'stats.view': 'Ver estadísticas',
  'settings.manage': 'Configuración general',
  'accounts.manage': 'Gestionar cuentas de WhatsApp',
  'users.manage': 'Gestionar usuarios',
  'backup.manage': 'Backups y restauración',
  'audit.view': 'Ver auditoría',
} as const;

export type Permission = keyof typeof PERMISSIONS;

const ALL = Object.keys(PERMISSIONS) as Permission[];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ALL,
  supervisor: ALL.filter((p) => !['users.manage', 'backup.manage', 'accounts.manage', 'settings.manage'].includes(p)),
  agent: ['contacts.view', 'contacts.edit', 'inbox.view', 'messages.send', 'campaigns.view', 'automations.view', 'tasks.manage', 'tags.manage'],
};

export const ROLE_LABELS: Record<Role, string> = { admin: 'Administrador', supervisor: 'Supervisor', agent: 'Agente' };

export function hasPermission(role: Role, perm: Permission, extra?: Permission[] | null): boolean {
  return ROLE_PERMISSIONS[role]?.includes(perm) || !!extra?.includes(perm);
}
