import { useCallback, useRef, useState } from 'react';

export const useWebcam = ({ streamReadyRef } = {}) => {
  const videoRef = useRef(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [loadingError, setLoadingError] = useState(null);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  const getDevices = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      setVideoDevices(devices.filter((device) => device.kind === 'videoinput'));
    } catch (e) {
      console.error('Erro ao listar dispositivos:', e);
    }
  }, []);

  const startWebcam = useCallback(async (deviceId = null) => {
    try {
      setLoadingError(null);

      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((track) => track.stop());
      }

      if (!navigator.mediaDevices?.getUserMedia) return;

      const constraints = {
        audio: false,
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          facingMode: deviceId ? undefined : 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          setIsCameraReady(true);
          videoRef.current.play();
          if (!deviceId) {
            const track = stream.getVideoTracks()[0];
            const settings = track.getSettings();
            if (settings.deviceId) setSelectedDeviceId(settings.deviceId);
          }
          streamReadyRef?.current?.();
        };
      }
    } catch (err) {
      console.error('ERRO FATAL NA CÂMERA:', err);
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setLoadingError('Nenhuma câmera encontrada. Verifique a conexão e as permissões.');
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setLoadingError('Permissão de câmera negada. Habilite nas configurações do navegador.');
      } else {
        setLoadingError(`Erro na câmera: ${err.message || 'Desconhecido'}`);
      }
      setIsCameraReady(false);
    }
  }, [streamReadyRef]);

  const handleCameraChange = (e) => {
    const newDeviceId = e.target.value;
    setSelectedDeviceId(newDeviceId);
    startWebcam(newDeviceId);
  };

  const handleRetryCamera = () => {
    setLoadingError(null);
    startWebcam();
  };

  return {
    videoRef,
    isCameraReady,
    loadingError,
    setLoadingError,
    videoDevices,
    selectedDeviceId,
    startWebcam,
    getDevices,
    handleCameraChange,
    handleRetryCamera,
  };
};
