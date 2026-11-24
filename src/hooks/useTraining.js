import { useEffect, useRef } from 'react';
import * as tf from '@tensorflow/tfjs';
import { saveImage, getImagesByModel, deleteImagesByModel } from '../db';
import { getClassLabel } from '../utils/inspectionLabels';
import { captureCropBase64 } from '../utils/captureFrame';

export const useTraining = ({
  videoRef,
  isCameraReady,
  classifier,
  mobilenetModel,
  selectedModel,
  regions,
  setRegions,
  activeRegionId,
  setActiveRegionId,
  backgroundSamples,
  setBackgroundSamples,
  modelsData,
  saveModelConfig,
  isPredicting,
  currentBarcode,
  threshold,
  setActionMessage,
  setActionMessageType,
}) => {
  const predictRef = useRef(null);

  const getCropTensor = (box) => {
    if (!videoRef.current || !mobilenetModel.current || !isCameraReady) return null;
    const video = videoRef.current;
    if (video.readyState !== 4) return null;

    return tf.tidy(() => {
      const img = tf.browser.fromPixels(video);

      let startX = Math.floor(box.x);
      let startY = Math.floor(box.y);
      let width = Math.floor(box.w);
      let height = Math.floor(box.h);

      startX = Math.max(0, startX);
      startY = Math.max(0, startY);
      if (startX + width > video.videoWidth) width = video.videoWidth - startX;
      if (startY + height > video.videoHeight) height = video.videoHeight - startY;
      if (width <= 0 || height <= 0) return null;

      try {
        const crop = img.slice([startY, startX, 0], [height, width, 3]);
        return mobilenetModel.current.infer(crop, true);
      } catch (e) {
        return null;
      }
    });
  };

  useEffect(() => {
    const loadLocalTrainingData = async () => {
      if (!classifier.current || !mobilenetModel.current || !selectedModel) return;

      classifier.current.clearAllClasses();

      try {
        console.log(`Carregando dados locais para: ${selectedModel}`);
        const modelData = await getImagesByModel(selectedModel);
        if (!modelData) return;

        console.log(`Carregado ${modelData.length} imagens de ${selectedModel}`);
        const sampleCounts = {};
        let newBgSamples = 0;

        for (const row of modelData) {
          try {
            const label = row.label;
            if (!row.url) continue;

            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = row.url;
            await new Promise((resolve) => { img.onload = resolve; });

            const activation = mobilenetModel.current.infer(img, true);
            const normalizedLabel = label.toLowerCase().trim();

            if (normalizedLabel === 'background') {
              classifier.current.addExample(activation, 'background');
              newBgSamples += 1;
            } else {
              classifier.current.addExample(activation, label);
              sampleCounts[label] = (sampleCounts[label] || 0) + 1;
            }
            activation.dispose();
          } catch (err) {
            console.error('Erro processando imagem:', err);
          }
        }

        console.log(`Finalizado: ${newBgSamples} amostras de fundo carregadas.`);

        setRegions((prev) => prev.map((r) => {
          const expectedLabel = `${selectedModel}::${r.id}`;
          return { ...r, samples: sampleCounts[expectedLabel] || 0 };
        }));
        setBackgroundSamples(newBgSamples);
      } catch (e) {
        console.error('Erro geral loading:', e);
      }
    };

    loadLocalTrainingData();
  }, [selectedModel, classifier, mobilenetModel, setRegions]);

  const addObjectExample = async (e, targetRegionId = null) => {
    if (e) e.stopPropagation();
    if (isPredicting || !classifier.current) return;

    const regionIdToUse = targetRegionId || activeRegionId;
    const activeRegion = regions.find((r) => r.id === regionIdToUse);
    if (!activeRegion) {
      console.error('No active region found');
      return;
    }

    if (activeRegion.samples >= 20) {
      alert('Limite de 20 exemplos atingido para otimizar desempenho.');
      return;
    }

    console.log(`Adding example for region ${activeRegion.id} (${activeRegion.name})`);

    const activation = getCropTensor(activeRegion.box);
    if (!activation) return;

    classifier.current.addExample(activation, getClassLabel(selectedModel, activeRegion.id));
    activation.dispose();

    setRegions((prevRegions) =>
      prevRegions.map((r) => (r.id === regionIdToUse ? { ...r, samples: r.samples + 1 } : r))
    );

    try {
      const imageBase64 = captureCropBase64(videoRef.current, activeRegion.box);
      if (imageBase64 && selectedModel) {
        await saveImage(selectedModel, getClassLabel(selectedModel, activeRegion.id), imageBase64);
      }
      console.log('Imagem salva localmente com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar imagem:', err);
    }
  };

  const addBackgroundExample = async () => {
    if (isPredicting || !classifier.current) return;
    let successCount = 0;

    for (const region of regions) {
      const activation = getCropTensor(region.box);
      if (!activation) continue;

      classifier.current.addExample(activation, 'background');
      activation.dispose();
      successCount += 1;

      try {
        const imageBase64 = captureCropBase64(videoRef.current, region.box);
        if (imageBase64) {
          await saveImage(selectedModel, 'background', imageBase64);
        }
      } catch (err) {
        console.error('Erro ao salvar fundo:', err);
      }
    }
    if (successCount > 0) setBackgroundSamples((prev) => prev + 1);
  };

  const predictAllRegions = async () => {
    if (!classifier.current || classifier.current.getNumClasses() === 0) return;

    const updatedRegions = await Promise.all(regions.map(async (region) => {
      if (region.samples === 0 && backgroundSamples === 0) return { ...region, status: null, confidence: 0 };

      const activation = getCropTensor(region.box);
      if (!activation) return region;

      let resultStatus = 'bad';
      let conf = 0;
      const label = getClassLabel(selectedModel, region.id);

      try {
        const result = await classifier.current.predictClass(activation);
        if (result.label === label) {
          conf = result.confidences[label] || 0;
          if (conf >= threshold) resultStatus = 'ok';
        } else {
          conf = result.confidences[label] || 0;
          resultStatus = 'bad';
        }
      } catch (e) {
        console.log(e);
      } finally {
        activation.dispose();
      }

      return { ...region, status: resultStatus, confidence: conf };
    }));

    setRegions(updatedRegions);
  };

  useEffect(() => {
    let isMounted = true;
    const loopPrediction = async () => {
      if (!isMounted) return;
      if (isPredicting && currentBarcode) {
        await predictAllRegions();
        predictRef.current = setTimeout(loopPrediction, 333);
      }
    };

    if (isPredicting && currentBarcode) {
      loopPrediction();
    } else {
      if (predictRef.current) clearTimeout(predictRef.current);
      setRegions((prev) => prev.map((r) => ({ ...r, status: null, confidence: 0 })));
    }

    return () => {
      if (predictRef.current) clearTimeout(predictRef.current);
    };
  }, [isPredicting, currentBarcode, threshold]);

  const handleDeleteAllPhotos = async () => {
    if (!selectedModel) return;

    const confirmDelete = window.confirm(
      '⚠️ ATENÇÃO: Isso vai excluir TODOS os objetos e TODAS as fotos deste modelo (Nuvem e Local). O modelo voltará ao estado inicial. Tem certeza?'
    );
    if (!confirmDelete) return;

    try {
      if (setActionMessage) {
        setActionMessage('Excluindo tudo...');
        setActionMessageType?.('warning');
      }
      await deleteImagesByModel(selectedModel);
      if (classifier.current) classifier.current.clearAllClasses();

      const defaultRegions = [{
        id: Date.now().toString(),
        name: `Objeto 1 (${selectedModel})`,
        box: { x: 50, y: 50, w: 150, h: 150 },
        samples: 0,
        status: null,
        confidence: 0,
      }];

      setRegions(defaultRegions);
      setBackgroundSamples(0);
      setActiveRegionId(defaultRegions[0].id);

      if (modelsData.current[selectedModel]) {
        modelsData.current[selectedModel].regions = defaultRegions;
        modelsData.current[selectedModel].backgroundSamples = 0;
      }
      await saveModelConfig(selectedModel);

      if (setActionMessage) {
        setActionMessage('✅ Modelo resetado com sucesso!');
        setActionMessageType?.('success');
        setTimeout(() => setActionMessage(null), 3000);
      }
    } catch (err) {
      console.error('Erro ao resetar modelo:', err);
      if (setActionMessage) {
        setActionMessage('❌ Erro ao resetar modelo');
        setActionMessageType?.('error');
        setTimeout(() => setActionMessage(null), 3000);
      }
    }
  };

  return {
    predictRef,
    addObjectExample,
    addBackgroundExample,
    handleDeleteAllPhotos,
  };
};
