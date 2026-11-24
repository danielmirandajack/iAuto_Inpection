import React, { useEffect, useRef, useState } from 'react';
import InspectionHistory from './InspectionHistory';
import { useCalibration } from './useCalibration';
import { useAiEngine } from './hooks/useAiEngine';
import { useWebcam } from './hooks/useWebcam';
import { useInspectionCanvas } from './hooks/useInspectionCanvas';
import { useInspectionModels } from './hooks/useInspectionModels';
import { useTraining } from './hooks/useTraining';
import { useInspectionHistory } from './hooks/useInspectionHistory';
import { useRegionInteraction } from './hooks/useRegionInteraction';
import { useSyncedRef } from './hooks/useSyncedRef';
import StartScreen from './components/StartScreen';
import SyncScreen from './components/SyncScreen';
import ErrorScreen from './components/ErrorScreen';
import AppHeader from './components/AppHeader';
import AppFooter from './components/AppFooter';
import CameraStage from './components/CameraStage';
import SetupSidebar from './components/SetupSidebar';
import OperatorSidebar from './components/OperatorSidebar';
import CalibrationSidebar from './components/CalibrationSidebar';
import ModelNameModal from './components/ModelNameModal';
import ModelTypeModal from './components/ModelTypeModal';

const App = () => {
  const {
    calibrationPoints,
    addCalibrationPoint,
    realDistanceInput,
    setRealDistanceInput,
    scaleFactor,
    computeScaleFactor,
    resetCalibration,
  } = useCalibration();

  const [viewMode, setViewMode] = useState('setup');
  const [isPredicting, setIsPredicting] = useState(false);
  const [currentBarcode, setCurrentBarcode] = useState('');
  const [currentProjectType, setCurrentProjectType] = useState('detection');
  const [threshold, setThreshold] = useState(0.85);

  const barcodeInputRef = useRef(null);
  const streamReadyRef = useRef(() => {});

  const ai = useAiEngine();
  const webcam = useWebcam({ streamReadyRef });
  const models = useInspectionModels({
    classifier: ai.classifier,
    setCurrentProjectType,
    setViewMode,
    setIsPredicting,
    setCurrentBarcode,
  });

  const viewModeRef = useSyncedRef(viewMode);
  const activeRegionIdRef = useSyncedRef(models.activeRegionId);
  const currentBarcodeRef = useSyncedRef(currentBarcode);
  const calibrationPointsRef = useSyncedRef(calibrationPoints);
  const currentProjectTypeRef = useSyncedRef(currentProjectType);
  const scaleFactorRef = useSyncedRef(scaleFactor);

  const canvas = useInspectionCanvas({
    videoRef: webcam.videoRef,
    viewModeRef,
    activeRegionIdRef,
    currentBarcodeRef,
    calibrationPointsRef,
    currentProjectTypeRef,
    scaleFactorRef,
    regionsRef: models.regionsRef,
  });

  streamReadyRef.current = canvas.startLoop;

  const training = useTraining({
    videoRef: webcam.videoRef,
    isCameraReady: webcam.isCameraReady,
    classifier: ai.classifier,
    mobilenetModel: ai.mobilenetModel,
    selectedModel: models.selectedModel,
    regions: models.regions,
    setRegions: models.setRegions,
    activeRegionId: models.activeRegionId,
    setActiveRegionId: models.setActiveRegionId,
    backgroundSamples: models.backgroundSamples,
    setBackgroundSamples: models.setBackgroundSamples,
    modelsData: models.modelsData,
    saveModelConfig: models.saveModelConfig,
    isPredicting,
    currentBarcode,
    threshold,
    setActionMessage: models.setActionMessage,
    setActionMessageType: models.setActionMessageType,
  });

  const historyApi = useInspectionHistory({
    videoRef: webcam.videoRef,
    canvasRef: canvas.canvasRef,
  });

  const interaction = useRegionInteraction({
    videoRef: webcam.videoRef,
    canvasRef: canvas.canvasRef,
    viewMode,
    regions: models.regions,
    setRegions: models.setRegions,
    activeRegionId: models.activeRegionId,
    setActiveRegionId: models.setActiveRegionId,
    selectedModel: models.selectedModel,
    modelsData: models.modelsData,
    saveModelConfig: models.saveModelConfig,
    regionsRef: models.regionsRef,
    addCalibrationPoint,
  });

  useEffect(() => {
    if (!ai.isReady) return;
    webcam.startWebcam();
    webcam.getDevices();
  }, [ai.isReady]);

  useEffect(() => {
    if (models.selectedModel) {
      webcam.startWebcam(webcam.selectedDeviceId || null);
    }
  }, [models.selectedModel]);

  useEffect(() => {
    if (viewMode === 'operator' && !currentBarcode && barcodeInputRef.current) {
      setTimeout(() => barcodeInputRef.current?.focus(), 100);
    }
  }, [viewMode, currentBarcode]);

  useEffect(() => () => {
    if (training.predictRef.current) clearTimeout(training.predictRef.current);
  }, []);

  const loadingError = webcam.loadingError || ai.error;

  const handleBarcodeSubmit = (e) => {
    e.preventDefault();
    const code = new FormData(e.target).get('barcode');
    if (code) setCurrentBarcode(code);
  };

  const handleToggleView = () => {
    const newMode = viewMode === 'setup' ? 'operator' : 'setup';
    setViewMode(newMode);
    setIsPredicting(newMode === 'operator');
    setCurrentBarcode('');
  };

  const activeRegion = models.regions.find((r) => r.id === models.activeRegionId);
  const isUnbalanced = activeRegion
    && (activeRegion.samples > models.backgroundSamples * 2 || models.backgroundSamples > activeRegion.samples * 2)
    && models.backgroundSamples > 0;

  if (!models.selectedModel) {
    if (models.isSyncing) return <SyncScreen status={models.syncStatus} />;

    return (
      <StartScreen
        availableModels={models.availableModels}
        onSelectModel={models.handleStartScreenModelSelect}
        onAddModel={models.handleAddModel}
        showNameModal={models.showNameModal}
        newModelNameInput={models.newModelNameInput}
        nameModalError={models.nameModalError}
        onNameChange={(value) => { models.setNewModelNameInput(value); models.setNameModalError(''); }}
        onNameCancel={() => models.setShowNameModal(false)}
        onNameSubmit={models.submitNewModelName}
        showModelTypeModal={models.showModelTypeModal}
        pendingModelName={models.pendingModelName}
        onTypeSelect={models.confirmModelCreation}
        onTypeCancel={() => models.setShowModelTypeModal(false)}
      />
    );
  }

  if (loadingError) {
    return <ErrorScreen message={loadingError} onRetry={webcam.handleRetryCamera} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col h-screen overflow-hidden">
      {models.showNameModal && (
        <ModelNameModal
          value={models.newModelNameInput}
          error={models.nameModalError}
          onChange={(value) => { models.setNewModelNameInput(value); models.setNameModalError(''); }}
          onCancel={() => models.setShowNameModal(false)}
          onSubmit={models.submitNewModelName}
        />
      )}

      {models.showModelTypeModal && (
        <ModelTypeModal
          pendingModelName={models.pendingModelName}
          onSelect={models.confirmModelCreation}
          onCancel={() => models.setShowModelTypeModal(false)}
        />
      )}

      {models.showRenameModal && (
        <ModelNameModal
          title="Renomear Modelo"
          value={models.renameModelInput}
          error={models.renameModalError}
          placeholder="Novo nome"
          confirmLabel="Salvar"
          onChange={(value) => { models.setRenameModelInput(value); models.setRenameModalError(''); }}
          onCancel={() => models.setShowRenameModal(false)}
          onSubmit={models.submitRenameModel}
        />
      )}

      <AppHeader viewMode={viewMode} onToggleView={handleToggleView} />

      <div className="flex flex-1 overflow-hidden">
        <CameraStage
          videoRef={webcam.videoRef}
          canvasRef={canvas.canvasRef}
          viewMode={viewMode}
          currentBarcode={currentBarcode}
          barcodeInputRef={barcodeInputRef}
          regions={models.regions}
          onBarcodeSubmit={handleBarcodeSubmit}
          onMouseDown={interaction.handleMouseDown}
          onMouseMove={interaction.handleMouseMove}
          onMouseUp={interaction.handleMouseUp}
        />

        <div className="w-80 bg-white border-l border-slate-200 flex flex-col z-40">
          {viewMode === 'setup' && (
            <SetupSidebar
              videoDevices={webcam.videoDevices}
              selectedDeviceId={webcam.selectedDeviceId}
              onCameraChange={webcam.handleCameraChange}
              selectedModel={models.selectedModel}
              availableModels={models.availableModels}
              onEditModel={models.handleEditModel}
              onDeleteModel={models.handleDeleteModel}
              onAddModel={models.handleAddModel}
              onModelSelect={models.handleModelSelect}
              regions={models.regions}
              activeRegionId={models.activeRegionId}
              onSelectRegion={models.setActiveRegionId}
              onRenameRegion={models.renameRegion}
              onClearRegionSamples={models.handleClearRegionSamples}
              onDeleteRegion={models.handleDeleteRegion}
              onAddRegion={models.addRegion}
              onCaptureApproved={(id) => { models.setActiveRegionId(id); training.addObjectExample(null, id); }}
              backgroundSamples={models.backgroundSamples}
              onCaptureBackground={training.addBackgroundExample}
              isUnbalanced={isUnbalanced}
              threshold={threshold}
              onThresholdChange={setThreshold}
              onShowHistory={() => historyApi.setShowHistory(true)}
              currentProjectType={currentProjectType}
              onOpenCalibration={() => setViewMode('calibration')}
              onDeleteAllPhotos={training.handleDeleteAllPhotos}
            />
          )}

          {viewMode === 'calibration' && (
            <CalibrationSidebar
              calibrationPoints={calibrationPoints}
              realDistanceInput={realDistanceInput}
              onRealDistanceChange={setRealDistanceInput}
              onComputeScale={computeScaleFactor}
              scaleFactor={scaleFactor}
              onReset={resetCalibration}
              onBack={() => setViewMode('setup')}
            />
          )}

          {viewMode === 'operator' && (
            <OperatorSidebar
              videoDevices={webcam.videoDevices}
              selectedDeviceId={webcam.selectedDeviceId}
              onCameraChange={webcam.handleCameraChange}
              currentBarcode={currentBarcode}
              regions={models.regions}
              threshold={threshold}
              onSave={() => historyApi.saveToHistory({
                currentBarcode,
                selectedModel: models.selectedModel,
                regions: models.regions,
                setCurrentBarcode,
              })}
              history={historyApi.history}
            />
          )}
        </div>
      </div>

      <AppFooter />

      {historyApi.showHistory && (
        <InspectionHistory
          onClose={() => historyApi.setShowHistory(false)}
          onClear={() => historyApi.setHistory([])}
        />
      )}
    </div>
  );
};

export default App;
