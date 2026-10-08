export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-gray-200 bg-white px-4 py-3">
        <p className="text-lg font-semibold text-orange-700">WarungKasir</p>
      </header>
      <main className="flex-1 px-4 py-4">{children}</main>
    </div>
  );
}
