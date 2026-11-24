import { ArrowRight, Plus } from 'lucide-react';
import ModelNameModal from './ModelNameModal';
import ModelTypeModal from './ModelTypeModal';

const StartScreen = ({
  availableModels,
  onSelectModel,
  onAddModel,
  showNameModal,
  newModelNameInput,
  nameModalError,
  onNameChange,
  onNameCancel,
  onNameSubmit,
  showModelTypeModal,
  pendingModelName,
  onTypeSelect,
  onTypeCancel,
}) => (
  <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex items-center justify-center p-4">
    {showNameModal && (
      <ModelNameModal
        value={newModelNameInput}
        error={nameModalError}
        onChange={onNameChange}
        onCancel={onNameCancel}
        onSubmit={onNameSubmit}
      />
    )}

    {showModelTypeModal && (
      <ModelTypeModal
        pendingModelName={pendingModelName}
        onSelect={onTypeSelect}
        onCancel={onTypeCancel}
      />
    )}

    <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-2xl p-8 text-center">
      <div className="bg-blue-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
        <h1 className="text-3xl font-black text-blue-600 italic">iAuto</h1>
      </div>
      <h1 className="text-2xl font-bold mb-2 text-slate-900">iAuto Inspection</h1>
      <p className="text-slate-500 mb-8">Escolha o veículo para carregar as configurações de inspeção.</p>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {availableModels.map((model) => (
          <button
            key={model.id}
            onClick={() => onSelectModel(model.name)}
            className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-blue-500/50 p-4 rounded-xl flex items-center justify-between group transition-all"
          >
            <span className="font-bold text-lg group-hover:text-blue-600 transition-colors uppercase text-slate-800">{model.name}</span>
            <ArrowRight size={20} className="text-slate-400 group-hover:text-blue-600" />
          </button>
        ))}

        <button
          onClick={onAddModel}
          className="w-full bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/30 border-dashed p-4 rounded-xl flex items-center justify-center gap-2 group transition-all"
        >
          <Plus size={20} className="text-blue-500" />
          <span className="font-bold text-blue-500">CRIAR NOVO MODELO</span>
        </button>
      </div>
    </div>
  </div>
);

export default StartScreen;
