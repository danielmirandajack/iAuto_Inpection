import { useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs';

const loadScript = (src) => new Promise((resolve, reject) => {
  const script = document.createElement('script');
  script.src = src;
  script.onload = resolve;
  script.onerror = reject;
  document.head.appendChild(script);
});

export const useAiEngine = () => {
  const classifier = useRef(null);
  const mobilenetModel = useRef(null);
  const [, setIsModelLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        window.tf = tf;
        await tf.setBackend('webgl').catch(() => console.log('WebGL não disponível, usando CPU'));
        await tf.ready();
        console.log('Backend atual:', tf.getBackend());

        await loadScript('/libs/iauto-inference-engine.js');
        await loadScript('/libs/iauto-cluster-module.js');
        await new Promise((r) => setTimeout(r, 500));

        if (!window.knnClassifier || !window.mobilenet) {
          throw new Error('Err: Bibliotecas de IA falharam.');
        }

        classifier.current = window.knnClassifier.create();
        console.log('Iniciando motor de inferência...');
        mobilenetModel.current = await window.mobilenet.load({ version: 2, alpha: 1.0 });
        setIsModelLoading(false);
        setIsReady(true);
      } catch (err) {
        console.error(err);
        setError('Erro ao inicializar sistema. ' + err.message);
        setIsModelLoading(false);
      }
    };

    init();
  }, []);

  return { classifier, mobilenetModel, isReady, error };
};
