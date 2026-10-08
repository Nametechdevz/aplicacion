import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth/auth-form';
import { env } from '@/lib/server/env';
import { countUsers } from '@/lib/server/repos/users';

export const metadata: Metadata = { title: 'Crear cuenta' };

export default function RegisterPage() {
  const firstUser = countUsers() === 0;
  return <AuthForm mode="register" registrationClosed={!env.allowRegistration && !firstUser} firstUser={firstUser} />;
}
