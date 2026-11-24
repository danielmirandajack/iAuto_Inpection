import { useCallback, useEffect, useRef } from 'react';
import { getVideoContentRect } from '../utils/videoMetrics';
import { drawInspectionFrame } from '../utils/drawInspectionFrame';

export const useInspectionCanvas = ({
  videoRef,
  viewModeRef,
  activeRegionIdRef,
  currentBarcodeRef,
  calibrationPointsRef,
  currentProjectTypeRef,
  scaleFactorRef,
  regionsRef,
}) => {
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  const measurementResultsRef = useRef([]);
  const frameCountRef = useRef(0);

  const loop = useCallback(() => {
    const viewMode = viewModeRef.current;
    const activeRegionId = activeRegionIdRef.current;
    const currentBarcode = currentBarcodeRef.current;

    if (!canvasRef.current || !videoRef.current) {
      requestRef.current = requestAnimationFrame(loop);
      return;
    }

    const ctx = canvasRef.current.getContext('2d');

    if (
      canvasRef.current.width !== videoRef.current.clientWidth ||
      canvasRef.current.height !== videoRef.current.clientHeight
    ) {
      canvasRef.current.width = videoRef.current.clientWidth;
      canvasRef.current.height = videoRef.current.clientHeight;
    }

    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    const metrics = getVideoContentRect(videoRef.current, canvasRef.current);
    if (!metrics) {
      requestRef.current = requestAnimationFrame(loop);
      return;
    }

    const { offsetX, offsetY, drawScale } = metrics;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(drawScale, drawScale);

    drawInspectionFrame({
      ctx,
      drawScale,
      viewMode,
      activeRegionId,
      currentBarcode,
      calibrationPoints: calibrationPointsRef.current,
      projectType: currentProjectTypeRef.current,
      scaleFactor: scaleFactorRef.current,
      regions: regionsRef.current,
      video: videoRef.current,
      frameCountRef,
      measurementResultsRef,
    });

    ctx.restore();
    requestRef.current = requestAnimationFrame(loop);
  }, [
    videoRef,
    viewModeRef,
    activeRegionIdRef,
    currentBarcodeRef,
    calibrationPointsRef,
    currentProjectTypeRef,
    scaleFactorRef,
    regionsRef,
  ]);

  const startLoop = useCallback(() => {
    requestRef.current = requestAnimationFrame(loop);
  }, [loop]);

  useEffect(() => () => {
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
  }, []);

  return { canvasRef, requestRef, loop, startLoop };
};
