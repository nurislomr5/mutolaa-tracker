import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { uz } from "@/lib/i18n/uz";
import { getProfile } from "@/lib/shelf";
import { getSessionUser } from "@/lib/supabase/server";

// Sarlavhadagi hisob tugmasi: mehmonga "Kirish", kirgan foydalanuvchiga ism bosh harfi (sozlamalarga havola)
export async function UserNav() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <Link href="/kirish" className={buttonClasses({ size: "sm" })}>
        {uz.nav.signIn}
      </Link>
    );
  }
  const profile = await getProfile();
  const name = profile?.display_name || profile?.username || user.email || "?";
  return (
    <Link
      href="/sozlamalar"
      title={uz.nav.settings}
      aria-label={uz.nav.settings}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold uppercase text-accent"
    >
      {name.charAt(0)}
    </Link>
  );
}
