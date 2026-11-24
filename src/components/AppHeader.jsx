import { ArrowLeft, Layout, Lock, Unlock } from 'lucide-react';

const AppHeader = ({ viewMode, onToggleView }) => (
  <header className="h-14 border-b border-slate-200 flex items-center justify-between px-4 bg-white z-50">
    <div className="flex items-center gap-4">
      <button
        onClick={() => window.history.back()}
        className="p-2 hover:bg-slate-100 rounded-full text-slate-500 hover:text-slate-900 transition-colors"
        title="Voltar para a página anterior"
      >
        <ArrowLeft size={20} />
      </button>
      <div className="flex items-center gap-2">
        <Layout className="text-blue-600" />
        <h1 className="font-bold tracking-tight text-slate-900">iAuto <span className="text-blue-600 font-black italic">Inspection</span> <span className="text-slate-400 font-normal text-xs ml-2">v2.7 Stable</span></h1>
      </div>
    </div>

    <div className="hidden md:block text-[10px] text-slate-400 font-medium">
      Todos os direitos reservados o iAutomotivo - Por Daniel Miranda
    </div>

    <div className="flex gap-2">
      <button
        onClick={onToggleView}
        className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-2 transition-colors
          ${viewMode === 'setup' ? 'bg-yellow-50 text-yellow-600 border border-yellow-200' : 'bg-blue-50 text-blue-600 border border-blue-200'}
        `}
      >
        {viewMode === 'setup' ? <Unlock size={14} /> : <Lock size={14} />}
        {viewMode === 'setup' ? 'PRODUÇÃO' : 'OPERADOR'}
      </button>
    </div>
  </header>
);

export default AppHeader;
