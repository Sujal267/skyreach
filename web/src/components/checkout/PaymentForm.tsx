'use client';

import { useId, useState } from 'react';

import { Alert, Field, Input } from '@/components/ui';

/**
 * ── Simulated card entry ────────────────────────────────────────────────────
 *
 * This deliberately looks and behaves like a real payment element — formatting,
 * validation, a declined path — because the point of the demo is the *booking*
 * flow around payment, and a placeholder "click to pretend" button would not
 * exercise it.
 *
 * What it very deliberately does NOT do is transmit anything. The card number
 * never leaves this component; only the last four digits are handed back, and
 * only so the receipt line reads plausibly. In a real build this whole file is
 * replaced by Stripe's Payment Element, which is the only way card data should
 * ever be handled — inside a PCI-compliant iframe that the host page cannot
 * read.
 *
 * The `4242` test number is honoured as the success path, and anything else
 * is declined, so the error state is reachable on demand.
 */

export interface PaymentFormValue {
  cardNumber: string;
  expiry: string;
  cvc: string;
  name: string;
}

export interface PaymentFormProps {
  value: PaymentFormValue;
  onChange: (value: PaymentFormValue) => void;
  errors: Partial<Record<keyof PaymentFormValue, string>>;
  disabled?: boolean;
}

/** "4242424242424242" -> "4242 4242 4242 4242" */
export function formatCardNumber(raw: string): string {
  return (
    raw
      .replace(/\D/g, '')
      .slice(0, 16)
      .match(/.{1,4}/g)
      ?.join(' ') ?? ''
  );
}

/** "1230" -> "12/30", and stops you typing month 19. */
export function formatExpiry(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length === 0) return '';

  let month = digits.slice(0, 2);
  if (month.length === 1 && Number(month) > 1) month = `0${month}`;
  if (month.length === 2 && Number(month) > 12) month = '12';
  if (month === '00') month = '01';

  return digits.length <= 2 ? month : `${month}/${digits.slice(2)}`;
}

export function validatePayment(
  value: PaymentFormValue,
): Partial<Record<keyof PaymentFormValue, string>> {
  const errors: Partial<Record<keyof PaymentFormValue, string>> = {};

  const digits = value.cardNumber.replace(/\s/g, '');
  if (digits.length !== 16) {
    errors.cardNumber = 'Enter all 16 digits';
  } else if (digits !== '4242424242424242') {
    // The one "decline" in the demo, and it is a useful one — it proves the
    // booking stays PENDING and the seat hold survives a failed payment.
    errors.cardNumber = 'Card declined. Use 4242 4242 4242 4242 for this demo.';
  }

  const [mm, yy] = value.expiry.split('/');
  if (!mm || !yy || yy.length !== 2) {
    errors.expiry = 'MM/YY';
  } else {
    const expiry = new Date(2000 + Number(yy), Number(mm), 0, 23, 59, 59);
    if (expiry.getTime() < Date.now()) errors.expiry = 'That date has passed';
  }

  if (!/^\d{3,4}$/.test(value.cvc)) errors.cvc = '3 or 4 digits';
  if (value.name.trim().length < 2) errors.name = 'Enter the name on the card';

  return errors;
}

export default function PaymentForm({ value, onChange, errors, disabled }: PaymentFormProps) {
  const id = useId();
  const [focused, setFocused] = useState(false);

  const set = (patch: Partial<PaymentFormValue>) => onChange({ ...value, ...patch });

  return (
    <div className="rounded border border-line bg-surface-sunken p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-h3 text-content">Card details</h3>
        <span className="font-mono text-[0.6875rem] uppercase tracking-wider text-content-muted">
          Simulated
        </span>
      </div>

      <div
        className={`space-y-4 rounded border bg-surface-raised p-4 transition-colors duration-fast ease-out ${
          focused ? 'border-sky' : 'border-line'
        }`}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <Field label="Card number" htmlFor={`${id}-number`} error={errors.cardNumber}>
          <Input
            id={`${id}-number`}
            inputMode="numeric"
            autoComplete="off"
            placeholder="4242 4242 4242 4242"
            value={value.cardNumber}
            disabled={disabled}
            aria-invalid={Boolean(errors.cardNumber)}
            onChange={(e) => set({ cardNumber: formatCardNumber(e.target.value) })}
            className="font-mono tracking-wider"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Expiry" htmlFor={`${id}-expiry`} error={errors.expiry}>
            <Input
              id={`${id}-expiry`}
              inputMode="numeric"
              autoComplete="off"
              placeholder="12/30"
              value={value.expiry}
              disabled={disabled}
              aria-invalid={Boolean(errors.expiry)}
              onChange={(e) => set({ expiry: formatExpiry(e.target.value) })}
              className="font-mono"
            />
          </Field>

          <Field label="CVC" htmlFor={`${id}-cvc`} error={errors.cvc}>
            <Input
              id={`${id}-cvc`}
              inputMode="numeric"
              autoComplete="off"
              placeholder="123"
              maxLength={4}
              value={value.cvc}
              disabled={disabled}
              aria-invalid={Boolean(errors.cvc)}
              onChange={(e) => set({ cvc: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              className="font-mono"
            />
          </Field>
        </div>

        <Field label="Name on card" htmlFor={`${id}-name`} error={errors.name}>
          <Input
            id={`${id}-name`}
            autoComplete="off"
            placeholder="A. Sharma"
            value={value.name}
            disabled={disabled}
            aria-invalid={Boolean(errors.name)}
            onChange={(e) => set({ name: e.target.value })}
          />
        </Field>
      </div>

      <p className="mt-3 text-caption leading-relaxed text-content-muted">
        Nothing you type here is sent anywhere. A production build would embed Stripe’s Payment
        Element instead, so card data never touches this page at all.
      </p>
    </div>
  );
}
