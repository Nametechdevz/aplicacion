/**
 * Catálogo de nodos del Automation Builder. Solo incluye triggers que la integración realmente
 * soporta (los eventos los genera el propio CRM o los webhooks oficiales de WhatsApp).
 */
export const TRIGGERS = {
  message_received: { label: 'Mensaje recibido', description: 'Cuando un contacto envía un mensaje.' },
  message_replied: { label: 'Mensaje respondido', description: 'Cuando un contacto responde a un mensaje nuestro.' },
  message_sent: { label: 'Mensaje enviado', description: 'Cuando se envía un mensaje manual o de campaña a un contacto.' },
  contact_created: { label: 'Contacto creado', description: 'Cuando se crea un contacto (manual, importación o primer mensaje).' },
  tag_added: { label: 'Etiqueta agregada', description: 'Cuando se agrega una etiqueta a un contacto.' },
  tag_removed: { label: 'Etiqueta eliminada', description: 'Cuando se quita una etiqueta de un contacto.' },
  schedule: { label: 'Horario determinado', description: 'En días y hora específicos, para una etiqueta o segmento.' },
  date_field: { label: 'Evento programado (fecha)', description: 'En la fecha de un campo personalizado (ej. cumpleaños, fecha de compra + N días).' },
} as const;

export const CONDITIONS = {
  message_contains: { label: 'Mensaje contiene' },
  message_starts_with: { label: 'Mensaje comienza con' },
  message_ends_with: { label: 'Mensaje termina con' },
  message_equals: { label: 'Mensaje es exactamente' },
  has_tag: { label: 'Etiqueta es' },
  not_has_tag: { label: 'Etiqueta no es' },
  phone_matches: { label: 'Número coincide' },
  business_hours: { label: 'Horario de atención' },
  day_of_week: { label: 'Día de la semana' },
  time_range: { label: 'Rango horario' },
  custom_field: { label: 'Campo personalizado' },
  contact_status: { label: 'Estado del contacto' },
  is_new_contact: { label: 'Es contacto nuevo' },
} as const;

export const ACTIONS = {
  send_message: { label: 'Enviar mensaje' },
  send_media: { label: 'Enviar imagen / documento / video' },
  add_tag: { label: 'Agregar etiqueta' },
  remove_tag: { label: 'Quitar etiqueta' },
  add_note: { label: 'Agregar nota' },
  assign: { label: 'Asignar contacto' },
  wait: { label: 'Esperar' },
  run_automation: { label: 'Ejecutar otra automatización' },
  create_task: { label: 'Crear tarea' },
  set_stage: { label: 'Mover en pipeline' },
  ai_reply: { label: 'Responder con IA' },
  stop: { label: 'Detener automatización' },
} as const;

export type TriggerType = keyof typeof TRIGGERS;
export type ConditionType = keyof typeof CONDITIONS;
export type ActionType = keyof typeof ACTIONS;
