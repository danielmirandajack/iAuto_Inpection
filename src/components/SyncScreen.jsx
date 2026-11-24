const SyncScreen = ({ status }) => (
  <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center flex-col">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
    <h2 className="text-xl font-bold">{status}</h2>
  </div>
);

export default SyncScreen;
