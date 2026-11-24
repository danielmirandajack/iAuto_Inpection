import { AlertTriangle } from 'lucide-react';

const ErrorScreen = ({ message, onRetry }) => (
  <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
    <div className="bg-white p-8 rounded-2xl border border-red-200 max-w-md text-center shadow-xl">
      <AlertTriangle size={48} className="text-red-500 mx-auto mb-4" />
      <h2 className="text-xl font-bold text-slate-900 mb-2">Erro de Inicialização</h2>
      <p className="text-slate-500 mb-6">{message}</p>
      <button onClick={onRetry} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-bold">
        Tentar Novamente
      </button>
    </div>
  </div>
);

export default ErrorScreen;
