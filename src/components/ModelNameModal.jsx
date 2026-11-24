const ModelNameModal = ({
  title = 'Nome do novo modelo',
  value,
  error,
  placeholder = 'Ex: Polo',
  confirmLabel = 'Continuar',
  onChange,
  onCancel,
  onSubmit,
}) => (
  <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 w-full max-w-md animate-in zoom-in-95 duration-200">
      <h2 className="text-xl font-bold mb-4">{title}</h2>
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-4 py-3 text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none mb-2"
        placeholder={placeholder}
      />
      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onCancel} className="text-slate-500 hover:text-slate-900 font-bold px-4 py-2">
          Cancelar
        </button>
        <button onClick={onSubmit} className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2 rounded-lg">
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
);

export default ModelNameModal;
