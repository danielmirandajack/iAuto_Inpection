import { BoxSelect, Ruler } from 'lucide-react';

const ModelTypeModal = ({ pendingModelName, onSelect, onCancel }) => (
  <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 w-full max-w-md animate-in zoom-in-95 duration-200">
      <h2 className="text-xl font-bold mb-2">Selecione o Modo</h2>
      <p className="text-slate-500 text-sm mb-6">
        Defina como o projeto <span className="font-bold text-slate-900">"{pendingModelName}"</span> irá funcionar.
      </p>

      <div className="space-y-3">
        <button
          onClick={() => onSelect('detection')}
          className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-blue-500 p-4 rounded-xl text-left transition-all group"
        >
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <BoxSelect size={20} />
            </div>
            <span className="font-bold text-lg text-slate-900">Detecção</span>
          </div>
          <p className="text-slate-500 text-sm pl-11">
            Selecione objetos na imagem para detecção.
          </p>
        </button>

        <button
          onClick={() => onSelect('metrology')}
          className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-green-500 p-4 rounded-xl text-left transition-all group"
        >
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-green-50 text-green-600 rounded-lg group-hover:bg-green-500 group-hover:text-white transition-colors">
              <Ruler size={20} />
            </div>
            <span className="font-bold text-lg text-slate-900">Medição</span>
          </div>
          <p className="text-slate-500 text-sm pl-11">
            Utilize para realizar medições de peças.
          </p>
        </button>
      </div>

      <div className="mt-6 flex justify-end">
        <button onClick={onCancel} className="text-slate-500 hover:text-slate-900 font-bold px-4 py-2">
          Cancelar
        </button>
      </div>
    </div>
  </div>
);

export default ModelTypeModal;
