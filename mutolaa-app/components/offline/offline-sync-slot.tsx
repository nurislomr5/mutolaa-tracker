import { getSessionUser } from "@/lib/supabase/server";
import { OfflineSync } from "./offline-sync";

// Layout uchun: sessiya bor-yoʻqligini fon sinxronlashga maslahat sifatida beradi (Suspense ichida)
export async function OfflineSyncSlot() {
  const user = await getSessionUser();
  return <OfflineSync signedIn={Boolean(user)} />;
}
