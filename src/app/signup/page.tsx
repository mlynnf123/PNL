import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AuthError } from 'next-auth';
import { auth, signIn } from '@/auth';
import { EmailAlreadyRegisteredError, registerUser } from '@/server/commands/register-user';

const ERROR_MESSAGES: Record<string, string> = {
  password_mismatch: 'Passwords do not match.',
  email_taken: 'An account with that email already exists.',
  no_organization: 'Signup is not available yet — the workspace has not been set up.',
  CredentialsSignin: 'Account created, but sign-in failed. Try signing in manually.',
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session) {
    redirect('/dashboard');
  }

  const { error } = await searchParams;
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? 'Something went wrong signing up.') : null;

  async function register(formData: FormData) {
    'use server';

    const password = String(formData.get('password'));
    const confirmPassword = String(formData.get('confirmPassword'));
    if (password !== confirmPassword) {
      redirect('/signup?error=password_mismatch');
    }

    try {
      await registerUser({
        displayName: String(formData.get('displayName')),
        email: String(formData.get('email')),
        password,
      });
    } catch (err) {
      if (err instanceof EmailAlreadyRegisteredError) {
        redirect('/signup?error=email_taken');
      }
      throw err;
    }

    try {
      await signIn('credentials', {
        email: formData.get('email'),
        password,
        redirectTo: '/dashboard',
      });
    } catch (err) {
      if (err instanceof AuthError) {
        redirect(`/signup?error=${err.type}`);
      }
      throw err;
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-zinc-50 to-white">
      <form
        action={register}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 p-8 shadow-sm"
      >
        <h1 className="text-xl font-medium text-zinc-900">Create account</h1>

        {errorMessage && (
          <p className="rounded-md border-l-2 border-zinc-900 bg-zinc-100 px-3 py-2 text-sm text-zinc-800">
            {errorMessage}
          </p>
        )}

        <label className="flex flex-col gap-1 text-sm text-zinc-700">
          Name
          <input
            name="displayName"
            type="text"
            required
            autoComplete="name"
            className="rounded-md border border-zinc-300 px-3 py-2 font-normal text-zinc-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-700">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-md border border-zinc-300 px-3 py-2 font-normal text-zinc-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-700">
          Password
          <input
            name="password"
            type="password"
            required
            autoComplete="new-password"
            className="rounded-md border border-zinc-300 px-3 py-2 font-normal text-zinc-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-700">
          Confirm password
          <input
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            className="rounded-md border border-zinc-300 px-3 py-2 font-normal text-zinc-900"
          />
        </label>

        <button
          type="submit"
          className="mt-2 rounded-md bg-gradient-to-b from-zinc-800 to-zinc-950 px-4 py-2 text-sm font-medium text-white hover:from-zinc-700 hover:to-zinc-900"
        >
          Create account
        </button>

        <p className="text-center text-sm font-normal text-zinc-600">
          Already have an account?{' '}
          <Link href="/login" className="text-zinc-900 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
