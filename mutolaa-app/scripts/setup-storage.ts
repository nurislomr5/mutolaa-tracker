/**
 * Supabase Storage: foydalanuvchi yuklaydigan kitob muqovalari uchun "covers" bucket'ini yaratadi (bir marta).
 * Bucket ochiq oʻqiladi (muqova — ommaviy rasm); yozish faqat server action orqali service role bilan.
 *
 *   npm run storage:setup
 */
import { COVER_BUCKET, COVER_MAX_BYTES, COVER_MIME_TYPES } from "../lib/covers";
import { createAdmin, loadEnv } from "./lib/common";

loadEnv();

async function main() {
  const db = createAdmin();
  const options = { public: true, fileSizeLimit: COVER_MAX_BYTES, allowedMimeTypes: [...COVER_MIME_TYPES] };
  const { data: existing } = await db.storage.getBucket(COVER_BUCKET);
  const { error } = existing ? await db.storage.updateBucket(COVER_BUCKET, options) : await db.storage.createBucket(COVER_BUCKET, options);
  if (error) throw new Error(error.message);
  console.log(`"${COVER_BUCKET}" bucket ${existing ? "yangilandi" : "yaratildi"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
