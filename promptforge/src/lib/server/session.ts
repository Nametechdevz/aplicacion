import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { SESSION_COOKIE } from './http';
import { getUserBySessionToken, type User } from './repos/users';

/** Usuario actual para Server Components (memoizado por petición). */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const store = await cookies();
  return getUserBySessionToken(store.get(SESSION_COOKIE)?.value);
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}
