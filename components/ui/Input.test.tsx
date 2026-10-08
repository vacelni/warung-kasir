// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Input } from './Input';

afterEach(cleanup);

describe('Input', () => {
  it('links the label to the field', () => {
    render(<Input label="Nama" />);

    expect(screen.getByLabelText('Nama')).toBeTruthy();
  });

  it('marks the field invalid and describes it with the error message', () => {
    render(<Input label="Nama" error="Nama wajib diisi." hint="Nama lengkap" />);

    const field = screen.getByLabelText('Nama');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toBe(screen.getByText('Nama wajib diisi.').id);
    // The hint yields to the error so the user reads one message.
    expect(screen.queryByText('Nama lengkap')).toBeNull();
  });

  it('describes the field with its hint when valid', () => {
    render(<Input label="Nama" hint="Nama lengkap" />);

    const field = screen.getByLabelText('Nama');
    expect(field.getAttribute('aria-invalid')).toBeNull();
    expect(field.getAttribute('aria-describedby')).toBe(screen.getByText('Nama lengkap').id);
  });
});
