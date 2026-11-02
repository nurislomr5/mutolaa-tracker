import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://loilpsnetdmnkcnxbgvf.supabase.co').trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
const GEMINI_KEY = (process.env.GEMINI_API_KEY || '').trim();
const BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const ALLOWED_USER_ID = Number((process.env.MY_TELEGRAM_ID || '6459052188').trim());
const rawAppUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim();
const APP_URL = rawAppUrl.startsWith('https://') ? rawAppUrl : 'https://mutolaa-tracker.vercel.app';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

// Progress-bar chizish funksiyasi
function drawBar(current: number, total: number) {
  if (!total || total <= 0) return `${'░'.repeat(10)} 0%`;
  const pct = Math.min(100, Math.round((current / total) * 100));
  const filled = Math.round(pct / 10);
  return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)} ${pct}%`;
}

async function sendTelegram(chatId: number, text: string) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📊 Web Dashboard / Mini App', web_app: { url: APP_URL } }]
        ]
      }
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('Telegram sendMessage error:', data);
    // Fallback without reply_markup/HTML if button or HTML caused failure
    const retryRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });
    const retryData = await retryRes.json().catch(() => ({}));
    return { ok: retryRes.ok, status: retryRes.status, error: data.description, retryError: retryData.description };
  }
  return { ok: true, status: res.status, message_id: data?.result?.message_id };
}

export async function POST(req: NextRequest) {
  let chatId: number | null = null;
  try {
    const update = await req.json();
    const msg = update.message;
    if (!msg) {
      return NextResponse.json({ ok: true, reason: 'no_message' });
    }
    if (ALLOWED_USER_ID && msg.from?.id !== ALLOWED_USER_ID) {
      return NextResponse.json({ ok: true, reason: 'unauthorized_user', fromId: msg.from?.id, allowedId: ALLOWED_USER_ID });
    }

    chatId = msg.chat.id;

    // 1. Hozirgi aktiv kitoblarni olish
    const { data: activeBooks, error: dbError } = await supabase
      .from('books')
      .select('*')
      .eq('status', 'active')
      .order('track');

    if (dbError) {
      const tg = await sendTelegram(
        chatId!,
        `⚠️ <b>Ma'lumotlar bazasiga (Supabase) ulanib bo‘lmadi!</b>\n\nXato: <code>${dbError.message}</code>`
      );
      return NextResponse.json({ ok: true, step: 'db_error', dbError: dbError.message, tg });
    }

    // /status buyrug'i
    if (msg.text?.startsWith('/status') || msg.text?.startsWith('/start')) {
      if (!activeBooks || activeBooks.length === 0) {
        const tg = await sendTelegram(chatId!, '📚 Hozircha aktiv kitoblar topilmadi.');
        return NextResponse.json({ ok: true, step: 'status_empty', tg });
      }
      const lines = activeBooks.map((b) => {
        const icon = b.track === 'audio' ? '🎧' : b.track === 'cat_a' ? '📗' : b.track === 'cat_b' ? '🕌' : '🔄';
        const unitLabel = b.unit === 'minutes' ? `${Math.floor(b.current_value / 60)}s ${b.current_value % 60}d / ${Math.floor(b.total_value / 60)}s ${b.total_value % 60}d` : `${b.current_value}/${b.total_value} bet`;
        const modeTag = b.reading_mode === 'phone' ? ' 📱(PDF)' : '';
        return `${icon} <b>${b.title}</b>${modeTag}\n<code>${drawBar(b.current_value, b.total_value)}</code> (${unitLabel})`;
      });
      const tg = await sendTelegram(chatId!, `<b>📚 Hozirgi Aktiv Mutolaa:</b>\n\n${lines.join('\n\n')}`);
      return NextResponse.json({ ok: true, step: 'status_sent', count: activeBooks.length, tg });
    }

    // /savollar buyrug'i — Ustozdan so'raladigan barcha ochiq savollar
    if (msg.text?.startsWith('/savollar')) {
      const { data: qList } = await supabase
        .from('book_notes')
        .select('*, books(title)')
        .eq('note_type', 'ustozga_savol')
        .eq('is_resolved', false);

      if (!qList?.length) {
        const tg = await sendTelegram(chatId!, '✅ Hozircha ustozdan so‘raladigan ochiq savollar yo‘q.');
        return NextResponse.json({ ok: true, step: 'savollar_empty', tg });
      }
      const text = qList.map((q, i) => `${i + 1}. <b>${q.books?.title || 'Kitob'}</b> (${q.reference_point || '-'}):\n<i>"${q.content}"</i>`).join('\n\n');
      const tg = await sendTelegram(chatId!, `<b>❓ Ustozdan so‘raladigan masalalar:</b>\n\n${text}`);
      return NextResponse.json({ ok: true, step: 'savollar_sent', tg });
    }

    // 2. Matn yoki Ovozli xabarni Gemini orqali JSON ga aylantirish
    const contents: any[] = [];
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
    } else {
      return NextResponse.json({ ok: true, step: 'unsupported_msg' });
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

    let aiText = '';
    const candidateModels = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview'];
    let lastAiErr: any = null;
    for (const modelName of candidateModels) {
      try {
        const aiRes = await ai.models.generateContent({
          model: modelName,
          contents: [...contents, systemPrompt],
          config: { responseMimeType: 'application/json' },
        });
        aiText = aiRes.text || '{}';
        break;
      } catch (err) {
        lastAiErr = err;
      }
    }

    if (!aiText) {
      throw lastAiErr || new Error('AI javob qaytarmadi');
    }

    const parsed = JSON.parse(aiText);
    const targetBook = activeBooks?.find((b) => b.id === parsed.book_id);

    if (!targetBook) {
      const tg = await sendTelegram(chatId!, '⚠️ Qaysi kitob ekanligini aniqlay olmadim. Kitob nomini aniqroq ayting.');
      return NextResponse.json({ ok: true, step: 'book_not_found', parsed, tg });
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
      const tg = await sendTelegram(chatId!, `✅ <b>${targetBook.title}</b> bo‘yicha saqlandi (${badge}):\n\n📍 <b>Joyi:</b> ${parsed.reference_point || 'Ko‘rsatilmadi'}\n📝 <i>"${parsed.note_content}"</i>`);
      return NextResponse.json({ ok: true, step: 'note_saved', tg });
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

      const tg = await sendTelegram(chatId!, reply);
      return NextResponse.json({ ok: true, step: 'progress_updated', tg });
    }

    return NextResponse.json({ ok: true, step: 'done' });
  } catch (err: any) {
    console.error('Bot POST error:', err);
    let tg = null;
    if (chatId) {
      tg = await sendTelegram(chatId, `❌ Xatolik yuz berdi: <code>${(err?.message || 'Nomaʼlum xato').slice(0, 200)}</code>`);
    }
    return NextResponse.json({ ok: true, step: 'catch_error', error: err?.message, tg });
  }
}
