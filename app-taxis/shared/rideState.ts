import type { Role, RideStatus } from './types';

export type RideAction = 'accept' | 'arrive' | 'start' | 'complete' | 'cancel' | 'expire';
export type Actor = Role | 'system';

interface Transition {
  from: RideStatus[];
  to: RideStatus;
  actors: Actor[];
}

const TRANSITIONS: Record<RideAction, Transition> = {
  accept: { from: ['requested'], to: 'accepted', actors: ['driver'] },
  arrive: { from: ['accepted'], to: 'arrived', actors: ['driver'] },
  start: { from: ['arrived'], to: 'in_progress', actors: ['driver'] },
  complete: { from: ['in_progress'], to: 'completed', actors: ['driver'] },
  // Una vez iniciado el viaje no se puede cancelar: solo finalizar (o el administrador).
  cancel: { from: ['requested', 'accepted', 'arrived'], to: 'cancelled', actors: ['passenger', 'driver', 'admin'] },
  expire: { from: ['requested'], to: 'expired', actors: ['system'] },
};

export function nextStatus(current: RideStatus, action: RideAction, actor: Actor): RideStatus | null {
  const t = TRANSITIONS[action];
  if (!t.actors.includes(actor)) return null;
  if (action === 'cancel' && actor === 'admin' && current === 'in_progress') return 'cancelled';
  if (!t.from.includes(current)) return null;
  // El conductor no puede cancelar una solicitud que aún no ha aceptado.
  if (action === 'cancel' && actor === 'driver' && current === 'requested') return null;
  return t.to;
}

export function allowedFrom(action: RideAction): RideStatus[] {
  return TRANSITIONS[action].from;
}

export const STATUS_LABELS: Record<RideStatus, string> = {
  requested: 'Buscando conductor',
  accepted: 'Conductor en camino',
  arrived: 'Conductor en el punto de recogida',
  in_progress: 'En viaje',
  completed: 'Finalizado',
  cancelled: 'Cancelado',
  expired: 'Sin conductores disponibles',
};
