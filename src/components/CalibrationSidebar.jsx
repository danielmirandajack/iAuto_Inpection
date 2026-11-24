import { Check, Eraser, Ruler } from 'lucide-react';

const CalibrationSidebar = ({
  calibrationPoints,
  realDistanceInput,
  onRealDistanceChange,
  onComputeScale,
  scaleFactor,
  onReset,
  onBack,
}) => (
  <div className="flex flex-col h-full bg-white border-l border-slate-200 text-slate-600">
    <div className="p-4 border-b border-slate-200 bg-cyan-50">
      <h2 className="font-bold text-cyan-600 flex items-center gap-2 mb-2">
        <Ruler size={18} /> Metrologia
      </h2>
      <p className="text-[10px] text-cyan-700/70">
        Defina 2 pontos de referência.
      </p>
    </div>

    <div className="p-4 space-y-4">
      <div className="bg-slate-50 p-3 rounded border border-slate-200">
        <h3 className="text-xs font-bold text-slate-800 mb-2 uppercase">1. Referência</h3>
        <div className="flex gap-1 mb-2">
          {Array(2).fill(0).map((_, i) => (
            <div key={i} className={`h-2 flex-1 rounded-full ${i < calibrationPoints.length ? 'bg-cyan-500' : 'bg-slate-200'}`}></div>
          ))}
        </div>
        {calibrationPoints.length === 2 ? (
          <div className="text-xs text-green-600 font-bold flex items-center gap-1"><Check size={12} /> Pontos definidos</div>
        ) : (
          <div className="text-xs text-slate-400">Clique na imagem... ({calibrationPoints.length}/2)</div>
        )}
      </div>

      <div className="bg-slate-50 p-3 rounded border border-slate-200">
        <h3 className="text-xs font-bold text-slate-800 mb-2 uppercase">2. Distância Real</h3>
        <div className="flex items-center gap-2 mb-3">
          <input
            type="number"
            value={realDistanceInput}
            onChange={(e) => onRealDistanceChange(e.target.value)}
            placeholder="0"
            className="w-full bg-white border border-slate-300 rounded p-2 text-slate-900 font-mono text-center outline-none focus:border-cyan-500"
          />
          <span className="text-xs font-bold text-slate-400">mm</span>
        </div>
        <button
          onClick={onComputeScale}
          disabled={calibrationPoints.length !== 2 || !realDistanceInput}
          className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded text-xs transition-colors"
        >
          DEFINIR ESCALA
        </button>
      </div>

      {scaleFactor && (
        <div className="bg-green-50 border border-green-200 p-3 rounded text-center">
          <span className="text-[10px] text-green-600 font-bold block mb-1">CALIBRADO</span>
          <div className="text-xl font-mono text-slate-900 tracking-widest">
            {scaleFactor.toFixed(2)} <span className="text-xs text-green-600/70">px/mm</span>
          </div>
        </div>
      )}

      <button
        onClick={onReset}
        className="w-full py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold rounded text-xs flex items-center justify-center gap-2"
      >
        <Eraser size={14} /> LIMPAR TUDO
      </button>
    </div>

    <div className="mt-auto p-4 border-t border-slate-200">
      <button
        onClick={onBack}
        className="w-full py-3 bg-slate-50 text-slate-400 hover:text-slate-800 font-bold rounded text-xs transition-colors"
      >
        VOLTAR
      </button>
    </div>
  </div>
);

export default CalibrationSidebar;
