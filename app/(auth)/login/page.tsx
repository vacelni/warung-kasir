import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm, SignedOutNotice } from '@/features/auth/LoginForm';
import packageJson from '@/package.json';

export const metadata: Metadata = {
  title: 'Masuk — WarungKasir',
};

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-orange-700">WarungKasir</h1>
          <p className="mt-1 text-base text-gray-600">Sistem Kasir Warung</p>
        </div>
        <Suspense fallback={null}>
          <SignedOutNotice />
        </Suspense>
        <LoginForm />
        <p className="mt-8 text-center text-xs text-gray-500">Versi {packageJson.version}</p>
      </div>
    </main>
  );
}
