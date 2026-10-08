'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/kasir');
  }, [router]);

  return <p className="p-4 text-sm text-gray-600">Memuat…</p>;
}
