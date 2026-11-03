"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uz } from "@/lib/i18n/uz";
import { sendLoginEmail, signInWithGoogle, verifyLoginCode, type LoginState } from "./actions";

// "Boshqa email" bosilganda key oʻzgaradi va forma holati (useActionState) toʻliq tozalanadi
type Props = { next: string; initialError?: string; googleEnabled: boolean; telegramUrl: string | null };

export function LoginForm(props: Props) {
  const [attempt, setAttempt] = useState(0);
  return <LoginFlow key={attempt} {...props} initialError={attempt ? undefined : props.initialError} onReset={() => setAttempt((n) => n + 1)} />;
}

function LoginFlow({ next, initialError, onReset, googleEnabled, telegramUrl }: Props & { onReset: () => void }) {
  const t = uz.auth;
  const [sent, sendAction, sending] = useActionState(sendLoginEmail, { step: "email" } as LoginState);
  const [verified, verifyAction, verifying] = useActionState(verifyLoginCode, { step: "code", email: "" } as LoginState);
  const email = sent.email ?? "";

  if (sent.step === "code") {
    return (
      <div>
        <h2 className="font-serif text-xl font-semibold">{t.sentTitle}</h2>
        <p className="mt-2 text-sm text-muted">{t.sentBody(email)}</p>
        <form action={verifyAction} className="mt-6 space-y-3">
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="next" value={next} />
          <label className="block text-sm font-medium" htmlFor="code">
            {t.code}
          </label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            required
            autoFocus
            placeholder="123456"
            className="h-12 text-center text-lg tracking-[0.4em]"
          />
          {verified.error && <p className="text-sm text-danger">{verified.error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={verifying}>
            {verifying ? t.verifying : t.verify}
          </Button>
        </form>
        <button type="button" onClick={onReset} className="mt-4 text-sm text-accent hover:underline">
          {t.otherEmail}
        </button>
      </div>
    );
  }

  return (
    <div>
      {telegramUrl && (
        <>
          <a
            href={telegramUrl}
            target="_blank"
            rel="noreferrer"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#229ED9] font-medium text-white hover:bg-[#1d8cc0]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M9.8 15.3 9.6 19c.4 0 .6-.2.8-.4l2-1.9 4.1 3c.8.4 1.3.2 1.5-.7l2.7-12.7c.3-1.1-.4-1.6-1.2-1.3L3.7 10.6c-1.1.4-1.1 1-.2 1.3l4.1 1.3 9.6-6c.5-.3.9-.1.5.2" />
            </svg>
            {t.telegram}
          </a>
          <p className="mt-2 text-center text-xs text-muted">{t.telegramHint}</p>
          <div className="my-6 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-border" />
            {t.or}
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
      <form action={sendAction} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <label className="block text-sm font-medium" htmlFor="email">
          {t.email}
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={email}
          placeholder={t.emailPlaceholder}
          className="h-12"
        />
        {(sent.error ?? initialError) && <p className="text-sm text-danger">{sent.error ?? initialError}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={sending}>
          {sending ? t.sending : t.sendLink}
        </Button>
      </form>

      {googleEnabled && (
        <>
      <div className="my-6 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" />
        {t.or}
        <span className="h-px flex-1 bg-border" />
      </div>

      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <Button type="submit" variant="secondary" size="lg" className="w-full">
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
            <path fill="#4285F4" d="M22.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.7 3.3-7.9Z" />
            <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23Z" />
            <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.4V7H2.1a11 11 0 0 0 0 10l3.7-2.8Z" />
            <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4Z" />
          </svg>
          {t.google}
        </Button>
      </form>
        </>
      )}
    </div>
  );
}
