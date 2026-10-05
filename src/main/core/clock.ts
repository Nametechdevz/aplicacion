export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Reloj controlable para pruebas. */
export class ManualClock implements Clock {
  constructor(private t: number = Date.now()) {}
  now() {
    return new Date(this.t);
  }
  set(d: Date | string) {
    this.t = new Date(d).getTime();
  }
  advance(ms: number) {
    this.t += ms;
  }
}

export const iso = (d: Date) => d.toISOString();
