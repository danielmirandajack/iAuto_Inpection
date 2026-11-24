import { Camera, Database, Eye, Save } from 'lucide-react';

const OperatorSidebar = ({
  videoDevices,
  selectedDeviceId,
  onCameraChange,
  currentBarcode,
  regions,
  threshold,
  onSave,
  history,
}) => (
  <div className="flex flex-col h-full bg-white text-slate-600">
    <div className="p-4 bg-slate-50 border-b border-slate-200">
      <h2 className="font-bold text-slate-900 mb-1 flex items-center gap-2"><Eye size={16} /> Inspeção Ativa</h2>

      <div className="mt-4 mb-4">
        <label className="text-xs text-slate-400 block mb-1 flex items-center gap-1">
          <Camera size={12} /> Câmera
        </label>
        <select
          className="w-full bg-white text-slate-900 text-xs rounded p-2 border border-slate-200 outline-none focus:border-blue-500"
          value={selectedDeviceId}
          onChange={onCameraChange}
        >
          {videoDevices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Câmera ${device.deviceId.slice(0, 5)}...`}
            </option>
          ))}
          {videoDevices.length === 0 && <option>Nenhuma câmera detectada</option>}
        </select>
      </div>

      {currentBarcode ? (
        <div className="mt-2 bg-white p-2 rounded border border-slate-200 flex justify-between items-center">
          <span className="text-xs text-slate-400">Peça:</span>
          <span className="font-mono text-sm font-bold text-blue-600">{currentBarcode}</span>
        </div>
      ) : (
        <p className="text-xs text-slate-400">Aguardando leitura...</p>
      )}
    </div>

    <div className="flex-1 overflow-y-auto p-4 opacity-90 bg-slate-50/50">
      {currentBarcode && (
        <>
          <h3 className="text-xs font-bold text-slate-400 uppercase mb-3 tracking-wider">Tempo Real</h3>
          <div className="space-y-3">
            {regions.map((r) => (
              <div key={r.id} className="bg-white p-3 rounded border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700">{r.name}</span>
                  {r.status === 'ok' ? (
                    <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-200">OK</span>
                  ) : (
                    <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">FALHA</span>
                  )}
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden relative">
                  <div
                    className={`h-full transition-all duration-300 ${r.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`}
                    style={{ width: `${((r.confidence || 0) * 100).toFixed(0)}%` }}
                  ></div>
                  <div className="absolute top-0 bottom-0 w-0.5 bg-blue-500 opacity-50" style={{ left: `${threshold * 100}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>

    <div className="p-4 border-t border-slate-200 bg-white space-y-3">
      <button
        onClick={onSave}
        disabled={!currentBarcode}
        className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-lg font-bold shadow-lg flex justify-center items-center gap-2 active:scale-95 transition-transform"
      >
        <Save size={20} /> SALVAR & PRÓXIMO
      </button>

      <div className="pt-2 border-t border-slate-100">
        <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1">
          <Database size={10} /> Histórico da Sessão
        </h4>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {history.slice(0, 5).map((h) => (
            <div key={h.id} className="text-xs flex items-center justify-between text-slate-500 bg-slate-50 p-1.5 rounded group hover:bg-slate-100 transition-colors">
              <div className="flex items-center gap-2">
                {h.image && <img src={h.image} alt="snap" className="w-6 h-6 rounded object-cover border border-slate-200" />}
                <div className="flex flex-col">
                  <span className="font-mono text-slate-600 font-bold">{h.code}</span>
                  <span className="text-[10px] opacity-70">{h.timestamp}</span>
                </div>
              </div>
              <span className={h.status === 'APROVADO' ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>{h.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

export default OperatorSidebar;
