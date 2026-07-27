'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Alert, Button, Field, Input, Skeleton } from '@/components/ui';

export default function SignupPage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto my-24 h-96 w-full max-w-md" />}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { signup, user, loading: authLoading } = useAuth();

  const next = params.get('next') ?? '/dashboard';

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && user) router.replace(next);
  }, [user, authLoading, router, next]);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setErrors({});
    setSubmitting(true);

    try {
      await signup({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      router.push(next);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        // Field-level messages from the server's zod validation.
        if (err.details) setErrors(err.details);
      } else {
        setError('Could not create your account. Try again.');
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-16">
      <h1 className="font-display text-h1 text-content">Create an account</h1>
      <p className="mt-2 text-caption text-content-muted">
        Takes a moment. No email confirmation in this demo.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-5">
        {error && <Alert>{error}</Alert>}

        <div className="grid grid-cols-2 gap-4">
          <Field label="First name" htmlFor="firstName" error={errors.firstName?.[0]}>
            <Input
              id="firstName"
              required
              autoComplete="given-name"
              value={form.firstName}
              disabled={submitting}
              onChange={(e) => set({ firstName: e.target.value })}
            />
          </Field>

          <Field label="Last name" htmlFor="lastName" error={errors.lastName?.[0]}>
            <Input
              id="lastName"
              required
              autoComplete="family-name"
              value={form.lastName}
              disabled={submitting}
              onChange={(e) => set({ lastName: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Email" htmlFor="email" error={errors.email?.[0]}>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={form.email}
            disabled={submitting}
            onChange={(e) => set({ email: e.target.value })}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          error={errors.password?.[0]}
          hint="At least 8 characters."
        >
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={form.password}
            disabled={submitting}
            onChange={(e) => set({ password: e.target.value })}
          />
        </Field>

        <Button type="submit" size="lg" fullWidth loading={submitting}>
          Create account
        </Button>
      </form>

      <p className="mt-6 text-caption text-content-muted">
        Already have one?{' '}
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="text-sky underline underline-offset-2"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
