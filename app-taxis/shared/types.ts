export type Role = 'passenger' | 'driver' | 'admin';
export type UserStatus = 'active' | 'pending' | 'blocked';
export type PaymentMethod = 'cash' | 'card';

export type RideStatus =
  | 'requested'
  | 'accepted'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'expired';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Place extends LatLng {
  address: string;
}

export interface Vehicle {
  make: string;
  model: string;
  plate: string;
  color: string;
}

export interface PublicUser {
  id: number;
  role: Role;
  name: string;
  email: string;
  phone: string;
  status: UserStatus;
  rating: number | null;
  ratingCount: number;
  vehicle: Vehicle | null;
  createdAt: string;
}

export interface Tariff {
  currency: string;
  baseFare: number;
  perKm: number;
  perMinute: number;
  minimumFare: number;
  surge: number;
}

export interface RouteInfo {
  distanceM: number;
  durationS: number;
  geometry: [number, number][];
  approximate: boolean;
}

export interface Quote extends RouteInfo {
  fare: number;
  currency: string;
}

export interface RidePerson {
  id: number;
  name: string;
  phone: string;
  rating: number | null;
  vehicle: Vehicle | null;
}

export interface Ride {
  id: number;
  status: RideStatus;
  pickup: Place;
  dropoff: Place;
  distanceM: number;
  durationS: number;
  geometry: [number, number][];
  fareEstimate: number;
  fareFinal: number | null;
  currency: string;
  paymentMethod: PaymentMethod;
  passenger: RidePerson;
  driver: RidePerson | null;
  requestedAt: string;
  acceptedAt: string | null;
  arrivedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: Role | 'system' | null;
  cancelReason: string | null;
  ratingByPassenger: number | null;
  ratingByDriver: number | null;
}

export interface DriverLocation extends LatLng {
  driverId: number;
  heading: number | null;
  online: boolean;
  updatedAt: string;
}

export const ACTIVE_RIDE_STATUSES: RideStatus[] = ['requested', 'accepted', 'arrived', 'in_progress'];
