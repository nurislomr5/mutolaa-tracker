'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ReadingDashboard() {
  const [books, setBooks] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [tab, setTab] = useState<'active' | 'all' | 'notes'>('active');

  // PDF <-> Qog'oz Konvertor state
  const [pdfCurrent, setPdfCurrent] = useState('');
  const [pdfTotal, setPdfTotal] = useState('');
  const [paperTotal, setPaperTotal] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const { data: b } = await supabase.from('books').select('*').order('order_num');
    const { data: n } = await supabase.from('book_notes').select('*, books(title)').order('created_at', { ascending: false });
    if (b) setBooks(b);
    if (n) setNotes(n);
  }

  const activeBooks = books.filter((b) => b.status === 'active');
  const completedCount = books.filter((b) => b.status === 'completed').length;

  const trackLabels: Record<string, { title: string; badge: string }> = {
    audio: { title: '🎧 1-oqim: Yo‘l va Transport (Audio)', badge: 'bg-amber-500/20 text-amber-300' },
    cat_a: { title: '📗 2A-oqim: Adabiyot, Tarix va Tafakkur', badge: 'bg-emerald-500/20 text-emerald-300' },
    cat_b: { title: '🕌 2B-oqim: Islomiy Ilm (Asosiy navbat)', badge: 'bg-sky-500/20 text-sky-300' },
    daily_vird: { title: '🔄 3-oqim: Doimiy Ilmiy Mutolaa (Vird)', badge: 'bg-purple-500/20 text-purple-300' },
  };

  const convertedPaperPage =
    pdfCurrent && pdfTotal && paperTotal
      ? Math.round((Number(pdfCurrent) / Number(pdfTotal)) * Number(paperTotal))
      : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 max-w-5xl mx-auto">
      {/* HEADER VA UMUMIY STATISTIKA */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mutolaa OS — 50 Kitob Tizimi</h1>
          <p className="text-sm text-slate-400">8 Audio • 23 Adabiyot & Tafakkur • 19 Islomiy ilm (61 jild)</p>
        </div>
        <div className="flex gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-center">
            <div className="text-xs text-slate-400">Yakunlandi</div>
            <div className="text-lg font-bold text-emerald-400">{completedCount} / {books.length}</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-center">
            <div className="text-xs text-slate-400">Ustozga savollar</div>
            <div className="text-lg font-bold text-amber-400">
              {notes.filter((n) => n.note_type === 'ustozga_savol' && !n.is_resolved).length} ta
            </div>
          </div>
        </div>
      </div>

      {/* NAVIGATSIYA TABLARI */}
      <div className="flex gap-2 mb-6">
        {[
          { id: 'active', label: '🔥 Hozirgi Fokus (4 Oqim)' },
          { id: 'notes', label: '❓ Savollar, Lug‘at & Xulosalar' },
          { id: 'all', label: '📚 To‘liq Ro‘yxat (61 jild)' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === t.id ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 1-TAB: AKTIV FOKUS DOSKASI + FORMAT KONVERTORI */}
      {tab === 'active' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeBooks.map((book) => {
              const pct = Math.min(100, Math.round((book.current_value / book.total_value) * 100));
              const meta = trackLabels[book.track];
              return (
                <div key={book.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${meta.badge}`}>
                        {meta.title}
                      </span>
                      <span className="text-xs text-slate-400 uppercase">{book.reading_mode}</span>
                    </div>
                    <h3 className="text-lg font-semibold text-white">{book.order_num}. {book.title}</h3>
                    <p className="text-xs text-slate-400 mb-4">{book.author}</p>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-slate-300 font-medium">
                        {book.unit === 'minutes'
                          ? `${Math.floor(book.current_value / 60)}s ${book.current_value % 60}d / ${Math.floor(book.total_value / 60)}s ${book.total_value % 60}d`
                          : `${book.current_value} / ${book.total_value} bet`}
                      </span>
                      <span className="text-indigo-400 font-bold">{pct}%</span>
                    </div>
                    <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                      <div className="bg-indigo-500 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* QOG'OZ <-> TELEFON (PDF) KONVERTORI */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
            <h4 className="text-sm font-semibold text-slate-200 mb-1">📱 ↔ 📖 Vaqtinchalik Telefon (PDF) / Qog‘oz Bet Konvertori</h4>
            <p className="text-xs text-slate-400 mb-4">
              Qog‘oz kitob topilmay vaqtincha telefonda o‘qiganingizda, PDF betini qog‘oz nashr betiga (yoki aksincha) proporsional o‘girish:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
              <input
                type="number"
                placeholder="PDFdagi joriy bet (masalan: 140)"
                value={pdfCurrent}
                onChange={(e) => setPdfCurrent(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="PDF jami beti (masalan: 480)"
                value={pdfTotal}
                onChange={(e) => setPdfTotal(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="number"
                placeholder="Qog‘oz kitob jami beti (320)"
                value={paperTotal}
                onChange={(e) => setPaperTotal(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
              />
              <div className="bg-indigo-950/60 border border-indigo-700/50 rounded-lg px-3 py-2 text-sm text-center font-semibold text-indigo-300">
                {convertedPaperPage !== null ? `Qog‘ozda: ${convertedPaperPage}-bet` : 'Natija shu yerda chiqadi'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2-TAB: SAVOLLAR, LUG'AT VA XULOSALAR */}
      {tab === 'notes' && (
        <div className="space-y-3">
          {notes.map((n) => (
            <div key={n.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex justify-between items-start gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-indigo-300">
                    #{n.note_type}
                  </span>
                  <span className="text-sm font-medium text-white">{n.books?.title}</span>
                  {n.reference_point && <span className="text-xs text-slate-400">({n.reference_point})</span>}
                </div>
                <p className="text-sm text-slate-300">{n.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 3-TAB: TO'LIQ RO'YXAT */}
      {tab === 'all' && (
        <div className="space-y-2">
          {books.map((b) => {
            const pct = Math.min(100, Math.round((b.current_value / b.total_value) * 100));
            return (
              <div key={b.id} className="bg-slate-900 border border-slate-800/80 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500 mr-2">[{b.track.toUpperCase()}]</span>
                  <span className="text-sm font-medium text-slate-200">{b.order_num}. {b.title}</span>
                  <span className="text-xs text-slate-500 ml-2">— {b.author}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">{pct}%</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    b.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300' :
                    b.status === 'active' ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-800 text-slate-500'
                  }`}>
                    {b.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}