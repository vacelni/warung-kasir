// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { LoadingState } from './LoadingState';
import { SuccessState } from './SuccessState';

afterEach(cleanup);

describe('state components', () => {
  it('EmptyState shows a heading, text, and actions', () => {
    render(<EmptyState title="Belum ada menu" description="Tambahkan menu." actions={<button>TAMBAH MENU</button>} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Belum ada menu' })).toBeTruthy();
    expect(screen.getByText('Tambahkan menu.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'TAMBAH MENU' })).toBeTruthy();
  });

  it('ErrorState is announced as an alert and can be the page heading', () => {
    render(<ErrorState headingLevel={1} title="Gagal memuat" />);

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Gagal memuat' })).toBeTruthy();
  });

  it('SuccessState is announced as a status', () => {
    render(<SuccessState title="Transaksi Berhasil" />);

    expect(screen.getByRole('status').textContent).toContain('Transaksi Berhasil');
  });

  it('LoadingState shows a labelled status', () => {
    render(<LoadingState />);

    expect(screen.getByRole('status').textContent).toContain('Memuat…');
  });
});
