import { AlertTriangle, Camera, Car, Database, Eraser, Eye, Pencil, Plus, Ruler, Trash2 } from 'lucide-react';

const SetupSidebar = ({
  videoDevices,
  selectedDeviceId,
  onCameraChange,
  selectedModel,
  availableModels,
  onEditModel,
  onDeleteModel,
  onAddModel,
  onModelSelect,
  regions,
  activeRegionId,
  onSelectRegion,
  onRenameRegion,
  onClearRegionSamples,
  onDeleteRegion,
  onAddRegion,
  onCaptureApproved,
  backgroundSamples,
  onCaptureBackground,
  isUnbalanced,
  threshold,
  onThresholdChange,
  onShowHistory,
  currentProjectType,
  onOpenCalibration,
  onDeleteAllPhotos,
}) => {
  const allObj = regions.every((r) => r.samples >= 5);
  const bgDone = backgroundSamples >= 5;
  const allReady = allObj && bgDone;
  const partial = regions.every((r) => r.samples >= 3) && backgroundSamples >= 3;

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-slate-200 space-y-2">
        <div>
          <label className="text-[11px] text-slate-600 font-bold flex items-center gap-1 mb-1"><Camera size={10} /> Câmera</label>
          <select className="w-full bg-white text-slate-900 text-xs rounded p-1.5 border border-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20" value={selectedDeviceId} onChange={onCameraChange}>
            {videoDevices.map((d) => (<option key={d.deviceId} value={d.deviceId}>{d.label || `Câmera ${d.deviceId.slice(0, 5)}...`}</option>))}
            {videoDevices.length === 0 && <option>Nenhuma câmera detectada</option>}
          </select>
        </div>
        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-[11px] text-slate-600 font-bold flex items-center gap-1"><Car size={10} /> Modelo de Inspeção</label>
            <div className="flex gap-2">
              <button onClick={onEditModel} title="Renomear" className="text-slate-500 hover:text-blue-700"><Pencil size={11} /></button>
              <button onClick={onDeleteModel} title="Excluir" className="text-slate-500 hover:text-red-700"><Trash2 size={11} /></button>
              <button onClick={onAddModel} className="text-[11px] text-blue-700 hover:text-blue-600 font-black flex items-center gap-0.5 tracking-tight"><Plus size={10} /> NOVO</button>
            </div>
          </div>
          <select className="w-full bg-white text-slate-900 text-xs rounded p-1.5 border border-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20" value={selectedModel || ''} onChange={(e) => onModelSelect(e.target.value)}>
            {availableModels.map((m) => (<option key={m.id} value={m.name}>{m.name}</option>))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50/30">
        <div className="px-4 pt-4 pb-1">
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-1">Guia de Treinamento</p>
        </div>

        <div className="px-4 pt-3">
          <div className="flex items-start gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-blue-700 text-white text-xs font-black flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">1</div>
            <div>
              <p className="text-sm font-black text-slate-900 leading-tight">Defina os pontos de inspeção</p>
              <p className="text-[11px] text-slate-600 mt-0.5 font-medium">Posicione os quadrados sobre cada peça na câmera e dê um nome</p>
            </div>
          </div>
          <div className="space-y-1.5 pl-8">
            {regions.map((r) => (
              <div key={r.id} onClick={() => onSelectRegion(r.id)}
                className={`p-2 rounded border text-xs cursor-pointer relative group transition-all shadow-sm ${r.id === activeRegionId ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400' : 'bg-white border-slate-300 hover:border-slate-400'}`}>
                <div className="flex justify-between items-center">
                  <input className="bg-transparent font-bold text-slate-900 outline-none w-28 text-xs" value={r.name}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onRenameRegion(r.id, e.target.value)} />
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); onClearRegionSamples(r.id, r.name); }} className="text-slate-500 hover:text-orange-600" title="Limpar fotos"><Eraser size={11} /></button>
                    <button onClick={(e) => { e.stopPropagation(); onDeleteRegion(r.id); }} className="text-slate-500 hover:text-red-700" title="Excluir"><Trash2 size={11} /></button>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={onAddRegion} className="w-full py-2 border border-dashed border-slate-400 hover:border-blue-500 text-slate-600 hover:text-blue-700 text-xs font-bold rounded flex items-center justify-center gap-1 transition-all bg-white shadow-sm">
              <Plus size={12} /> Adicionar Objeto
            </button>
          </div>
        </div>

        <div className="px-7 py-1"><div className="w-px h-4 bg-slate-200 ml-2.5"></div></div>

        <div className="px-4">
          <div className="flex items-start gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-green-700 text-white text-xs font-black flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">2</div>
            <div>
              <p className="text-sm font-black text-slate-900 leading-tight">Mostre peças <span className="text-green-700 font-black">APROVADAS</span></p>
              <p className="text-[11px] text-slate-600 mt-0.5 font-medium">Posicione peças boas na câmera e grave pelo menos 5 fotos de cada</p>
            </div>
          </div>
          <div className="space-y-2 pl-8">
            {regions.map((r) => {
              const pct = Math.min(100, (r.samples / 5) * 100);
              const done = r.samples >= 5;
              return (
                <div key={r.id} className="bg-white border border-slate-300 rounded p-2.5 shadow-sm">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs font-bold text-slate-800 truncate max-w-[110px]">{r.name}</span>
                    <span className={`text-[10px] font-black ${done ? 'text-green-700' : 'text-slate-500'}`}>{r.samples}/5{done ? ' ✓' : ''}</span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 rounded-full mb-2 border border-slate-300">
                    <div className={`h-full rounded-full transition-all duration-300 ${done ? 'bg-green-600' : 'bg-green-500/40'}`} style={{ width: `${pct}%` }}></div>
                  </div>
                  <button onClick={() => onCaptureApproved(r.id)}
                    className="w-full py-2 rounded text-xs font-black flex items-center justify-center gap-1.5 transition-all active:scale-95 bg-green-50 hover:bg-green-100 text-green-800 border border-green-300 hover:border-green-500 shadow-sm">
                    <Eye size={12} /> Gravar Peça Aprovada
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-7 py-1"><div className="w-px h-4 bg-slate-200 ml-2.5"></div></div>

        <div className="px-4">
          <div className="flex items-start gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-orange-600 text-white text-xs font-black flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">3</div>
            <div>
              <p className="text-sm font-black text-slate-900 leading-tight">Mostre o <span className="text-orange-700 font-black">FUNDO / Reprovadas</span></p>
              <p className="text-[11px] text-slate-600 mt-0.5 font-medium">Campo vazio ou peças com defeito — grave pelo menos 5 fotos</p>
            </div>
          </div>
          <div className="pl-8">
            <div className="bg-white border border-slate-300 rounded p-2.5 shadow-sm">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs font-bold text-slate-800">Fundo / Reprovado</span>
                <span className={`text-[10px] font-black ${backgroundSamples >= 5 ? 'text-orange-700' : 'text-slate-500'}`}>{backgroundSamples}/5{backgroundSamples >= 5 ? ' ✓' : ''}</span>
              </div>
              <div className="w-full h-2 bg-slate-200 rounded-full mb-2 border border-slate-300">
                <div className="h-full rounded-full bg-orange-600 transition-all duration-300" style={{ width: `${Math.min(100, (backgroundSamples / 5) * 100)}%` }}></div>
              </div>
              <button onClick={onCaptureBackground}
                className="w-full py-2 rounded text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 transition-all bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-300 hover:border-orange-500 shadow-sm">
                <Eraser size={12} /> Gravar Fundo / Reprovado
              </button>
            </div>
          </div>
        </div>

        {allReady ? (
          <div className="mx-4 mt-3 p-2.5 rounded-lg border bg-green-100 border-green-500 text-green-800 text-xs font-black flex items-center gap-2 shadow-sm"><div className="w-2.5 h-2.5 rounded-full bg-green-600 animate-pulse flex-shrink-0"></div>✅ Pronto para produção!</div>
        ) : partial ? (
          <div className="mx-4 mt-3 p-2.5 rounded-lg border bg-yellow-100 border-yellow-500 text-yellow-800 text-xs font-black flex items-center gap-2 shadow-sm"><div className="w-2.5 h-2.5 rounded-full bg-yellow-600 flex-shrink-0"></div>⚠️ Treinamento mínimo</div>
        ) : (
          <div className="mx-4 mt-3 p-2.5 rounded-lg border bg-slate-100 border-slate-400 text-slate-700 text-xs font-black flex items-center gap-2 shadow-sm"><div className="w-2.5 h-2.5 rounded-full bg-slate-500 flex-shrink-0"></div>🔴 Complete o treinamento</div>
        )}

        {isUnbalanced && (
          <div className="mx-4 mt-2 text-xs text-yellow-600 bg-yellow-50 p-2 rounded flex items-start gap-2 border border-yellow-100">
            <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
            <p>Equilibre as fotos de peças aprovadas e fundo.</p>
          </div>
        )}
        <div className="h-3"></div>
      </div>

      <div className="border-t border-slate-300 p-4 space-y-3 bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div>
          <div className="flex justify-between text-[11px] mb-1.5">
            <span className="text-slate-700 font-bold tracking-tight">Sensibilidade de detecção</span>
            <span className="text-blue-700 font-black">{(threshold * 100).toFixed(0)}%</span>
          </div>
          <input type="range" min="0.5" max="0.99" step="0.01" value={threshold} onChange={(e) => onThresholdChange(parseFloat(e.target.value))} className="w-full accent-blue-700 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer border border-slate-300" />
        </div>
        <div className="flex gap-2">
          <button onClick={onShowHistory} className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 hover:text-black text-[11px] font-black rounded border border-slate-400 flex items-center justify-center gap-1 shadow-sm transition-all">
            <Database size={11} /> Histórico
          </button>
          {currentProjectType === 'metrology' && (
            <button onClick={onOpenCalibration} className="flex-1 py-2 bg-cyan-100 hover:bg-cyan-200 text-cyan-800 text-[11px] font-black rounded border border-cyan-400 flex items-center justify-center gap-1 shadow-sm transition-all">
              <Ruler size={11} /> Calibração
            </button>
          )}
        </div>
        <button onClick={onDeleteAllPhotos} className="w-full py-1 text-slate-400 hover:text-red-600 text-[10px] flex items-center justify-center gap-1 transition-colors rounded hover:bg-red-50">
          <Trash2 size={10} /> Excluir todas as fotos
        </button>
      </div>
    </div>
  );
};

export default SetupSidebar;
