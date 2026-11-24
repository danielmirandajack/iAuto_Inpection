import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { deserializeDataset } from '../utils/datasetTensors';
import { deleteImagesByModel, deleteImagesByLabel, updateModelName } from '../db';
import { getClassLabel } from '../utils/inspectionLabels';

const INITIAL_REGIONS = [
  { id: '1', name: 'Objeto 1', box: { x: 50, y: 50, w: 100, h: 100 }, samples: 0, status: null, confidence: 0 },
];

export const useInspectionModels = ({
  classifier,
  setCurrentProjectType,
  setViewMode,
  setIsPredicting,
  setCurrentBarcode,
}) => {
  const [selectedModel, setSelectedModel] = useState(null);
  const [availableModels, setAvailableModels] = useState([]);
  const [regions, setRegions] = useState(INITIAL_REGIONS);
  const [activeRegionId, setActiveRegionId] = useState('1');
  const [backgroundSamples, setBackgroundSamples] = useState(0);
  const regionsRef = useRef(regions);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [actionMessage, setActionMessage] = useState(null);
  const [actionMessageType, setActionMessageType] = useState('success');

  const [showModelTypeModal, setShowModelTypeModal] = useState(false);
  const [pendingModelName, setPendingModelName] = useState('');
  const [showNameModal, setShowNameModal] = useState(false);
  const [newModelNameInput, setNewModelNameInput] = useState('');
  const [nameModalError, setNameModalError] = useState('');
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameModelInput, setRenameModelInput] = useState('');
  const [renameModalError, setRenameModalError] = useState('');

  const modelsData = useRef({});
  const isSwitchingRef = useRef(false);

  const fetchModels = async () => {
    try {
      const { data } = await supabase.from('models').select('*').order('name', { ascending: true });
      setAvailableModels(data || []);
    } catch (e) {
      console.error('Erro ao buscar modelos:', e);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  useEffect(() => {
    regionsRef.current = regions;
  }, [regions]);

  const getCurrentModelId = () => {
    const found = availableModels.find((m) => m.name === selectedModel);
    return found ? found.id : null;
  };

  const saveModelConfig = async (modelName) => {
    if (!modelName) return;
    const currentConfig = modelsData.current[modelName];
    if (!currentConfig) return;

    try {
      localStorage.setItem(`modelData:${modelName}`, JSON.stringify(currentConfig));
    } catch (e) {
      console.error('Erro saving config to localStorage:', e);
    }

    const modelId = getCurrentModelId();
    if (modelId) {
      try {
        await supabase.from('models').update({ config: currentConfig }).eq('id', modelId);
      } catch (e) {
        console.error('Erro saving config to mock:', e);
      }
    }
  };

  const loadModelFromLocal = (modelName) => {
    try {
      const raw = localStorage.getItem(`modelData:${modelName}`);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  };

  useEffect(() => {
    if (selectedModel && !isSwitchingRef.current) {
      if (!modelsData.current[selectedModel]) modelsData.current[selectedModel] = {};
      const modelRef = modelsData.current[selectedModel];
      modelRef.regions = regions;
      modelRef.backgroundSamples = backgroundSamples;
      saveModelConfig(selectedModel);
    }
  }, [regions, backgroundSamples]);

  const handleAddModel = () => {
    setNewModelNameInput('');
    setNameModalError('');
    setShowNameModal(true);
  };

  const submitNewModelName = () => {
    const name = newModelNameInput.trim();
    if (!name) {
      setNameModalError('O nome não pode estar vazio.');
      return;
    }
    if (availableModels.some((m) => m.name === name)) {
      setNameModalError('Modelo já existe!');
      return;
    }
    setShowNameModal(false);
    setPendingModelName(name);
    setShowModelTypeModal(true);
  };

  const handleModelSelect = useCallback((modelName) => {
    isSwitchingRef.current = true;
    if (selectedModel) saveModelConfig(selectedModel);
    setSelectedModel(modelName);
    const stored = loadModelFromLocal(modelName);

    if (classifier.current) {
      classifier.current.clearAllClasses();
      if (stored?.dataset) {
        const ds = deserializeDataset(stored.dataset);
        if (ds) classifier.current.setClassifierDataset(ds);
      } else if (modelsData.current[modelName]?.dataset) {
        classifier.current.setClassifierDataset(modelsData.current[modelName].dataset);
      }
    }

    const defaultStructure = {
      regions: [{
        id: '1',
        name: `Objeto 1 (${modelName})`,
        box: { x: 50, y: 50, w: 150, h: 150 },
        samples: 0,
        status: null,
        confidence: 0,
      }],
      backgroundSamples: 0,
    };

    const sourceData = stored || modelsData.current[modelName] || defaultStructure;

    if (sourceData.type) {
      setCurrentProjectType(sourceData.type);
    } else if (sourceData.config?.type) {
      setCurrentProjectType(sourceData.config.type);
    } else {
      const modelFromList = availableModels.find((m) => m.name === modelName);
      const listConfig = modelFromList?.config || {};
      setCurrentProjectType(listConfig.type || 'detection');
    }

    const sourceRegions = sourceData.regions;
    const newRegions = (sourceRegions || []).map((r) => ({
      id: r.id,
      name: r.name,
      box: { ...r.box },
      samples: 0,
      status: null,
      confidence: 0,
    }));
    setRegions(newRegions);
    if (newRegions.length > 0) setActiveRegionId(newRegions[0].id);
    setBackgroundSamples(0);
    setViewMode('setup');
    setIsPredicting(false);
    setCurrentBarcode('');
    setTimeout(() => { isSwitchingRef.current = false; }, 0);
  }, [
    selectedModel,
    classifier,
    availableModels,
    setCurrentProjectType,
    setViewMode,
    setIsPredicting,
    setCurrentBarcode,
  ]);

  const handleStartScreenModelSelect = async (modelName, modelObj = null) => {
    setIsSyncing(true);
    setSyncStatus('Carregando modelo...');

    try {
      const found = modelObj || availableModels.find((m) => m.name === modelName);
      if (!found) throw new Error('Modelo não encontrado');

      const config = found.config || {};
      const projectType = config.type || 'detection';
      setCurrentProjectType(projectType);

      modelsData.current[modelName] = {
        type: projectType,
        regions: config.regions || [],
        backgroundSamples: config.backgroundSamples || 0,
        dataset: null,
      };

      handleModelSelect(modelName);
      setSyncStatus('Pronto!');
      setTimeout(() => setIsSyncing(false), 300);
    } catch (e) {
      console.error('Erro ao selecionar modelo:', e);
      alert('Erro ao carregar modelo: ' + e.message);
      setIsSyncing(false);
    }
  };

  const confirmModelCreation = async (projectType) => {
    setShowModelTypeModal(false);
    const name = pendingModelName;
    if (!name) return;

    const newModelConfig = {
      type: projectType,
      regions: [{
        id: '1',
        name: `Objeto 1 (${name})`,
        box: { x: 50, y: 50, w: 150, h: 150 },
        samples: 0,
        status: null,
        confidence: 0,
      }],
      backgroundSamples: 0,
    };

    try {
      const { data: inserted, error } = await supabase
        .from('models')
        .insert([{ name, config: newModelConfig }])
        .select();

      if (error) throw error;

      const newModel = inserted ? inserted[0] : { id: Date.now().toString(), name, config: newModelConfig };
      setAvailableModels((prev) => [...prev, newModel]);
      handleStartScreenModelSelect(name, newModel);
    } catch (e) {
      console.error('Erro ao criar modelo:', e);
      alert('Erro ao criar modelo.');
    }
    setPendingModelName('');
  };

  const handleEditModel = () => {
    if (!selectedModel) return;
    setRenameModelInput(selectedModel);
    setRenameModalError('');
    setShowRenameModal(true);
  };

  const submitRenameModel = async () => {
    const newName = renameModelInput.trim();
    if (!newName || newName === selectedModel) {
      setShowRenameModal(false);
      return;
    }
    if (availableModels.some((m) => m.name === newName)) {
      setRenameModalError('Já existe um modelo com este nome!');
      return;
    }

    setShowRenameModal(false);
    const modelId = getCurrentModelId();
    if (!modelId) return;

    try {
      const { error } = await supabase.from('models').update({ name: newName }).eq('id', modelId);
      if (error) throw error;

      setAvailableModels((prev) => prev.map((m) => (m.id === modelId ? { ...m, name: newName } : m)));

      if (modelsData.current[selectedModel]) {
        modelsData.current[newName] = modelsData.current[selectedModel];
        delete modelsData.current[selectedModel];
      }

      await updateModelName(selectedModel, newName);
      setSelectedModel(newName);
      setActionMessage(`Modelo renomeado para "${newName}" com sucesso!`);
      setActionMessageType('success');
      setTimeout(() => setActionMessage(null), 3000);
    } catch (e) {
      console.error('Erro ao renomear modelo:', e);
      alert('Erro ao renomear modelo.');
    }
  };

  const handleDeleteModel = async () => {
    if (!selectedModel) return;
    const modelId = getCurrentModelId();
    if (!modelId) return;

    if (!window.confirm(`Tem certeza que deseja EXCLUIR o modelo "${selectedModel}"? \nIsso apagará todas as configurações e imagens (Cloud e Local).`)) return;

    try {
      const { error } = await supabase.from('models').delete().eq('id', modelId);
      if (error) throw error;

      await deleteImagesByModel(selectedModel);
      if (modelsData.current[selectedModel]) delete modelsData.current[selectedModel];
      localStorage.removeItem(`modelData:${selectedModel}`);
      localStorage.removeItem(`smartinspector_regions_${selectedModel}`);

      await fetchModels();
      setSelectedModel(null);
      setViewMode('setup');
      alert('Modelo excluído com sucesso.');
    } catch (e) {
      console.error('Erro ao excluir modelo:', e);
    }
  };

  const addRegion = () => {
    const newId = Date.now().toString();
    const newRegion = {
      id: newId,
      name: `Objeto ${regions.length + 1}`,
      box: { x: 50, y: 50, w: 150, h: 150 },
      samples: 0,
      status: null,
      confidence: 0,
    };
    setRegions((prev) => {
      const updated = [...prev, newRegion];
      if (selectedModel && modelsData.current[selectedModel]) {
        modelsData.current[selectedModel].regions = updated.map((r) => ({ ...r, box: { ...r.box } }));
      }
      return updated;
    });
    setActiveRegionId(newId);
    if (selectedModel) saveModelConfig(selectedModel);
  };

  const handleDeleteRegion = async (id) => {
    if (regions.length <= 1) {
      alert('Você precisa ter pelo menos 1 região.');
      return;
    }
    if (!window.confirm('Tem certeza que deseja apagar este objeto? Todas as imagens de treinamento dele serão perdidas.')) return;

    try {
      const regionLabel = getClassLabel(selectedModel, id);
      const modelId = getCurrentModelId();

      if (modelId) {
        const { data: samples } = await supabase
          .from('training_samples')
          .select('image_path')
          .eq('model_id', modelId)
          .eq('label', regionLabel);

        if (samples && samples.length > 0) {
          const paths = samples.map((s) => s.image_path);
          await supabase.storage.from('training_datasets').remove(paths);
          await supabase.from('training_samples').delete().eq('model_id', modelId).eq('label', regionLabel);
        }
      }

      await deleteImagesByLabel(regionLabel);
      if (classifier.current) {
        try { classifier.current.clearClass(regionLabel); } catch (_) { /* ignore */ }
      }

      let nextActiveId = activeRegionId;
      if (activeRegionId === id) {
        nextActiveId = regions.filter((r) => r.id !== id)[0].id;
      }

      setRegions((prev) => {
        const updated = prev.filter((r) => r.id !== id);
        if (selectedModel && modelsData.current[selectedModel]) {
          modelsData.current[selectedModel].regions = updated;
        }
        return updated;
      });

      if (nextActiveId !== activeRegionId) setActiveRegionId(nextActiveId);
      if (selectedModel) await saveModelConfig(selectedModel);
    } catch (e) {
      console.error('Erro ao excluir região:', e);
      alert('Erro ao excluir região.');
    }
  };

  const handleClearRegionSamples = async (id, name) => {
    if (!window.confirm(`Deseja apagar todas as fotos de treinamento de "${name}"? (O quadrado da região será mantido)`)) return;

    try {
      const regionLabel = getClassLabel(selectedModel, id);
      const modelId = getCurrentModelId();

      if (modelId) {
        const { data: samples } = await supabase.from('training_samples')
          .select('image_path').eq('model_id', modelId).eq('label', regionLabel);

        if (samples && samples.length > 0) {
          const paths = samples.map((s) => s.image_path);
          await supabase.storage.from('training_datasets').remove(paths);
          await supabase.from('training_samples').delete().eq('model_id', modelId).eq('label', regionLabel);
        }
      }

      await deleteImagesByLabel(regionLabel);
      if (classifier.current) {
        try { classifier.current.clearClass(regionLabel); } catch (_) { /* ignore */ }
      }

      setRegions((prev) => {
        const updated = prev.map((r) => (r.id === id ? { ...r, samples: 0, status: null, confidence: 0 } : r));
        if (selectedModel && modelsData.current[selectedModel]) {
          modelsData.current[selectedModel].regions = updated;
        }
        return updated;
      });

      if (selectedModel) await saveModelConfig(selectedModel);
    } catch (e) {
      console.error('Erro ao limpar amostras:', e);
      alert('Erro ao limpar amostras.');
    }
  };

  const renameRegion = (id, name) => {
    setRegions((prev) => prev.map((reg) => (reg.id === id ? { ...reg, name } : reg)));
  };

  return {
    selectedModel,
    availableModels,
    regions,
    setRegions,
    activeRegionId,
    setActiveRegionId,
    regionsRef,
    backgroundSamples,
    setBackgroundSamples,
    addRegion,
    handleDeleteRegion,
    handleClearRegionSamples,
    renameRegion,
    isSyncing,
    syncStatus,
    actionMessage,
    actionMessageType,
    setActionMessage,
    setActionMessageType,
    modelsData,
    isSwitchingRef,
    getCurrentModelId,
    saveModelConfig,
    fetchModels,
    handleAddModel,
    submitNewModelName,
    confirmModelCreation,
    handleEditModel,
    submitRenameModel,
    handleDeleteModel,
    handleModelSelect,
    handleStartScreenModelSelect,
    showNameModal,
    setShowNameModal,
    newModelNameInput,
    setNewModelNameInput,
    nameModalError,
    setNameModalError,
    showModelTypeModal,
    setShowModelTypeModal,
    pendingModelName,
    showRenameModal,
    setShowRenameModal,
    renameModelInput,
    setRenameModelInput,
    renameModalError,
    setRenameModalError,
  };
};
