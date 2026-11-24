import { useRef, useState } from 'react';
import { getVideoContentRect } from '../utils/videoMetrics';

const getClientCoordinates = (e) => {
  if (e.touches && e.touches.length > 0) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  return { x: e.clientX, y: e.clientY };
};

export const useRegionInteraction = ({
  videoRef,
  canvasRef,
  viewMode,
  regions,
  setRegions,
  activeRegionId,
  setActiveRegionId,
  selectedModel,
  modelsData,
  saveModelConfig,
  regionsRef,
  addCalibrationPoint,
}) => {
  const [interactionMode, setInteractionMode] = useState('none');
  const dragStartRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e) => {
    const { x, y } = getClientCoordinates(e);
    const metrics = getVideoContentRect(videoRef.current, canvasRef.current);
    if (!metrics) return;

    const { rect, offsetX, offsetY, scale } = metrics;
    const mouseX = ((x - rect.left) - offsetX) * scale;
    const mouseY = ((y - rect.top) - offsetY) * scale;

    if (viewMode === 'calibration') {
      addCalibrationPoint(mouseX, mouseY);
      return;
    }
    if (viewMode !== 'setup') return;

    const RESIZE_THRESHOLD = 30 * scale;
    const activeRegion = regions.find((r) => r.id === activeRegionId);
    if (activeRegion) {
      const { x: rx, y: ry, w: rw, h: rh } = activeRegion.box;
      const dist = Math.sqrt(Math.pow(mouseX - (rx + rw), 2) + Math.pow(mouseY - (ry + rh), 2));
      if (dist < RESIZE_THRESHOLD) {
        setInteractionMode('resize');
        dragStartRef.current = { x: mouseX, y: mouseY };
        return;
      }
    }

    const clickedRegion = regions.find((r) =>
      mouseX >= r.box.x && mouseX <= r.box.x + r.box.w &&
      mouseY >= r.box.y && mouseY <= r.box.y + r.box.h
    );

    if (clickedRegion) {
      setActiveRegionId(clickedRegion.id);
      setInteractionMode('move');
      dragStartRef.current = { x: mouseX, y: mouseY };
    }
  };

  const handleMouseMove = (e) => {
    if (viewMode !== 'setup' || interactionMode === 'none') return;
    const { x, y } = getClientCoordinates(e);
    const metrics = getVideoContentRect(videoRef.current, canvasRef.current);
    if (!metrics) return;

    const { rect, offsetX, offsetY, scale } = metrics;
    const mouseX = ((x - rect.left) - offsetX) * scale;
    const mouseY = ((y - rect.top) - offsetY) * scale;
    const dx = mouseX - dragStartRef.current.x;
    const dy = mouseY - dragStartRef.current.y;

    setRegions((prev) => {
      const updated = prev.map((r) => {
        if (r.id !== activeRegionId) return r;
        const newBox = { ...r.box };
        if (interactionMode === 'move') {
          newBox.x += dx;
          newBox.y += dy;
        } else if (interactionMode === 'resize') {
          newBox.w = Math.max(20, newBox.w + dx);
          newBox.h = Math.max(20, newBox.h + dy);
        }
        return { ...r, box: newBox };
      });

      regionsRef.current = updated;
      if (selectedModel && modelsData.current[selectedModel]) {
        modelsData.current[selectedModel].regions = updated.map((r) => ({ ...r, box: { ...r.box } }));
      }
      return updated;
    });

    dragStartRef.current = { x: mouseX, y: mouseY };
  };

  const handleMouseUp = () => {
    if (interactionMode !== 'none') {
      setInteractionMode('none');
      if (selectedModel) saveModelConfig(selectedModel);
    }
  };

  return { handleMouseDown, handleMouseMove, handleMouseUp };
};
