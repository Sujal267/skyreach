'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Alert, Button, Field, Input, Skeleton } from '@/components/ui';

/**
 * Auth is deliberately plain. It is the least interesting part of this product
 * and a fast, correct, unfussy sign-in signals more competence here than an
 * animated one would.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto my-24 h-96 w-full max-w-md" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { login, user, loading: authLoading } = useAuth();

  const next = params.get('next') ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in — no reason to show a login form.
  useEffect(() => {
    if (!authLoading && user) router.replace(next);
  }, [user, authLoading, router, next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(email.trim(), password);
      router.push(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-16">
      <h1 className="font-display text-h1 text-content">Sign in</h1>
      <p className="mt-2 text-caption text-content-muted">
        Seats are held against your account while you check out.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        {error && <Alert>{error}</Alert>}

        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            disabled={submitting}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            disabled={submitting}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <Button type="submit" size="lg" fullWidth loading={submitting}>
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-caption text-content-muted">
        No account?{' '}
        <Link
          href={`/signup?next=${encodeURIComponent(next)}`}
          className="text-sky underline underline-offset-2"
        >
          Create one
        </Link>
      </p>

      {/* Seeded demo account, so a reviewer can get in without signing up. */}
      <div className="mt-8 rounded border border-dashed border-line p-4">
        <p className="text-caption font-semibold text-content">Demo account</p>
        <p className="mt-1 font-mono text-caption text-content-muted">
          demo@skyreach.app · skyreach123
        </p>
        <button
          type="button"
          onClick={() => {
            setEmail('demo@skyreach.app');
            setPassword('skyreach123');
          }}
          className="tactile mt-2 text-caption text-sky underline underline-offset-2"
        >
          Fill these in
        </button>
      </div>
    </div>
  );
}
