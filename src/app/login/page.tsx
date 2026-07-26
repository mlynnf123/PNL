import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AuthError } from 'next-auth';
import { auth, signIn } from '@/auth';

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: 'Incorrect email or password.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session) {
    redirect('/dashboard');
  }

  const { error } = await searchParams;
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? 'Something went wrong signing in.') : null;

  async function authenticate(formData: FormData) {
    'use server';
    try {
      await signIn('credentials', {
        email: formData.get('email'),
        password: formData.get('password'),
        redirectTo: '/dashboard',
      });
    } catch (err) {
      if (err instanceof AuthError) {
        redirect(`/login?error=${err.type}`);
      }
      throw err;
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-slate-50">
      <form
        action={authenticate}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-slate-200 bg-white p-8 shadow-sm"
      >
        <h1 className="text-xl font-medium text-slate-900">Sign in</h1>

        {errorMessage && (
          <p className="rounded-md border-l-2 border-slate-900 bg-slate-100 px-3 py-2 text-sm text-slate-800">
            {errorMessage}
          </p>
        )}

        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-md border border-slate-300 px-3 py-2 font-normal text-slate-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Password
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="rounded-md border border-slate-300 px-3 py-2 font-normal text-slate-900"
          />
        </label>

        <button
          type="submit"
          className="mt-2 rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
        >
          Sign in
        </button>

        <p className="text-center text-sm font-normal text-slate-600">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-slate-900 hover:underline">
            Create one
          </Link>
        </p>
      </form>
    </div>
  );
}
