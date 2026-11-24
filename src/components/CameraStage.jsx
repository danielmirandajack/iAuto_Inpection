import { ArrowRight, Check, ScanBarcode, X } from 'lucide-react';

const CameraStage = ({
  videoRef,
  canvasRef,
  viewMode,
  currentBarcode,
  barcodeInputRef,
  regions,
  onBarcodeSubmit,
  onMouseDown,
  onMouseMove,
  onMouseUp,
}) => (
  <div className="flex-1 relative bg-slate-200 flex items-center justify-center overflow-hidden p-4">
    <div className="relative w-full h-full max-w-5xl aspect-video rounded-lg overflow-hidden border border-slate-300 shadow-2xl">
      <video ref={videoRef} className="absolute w-full h-full object-contain opacity-70" muted playsInline />
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full z-20 object-contain ${viewMode === 'setup' ? 'cursor-move' : ''}`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      />

      {viewMode === 'operator' && !currentBarcode && (
        <div className="absolute inset-0 z-50 bg-white/90 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-slate-50 p-8 rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md text-center">
            <div className="bg-blue-50 p-4 rounded-full inline-block mb-4">
              <ScanBarcode size={48} className="text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Iniciar Inspeção</h2>
            <p className="text-slate-500 mb-6">Escaneie o código de barras ou digite o ID.</p>

            <form onSubmit={onBarcodeSubmit}>
              <input
                ref={barcodeInputRef}
                name="barcode"
                autoComplete="off"
                className="w-full bg-white border border-slate-300 rounded-lg px-4 py-3 text-xl text-center text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none mb-4 font-mono tracking-wider"
                placeholder="Aguardando..."
              />
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2">
                CONFIRMAR <ArrowRight size={18} />
              </button>
            </form>
          </div>
        </div>
      )}

      {viewMode === 'operator' && currentBarcode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30">
          {regions.every((r) => r.status === 'ok') ? (
            <div className="bg-green-600 text-white px-6 py-2 rounded-full font-bold shadow-lg flex items-center gap-2 animate-pulse">
              <Check size={20} /> APROVADO
            </div>
          ) : (
            <div className="bg-red-600 text-white px-6 py-2 rounded-full font-bold shadow-lg flex items-center gap-2 animate-bounce">
              <X size={20} /> FALHA DETECTADA
            </div>
          )}
        </div>
      )}
    </div>
  </div>
);

export default CameraStage;
