{!replying ? (
  <div>
    <div className="flex flex-wrap gap-2">
      {isHumanMail(selected) && (
        <button
          type="button"
          onClick={() => setReplying(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white"
        >
          <Reply className="h-4 w-4" />
          Balas
        </button>
      )}

      {selected.documentId && (
        <button
          type="button"
          onClick={() => openDocument(selected)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
        >
          <ExternalLink className="h-4 w-4" />
          {userSession?.role === 'admin' ||
          userSession?.badges?.some(
            (b) => String(b).toUpperCase() === 'VERIFIKATOR'
          )
            ? 'Buka & Riviu SPO'
            : 'Buka & Perbaiki SPO'}
        </button>
      )}
    </div>

    <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
      Pesan tetap tersimpan di tab Semua setelah dibaca. Buka SPO untuk
      menggunakan tindakan edit atau verifikasi yang tersedia sesuai
      wewenang Anda.
    </p>
  </div>
) : (
  <section className="border-t border-slate-200 pt-5">
    <h4 className="text-sm font-bold text-slate-900">
      Balas kepada {senderName}
    </h4>

    <textarea
      value={replyBody}
      onChange={(e) => setReplyBody(e.target.value)}
      maxLength={2000}
      rows={5}
      autoFocus
      className="mt-3 w-full resize-y rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-emerald-600"
      placeholder="Tulis balasan..."
    />

    <div className="mt-3 flex flex-wrap gap-2">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          type="button"
          onClick={() => insertSuggestion(suggestion)}
          className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:border-emerald-300 hover:bg-emerald-50"
        >
          {suggestion}
        </button>
      ))}
    </div>

    <div className="mt-5 flex justify-end gap-2">
      <button
        type="button"
        onClick={() => {
          setReplying(false);
          setReplyBody('');
        }}
        className="rounded-lg px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
      >
        Batal
      </button>

      <button
        type="button"
        disabled={!replyBody.trim() || sending}
        onClick={sendReply}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
      >
        <Send className="h-4 w-4" />
        {sending ? 'Mengirim...' : 'Kirim'}
      </button>
    </div>
  </section>
)}
