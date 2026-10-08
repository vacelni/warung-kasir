// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast, type ToastTone } from './Toast';

function Trigger({ message, tone }: { message: string; tone?: ToastTone }) {
  const { show } = useToast();
  return <button onClick={() => show(message, tone)}>tampilkan {message}</button>;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('Toast', () => {
  it('shows a message politely and removes it after a few seconds', () => {
    render(
      <ToastProvider>
        <Trigger message="Tersimpan" tone="success" />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'tampilkan Tersimpan' }));
    expect(screen.getByRole('status').textContent).toContain('Tersimpan');

    advance(4000);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('announces errors as alerts and keeps them longer', () => {
    render(
      <ToastProvider>
        <Trigger message="Gagal" tone="danger" />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'tampilkan Gagal' }));
    expect(screen.getByRole('alert').textContent).toContain('Gagal');

    advance(4000);
    expect(screen.getByRole('alert')).toBeTruthy();

    advance(3000);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('can be dismissed by hand', () => {
    render(
      <ToastProvider>
        <Trigger message="Halo" />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'tampilkan Halo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tutup notifikasi' }));

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps at most three messages, dropping the oldest', () => {
    render(
      <ToastProvider>
        <Trigger message="satu" />
      </ToastProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'tampilkan satu' });
    for (let i = 0; i < 4; i++) fireEvent.click(trigger);

    expect(screen.getAllByRole('status')).toHaveLength(3);
  });

  it('refuses to be used outside its provider', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Trigger message="x" />)).toThrow('useToast must be used inside <ToastProvider>.');
    error.mockRestore();
  });
});
