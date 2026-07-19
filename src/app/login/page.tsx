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
    <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-zinc-50 to-white dark:from-black dark:to-zinc-950">
      <form
        action={authenticate}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 p-8 shadow-sm dark:border-zinc-800 dark:from-zinc-950 dark:to-black"
      >
        <h1 className="text-xl font-medium text-zinc-900 dark:text-zinc-50">Sign in</h1>

        {errorMessage && (
          <p className="rounded-md border-l-2 border-zinc-900 bg-zinc-100 px-3 py-2 text-sm text-zinc-800 dark:border-zinc-50 dark:bg-zinc-900 dark:text-zinc-200">
            {errorMessage}
          </p>
        )}

        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-md border border-zinc-300 px-3 py-2 font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Password
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="rounded-md border border-zinc-300 px-3 py-2 font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>

        <button
          type="submit"
          className="mt-2 rounded-md bg-gradient-to-b from-zinc-800 to-zinc-950 px-4 py-2 text-sm font-medium text-white hover:from-zinc-700 hover:to-zinc-900 dark:from-zinc-100 dark:to-zinc-300 dark:text-zinc-900"
        >
          Sign in
        </button>

        <p className="text-center text-sm font-normal text-zinc-600 dark:text-zinc-400">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-zinc-900 hover:underline dark:text-zinc-50">
            Create one
          </Link>
        </p>
      </form>
    </div>
  );
}
