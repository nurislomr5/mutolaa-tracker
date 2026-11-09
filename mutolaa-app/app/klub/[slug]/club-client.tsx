"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  addClubPost,
  deleteClub,
  deleteClubPost,
  joinClub,
  leaveClub,
  resetClubInvite,
  searchClubBooks,
  setClubBook,
  type ClubResult,
} from "@/app/actions/clubs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uz } from "@/lib/i18n/uz";

// Klub sahifasining interaktiv qismlari (server qismi — page.tsx)
const t = uz.clubs;

function ErrorText({ result }: { result: ClubResult | null }) {
  return result && !result.ok ? <p className="mt-2 text-sm text-danger">{result.error}</p> : null;
}

export function JoinButton({ clubId }: { clubId: number }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ClubResult | null>(null);
  return (
    <div>
      <Button type="button" disabled={pending} onClick={() => start(async () => setResult(await joinClub(clubId)))}>
        {t.join}
      </Button>
      <p className="mt-2 max-w-sm text-xs text-muted">{t.joinNote}</p>
      <ErrorText result={result} />
    </div>
  );
}

export function LeaveButton({ clubId }: { clubId: number }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ClubResult | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        className="text-sm text-muted hover:text-danger hover:underline"
        onClick={() => window.confirm(t.leaveConfirm) && start(async () => setResult(await leaveClub(clubId)))}
      >
        {t.leave}
      </button>
      <ErrorText result={result} />
    </div>
  );
}

export function RemoveMemberButton({ clubId, userId, name }: { clubId: number; userId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs text-muted hover:text-danger hover:underline"
      onClick={() => window.confirm(t.removeMemberConfirm(name)) && start(async () => void (await leaveClub(clubId, userId)))}
    >
      {t.removeMember}
    </button>
  );
}

// Egasi: joriy kitobni qidirib tanlash yoki olib tashlash
export function BookPicker({ clubId, hasBook }: { clubId: number; hasBook: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchClubBooks>>>([]);
  const [pending, start] = useTransition();
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const search = (value: string) => {
    setQ(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => setResults(await searchClubBooks(value)), 300);
  };

  if (!open) {
    return (
      <div className="mt-3 flex gap-3 text-sm">
        <button type="button" className="font-medium text-accent hover:underline" onClick={() => setOpen(true)}>
          {hasBook ? t.changeBook : t.chooseBook}
        </button>
        {hasBook && (
          <button type="button" disabled={pending} className="text-muted hover:text-danger hover:underline" onClick={() => start(async () => void (await setClubBook(clubId, null)))}>
            {t.removeBook}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="mt-3">
      <Input value={q} onChange={(e) => search(e.target.value)} placeholder={t.searchBook} aria-label={t.searchBook} autoFocus className="h-10" />
      <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
        {results.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              disabled={pending}
              className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
              onClick={() =>
                start(async () => {
                  await setClubBook(clubId, b.id);
                  setOpen(false);
                })
              }
            >
              <span className="font-medium">{b.title}</span>
              {b.author_names && <span className="text-muted"> — {b.author_names}</span>}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="mt-2 text-sm text-muted hover:underline" onClick={() => setOpen(false)}>
        {uz.offline.cancel}
      </button>
    </div>
  );
}

export function InvitePanel({ clubId, url }: { clubId: number; url: string }) {
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div>
      <p className="text-xs text-muted">{t.inviteHint}</p>
      <div className="mt-2 flex gap-2">
        <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label={t.invite} className="h-10 flex-1 text-xs" />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard?.writeText(url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2500);
          }}
        >
          {copied ? t.copied : t.copy}
        </Button>
      </div>
      <button
        type="button"
        disabled={pending}
        className="mt-2 text-xs text-muted hover:text-text hover:underline"
        onClick={() => window.confirm(t.resetInviteConfirm) && start(async () => void (await resetClubInvite(clubId)))}
      >
        {t.resetInvite}
      </button>
    </div>
  );
}

export function DeleteClubButton({ clubId }: { clubId: number }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-sm text-danger hover:underline"
      onClick={() => window.confirm(t.deleteClubConfirm) && start(async () => void (await deleteClub(clubId)))}
    >
      {t.deleteClub}
    </button>
  );
}

export function PostForm({ clubId, parentId, onDone }: { clubId: number; parentId?: number; onDone?: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: ClubResult | null, fd: FormData) => {
    const res = await addClubPost(prev, fd);
    if (res.ok) {
      formRef.current?.reset();
      onDone?.();
    }
    return res;
  }, null);
  return (
    <form ref={formRef} action={action} className={parentId ? "mt-2" : ""}>
      <input type="hidden" name="clubId" value={clubId} />
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      <textarea
        name="body"
        required
        maxLength={2000}
        rows={parentId ? 2 : 3}
        placeholder={parentId ? t.replyPlaceholder : t.postPlaceholder}
        aria-label={parentId ? t.replyPlaceholder : t.postPlaceholder}
        className="w-full rounded-lg border border-border bg-surface p-3 text-sm placeholder:text-muted"
        autoFocus={Boolean(parentId)}
      />
      <div className="mt-1 flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {t.send}
        </Button>
        {state && !state.ok && <span className="text-sm text-danger">{state.error}</span>}
      </div>
    </form>
  );
}

export function ReplyToggle({ clubId, parentId }: { clubId: number; parentId: number }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <PostForm clubId={clubId} parentId={parentId} onDone={() => setOpen(false)} />
  ) : (
    <button type="button" className="text-xs text-accent hover:underline" onClick={() => setOpen(true)}>
      {t.reply}
    </button>
  );
}

export function DeletePostButton({ postId }: { postId: number }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs text-muted hover:text-danger hover:underline"
      onClick={() => window.confirm(t.deleteConfirm) && start(async () => void (await deleteClubPost(postId)))}
    >
      {t.delete}
    </button>
  );
}
