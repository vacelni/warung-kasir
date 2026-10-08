import { describe, expect, it } from 'vitest';
import { EMPLOYEE_MESSAGES, emailError, nameError, passwordError, validateNewCashier } from './validation';

describe('passwordError', () => {
  it.each([
    ['', EMPLOYEE_MESSAGES.passwordRequired],
    ['1234567', EMPLOYEE_MESSAGES.passwordTooShort],
    ['        ', EMPLOYEE_MESSAGES.passwordBlank],
    ['x'.repeat(73), EMPLOYEE_MESSAGES.passwordTooLong],
    // 37 two-byte characters are 74 bytes: over the bcrypt limit although under 73 characters.
    ['é'.repeat(37), EMPLOYEE_MESSAGES.passwordTooLong],
  ])('rejects %j', (password, message) => {
    expect(passwordError(password)).toBe(message);
  });

  it.each(['12345678', ' spasi di tepi ', 'x'.repeat(72), 'é'.repeat(36)])('accepts %j', (password) => {
    expect(passwordError(password)).toBeUndefined();
  });
});

describe('nameError / emailError', () => {
  it('requires a non-blank name', () => {
    expect(nameError('  ')).toBe(EMPLOYEE_MESSAGES.nameRequired);
    expect(nameError('Andi')).toBeUndefined();
  });

  it('requires a plausible email', () => {
    expect(emailError('')).toBe(EMPLOYEE_MESSAGES.emailRequired);
    expect(emailError('andi')).toBe(EMPLOYEE_MESSAGES.emailInvalid);
    expect(emailError('andi@warung')).toBe(EMPLOYEE_MESSAGES.emailInvalid);
    expect(emailError(' andi@warung.test ')).toBeUndefined();
  });
});

describe('validateNewCashier', () => {
  it('trims the name, trims and lowercases the email, keeps the password as typed', () => {
    expect(validateNewCashier({ name: '  Fajar ', email: ' Fajar@Warung.Test ', password: ' rahasia1 ' })).toEqual({
      ok: true,
      input: { name: 'Fajar', email: 'fajar@warung.test', password: ' rahasia1 ' },
    });
  });

  it('reports every invalid field at once', () => {
    expect(validateNewCashier({ name: '', email: 'x', password: 'short' })).toEqual({
      ok: false,
      errors: {
        name: EMPLOYEE_MESSAGES.nameRequired,
        email: EMPLOYEE_MESSAGES.emailInvalid,
        password: EMPLOYEE_MESSAGES.passwordTooShort,
      },
    });
  });
});
