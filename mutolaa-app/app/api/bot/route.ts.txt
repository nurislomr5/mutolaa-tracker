import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const ALLOWED_USER_ID = Number(process.env.MY_TELEGRAM_ID!);

// Progress-bar chizish funksiyasi
function drawBar(current: number, total: number) {
  const pct = Math.min(100, Math.round((current / total) * 100));
  const filled = Math.round(pct / 10);
  return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)} ${pct}%`;
}

async function sendTelegram(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📊 Web Dashboard / Mini App', web_app: { url: process.env.NEXT_PUBLIC_APP_URL! } }]
        ]
      }
    }),
  });
}

export async function POST(req: NextRequest) {
  const update = await req.json();
  const msg = update.message;
  if (!msg || msg.from.id !== ALLOWED_USER_ID) return NextResponse.json({ ok: true });

  const chatId = msg.chat.id;

  // 1. Hozirgi aktiv kitoblarni olish
  const { data: activeBooks } = await supabase
    .from('books')
    .select('*')
    .eq('status', 'active')
    .order('track');

  // /status buyrug'i
  if (msg.text === '/status' || msg.text === '/start') {
    const lines = activeBooks?.map((b) => {
      const icon = b.track === 'audio' ? '🎧' : b.track === 'cat_a' ? '📗' : b.track === 'cat_b' ? '🕌' : '🔄';
      const unitLabel = b.unit === 'minutes' ? `${Math.floor(b.current_value / 60)}s ${b.current_value % 60}d / ${Math.floor(b.total_value / 60)}s ${b.total_value % 60}d` : `${b.current_value}/${b.total_value} bet`;
      const modeTag = b.reading_mode === 'phone' ? ' 📱(PDF)' : '';
      return `${icon} <b>${b.title}</b>${modeTag}\n<code>${drawBar(b.current_value, b.total_value)}</code> (${unitLabel})`;
    });
    await sendTelegram(chatId, `<b>📚 Hozirgi Aktiv Mutolaa:</b>\n\n${lines?.join('\n\n')}`);
    return NextResponse.json({ ok: true });
  }

  // /savollar buyrug'i — Ustozdan so'raladigan barcha ochiq savollar
  if (msg.text === '/savollar') {
    const { data: qList } = await supabase
      .from('book_notes')
      .select('*, books(title)')
      .eq('note_type', 'ustozga_savol')
      .eq('is_resolved', false);

    if (!qList?.length) {
      await sendTelegram(chatId, '✅ Hozircha ustozdan so‘raladigan ochiq savollar yo‘q.');
      return NextResponse.json({ ok: true });
    }
    const text = qList.map((q, i) => `${i + 1}. <b>${q.books.title}</b> (${q.reference_point || '-'}):\n<i>"${q.content}"</i>`).join('\n\n');
    await sendTelegram(chatId, `<b>❓ Ustozdan so‘raladigan masalalar:</b>\n\n${text}`);
    return NextResponse.json({ ok: true });
  }

  // 2. Matn yoki Ovozli xabarni Gemini orqali JSON ga aylantirish
  let contents: any[] = [];
  if (msg.voice) {
    const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${msg.voice.file_id}`).then(r => r.json());
    const audioBuffer = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${fileRes.result.file_path}`).then(r => r.arrayBuffer());
    contents.push({
      inlineData: {
        mimeType: 'audio/ogg',
        data: Buffer.from(audioBuffer).toString('base64'),
      },
    });
  } else if (msg.text) {
    contents.push(msg.text);
  }

  const systemPrompt = `
  Foydalanuvchining aktiv kitoblari: ${JSON.stringify(activeBooks?.map(b => ({ id: b.id, title: b.title, unit: b.unit, current: b.current_value, total: b.total_value })))}
  Xabarni tahlil qilib FAQAT JSON qaytar:
  {
    "action": "PROGRESS" | "NOTE" | "MODE_SWITCH",
    "book_id": number,
    "new_current_value": number, // Agar "1 soat 20 daqiqaga keldim" desa 80, agar "yana 30 daqiqa eshitdim" desa current + 30. Agar PDFda o'qiyotgan bo'lsa va PDF betini aytsa, (pdf_page / pdf_total) * total_value ga proporsional hisobla.
    "new_total_value": number | null, // Agar qog'oz kitobning aniq jami betini aytsa
    "reading_mode": "paper" | "phone" | "audio" | null,
    "note_type": "ustozga_savol" | "lugat" | "xulosa" | "taymkod" | null,
    "reference_point": string | null, // "45-bet" yoki "01:15:00"
    "note_content": string | null
  }`;

  const aiRes = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [...contents, systemPrompt],
    config: { responseMimeType: 'application/json' },
  });

  const parsed = JSON.parse(aiRes.text || '{}');
  const targetBook = activeBooks?.find((b) => b.id === parsed.book_id);

  if (!targetBook) {
    await sendTelegram(chatId, '⚠️ Qaysi kitob ekanligini aniqlay olmadim. Kitob nomini aniqroq ayting.');
    return NextResponse.json({ ok: true });
  }

  // 3A. QAYD YOKI USTOZGA SAVOL QO'SHISH
  if (parsed.action === 'NOTE') {
    await supabase.from('book_notes').insert({
      book_id: targetBook.id,
      note_type: parsed.note_type,
      reference_point: parsed.reference_point,
      content: parsed.note_content,
    });
    const badge = parsed.note_type === 'ustozga_savol' ? '❓ #ustozga_savol' : parsed.note_type === 'lugat' ? '📖 #lugat' : '💡 #xulosa';
    await sendTelegram(chatId, `✅ <b>${targetBook.title}</b> bo‘yicha saqlandi (${badge}):\n\n📍 <b>Joyi:</b> ${parsed.reference_point || 'Ko‘rsatilmadi'}\n📝 <i>"${parsed.note_content}"</i>`);
    return NextResponse.json({ ok: true });
  }

  // 3B. PROGRESS YANGILASH VA AVTOMATIK NAVBAT
  if (parsed.action === 'PROGRESS' || parsed.action === 'MODE_SWITCH') {
    const newTotal = parsed.new_total_value || targetBook.total_value;
    const newVal = Math.min(newTotal, parsed.new_current_value ?? targetBook.current_value);
    const delta = newVal - targetBook.current_value;
    const isFinished = newVal >= newTotal;

    await supabase
      .from('books')
      .update({
        current_value: newVal,
        total_value: newTotal,
        reading_mode: parsed.reading_mode || targetBook.reading_mode,
        status: isFinished ? 'completed' : 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetBook.id);

    if (delta > 0) {
      await supabase.from('reading_logs').insert({
        book_id: targetBook.id,
        delta_value: delta,
        new_value: newVal,
      });
    }

    let reply = `📈 <b>${targetBook.title}</b> yangilandi!\n<code>${drawBar(newVal, newTotal)}</code> (${newVal} / ${newTotal} ${targetBook.unit === 'minutes' ? 'daq' : 'bet'})`;

    // Agar kitob 100% tugasa, navbatdagi kitobni avtomatik active qilish
    if (isFinished) {
      const { data: nextBooks } = await supabase
        .from('books')
        .select('*')
        .eq('track', targetBook.track)
        .eq('status', 'queued')
        .order('order_num', { ascending: true })
        .limit(1);

      if (nextBooks && nextBooks.length > 0) {
        await supabase.from('books').update({ status: 'active' }).eq('id', nextBooks[0].id);
        reply += `\n\n🎉 <b>Muborak bo‘lsin, kitob yakunlandi!</b>\nShu yo‘nalish bo‘yicha navbatdagi kitob ochildi:\n👉 <b>${nextBooks[0].order_num}. ${nextBooks[0].title}</b>`;
      }
    }

    await sendTelegram(chatId, reply);
  }

  return NextResponse.json({ ok: true });
}