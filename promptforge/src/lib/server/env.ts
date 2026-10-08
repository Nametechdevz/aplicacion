import 'server-only';
import path from 'node:path';

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export const env = {
  get databasePath(): string {
    return path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DATABASE_PATH?.trim() || './data/promptforge.db');
  },
  get appUrl(): string | null {
    const v = process.env.APP_URL?.trim();
    return v ? v.replace(/\/+$/, '') : null;
  },
  get allowRegistration(): boolean {
    return bool(process.env.ALLOW_REGISTRATION, true);
  },
  get cookieSecure(): boolean {
    return bool(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production');
  },
  get anthropicConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  },
};
