import { Suspense } from "react";
import { BottomNavBar, BottomNavShell } from "@/components/bottom-nav-bar";
import { getProfile } from "@/lib/shelf";
import { getSessionUser } from "@/lib/supabase/server";

// Pastki menyu: "Profil" — ochiq profil boʻlsa /u/<username>, aks holda sozlamalar; mehmonga — kirish
async function BottomNavWithProfile() {
  const user = await getSessionUser();
  let profileHref = "/kirish";
  if (user) {
    const profile = await getProfile();
    profileHref = profile?.username && profile.is_public ? `/u/${profile.username}` : "/sozlamalar";
  }
  return <BottomNavBar profileHref={profileHref} />;
}

export function BottomNav() {
  return (
    <>
      {/* menyu ostida kontent (footer) yopilib qolmasin */}
      <div aria-hidden className="h-[calc(4rem+env(safe-area-inset-bottom))] md:hidden" />
      <Suspense fallback={<BottomNavShell pathname={null} profileHref="/kirish" />}>
        <BottomNavWithProfile />
      </Suspense>
    </>
  );
}
