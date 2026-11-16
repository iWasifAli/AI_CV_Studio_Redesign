'use client';

import { useT } from '@/i18n/client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Check, Circle } from 'lucide-react';
import { Banner } from '@/components/ui/banner';
import { Button, ButtonLink } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { PASSWORD_RULES, applyEmailAction, checkResetCode, confirmReset } from './firebase-client';

type State =
  | { kind: 'checking' }
  | { kind: 'reset'; email: string }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string };

const EXPIRED =
  'This link has expired or was already used. Ask for a new one from the sign-in page.';

/**
 * Our own page for the links in account emails (Firebase "action" links): set a new password,
 * confirm an email address, or undo an email change. After a new password is set, the person is
 * taken back to sign in.
 */
export function AuthAction() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const mode = params.get('mode');
  const code = params.get('oobCode') ?? '';
  const [state, setState] = useState<State>({ kind: 'checking' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const done = (s: State) => live && setState(s);
    if (!code) done({ kind: 'error', message: EXPIRED });
    else if (mode === 'resetPassword')
      checkResetCode(code).then(
        (email) => done({ kind: 'reset', email }),
        () => done({ kind: 'error', message: EXPIRED }),
      );
    else if (mode === 'verifyEmail' || mode === 'recoverEmail')
      applyEmailAction(code).then(
        () =>
          done({
            kind: 'done',
            message:
              mode === 'verifyEmail'
                ? 'Your email address is confirmed.'
                : 'Your email address has been changed back. If you did not ask for the change, set a new password now.',
          }),
        () => done({ kind: 'error', message: EXPIRED }),
      );
    else done({ kind: 'error', message: 'This link is not one we recognise.' });
    return () => {
      live = false;
    };
  }, [mode, code]);

  const rulesOk = PASSWORD_RULES.every((r) => r.test(password));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!rulesOk) return setError('Please choose a password that meets all the requirements.');
    if (password !== confirm) return setError('The two passwords don’t match.');
    setBusy(true);
    try {
      await confirmReset(code, password);
      // Back to sign in with the new password.
      router.replace('/signin?reset=1');
    } catch {
      setError(EXPIRED);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5" data-testid="auth-action">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        {mode === 'resetPassword' ? t('Set a new password') : t('Your account')}
      </h1>
      {state.kind === 'checking' && <p className="text-ink-muted">{t('Checking your link…')}</p>}
      {state.kind === 'error' && (
        <>
          <Banner tone="error" title={t(state.message)} />
          <ButtonLink href="/signin" className="self-start">
            {t('Go to sign in')}
          </ButtonLink>
        </>
      )}
      {state.kind === 'done' && (
        <>
          <Banner tone="success" title={t(state.message)} />
          <ButtonLink href="/signin" className="self-start">
            {t('Go to sign in')}
          </ButtonLink>
        </>
      )}
      {state.kind === 'reset' && (
        <form onSubmit={save} className="flex flex-col gap-4" noValidate>
          <p className="text-ink-muted">{t('For {email}', { email: state.email })}</p>
          <input type="email" autoComplete="username" value={state.email} readOnly hidden />
          <TextField
            label={t('New password')}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <ul className="grid gap-1 text-sm" aria-label={t('Password requirements')}>
            {PASSWORD_RULES.map((r) => {
              const ok = r.test(password);
              return (
                <li
                  key={r.id}
                  className={cn('flex items-center gap-2', ok ? 'text-success' : 'text-ink-muted')}
                >
                  {ok ? (
                    <Check aria-hidden size={14} />
                  ) : (
                    <Circle aria-hidden size={10} className="mx-0.5" />
                  )}
                  {t(r.label)}
                  <span className="sr-only">{ok ? t('(done)') : t('(not yet)')}</span>
                </li>
              );
            })}
          </ul>
          <TextField
            label={t('Confirm password')}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={confirm && confirm !== password ? 'The passwords don’t match' : undefined}
            required
          />
          {error && <Banner tone="error" title={t(error)} />}
          <Button type="submit" loading={busy} loadingText={t('Saving…')}>
            {t('Save new password')}
          </Button>
        </form>
      )}
    </div>
  );
}
