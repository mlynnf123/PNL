import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue(null),
  signIn: vi.fn(),
}));

vi.mock('next-auth', () => ({
  AuthError: class AuthError extends Error {},
}));

import LoginPage from './page';

describe('LoginPage', () => {
  it('renders email and password fields', async () => {
    const ui = await LoginPage({ searchParams: Promise.resolve({}) });
    render(ui);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows an error message when redirected with a credentials error', async () => {
    const ui = await LoginPage({ searchParams: Promise.resolve({ error: 'CredentialsSignin' }) });
    render(ui);

    expect(screen.getByText(/incorrect email or password/i)).toBeInTheDocument();
  });
});
