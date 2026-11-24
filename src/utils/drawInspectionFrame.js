import { processMeasurement, calculateDistance } from '../services/MeasurementService';

const drawCalibration = (ctx, points, drawScale) => {
  points.forEach((p, i) => {
    ctx.fillStyle = '#06b6d4';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5 / drawScale, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.font = `bold ${12 / drawScale}px monospace`;
    ctx.fillText(i === 0 ? 'A' : 'B', p.x + (8 / drawScale), p.y - (8 / drawScale));
  });

  if (points.length !== 2) return;

  ctx.strokeStyle = '#06b6d4';
  ctx.lineWidth = 2 / drawScale;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  ctx.lineTo(points[1].x, points[1].y);
  ctx.stroke();

  const midX = (points[0].x + points[1].x) / 2;
  const midY = (points[0].y + points[1].y) / 2;
  const dx = points[1].x - points[0].x;
  const dy = points[1].y - points[0].y;
  const pixelDist = Math.sqrt(dx * dx + dy * dy);

  ctx.fillStyle = '#06b6d4';
  const text = `${pixelDist.toFixed(1)}px`;
  const textWidth = ctx.measureText(text).width;
  ctx.fillRect(midX, midY - (10 / drawScale), textWidth + 10, 15 / drawScale);

  ctx.fillStyle = 'black';
  ctx.fillText(text, midX + 2, midY);
};

const drawMeasurements = (ctx, results, scaleFactor, drawScale) => {
  const validPoints = results.filter((r) => r.status === 'ok' && r.centroid);

  if (validPoints.length === 1) {
    const res = validPoints[0];

    if (res.dimensionsPx && scaleFactor) {
      const wMm = res.dimensionsPx.width / scaleFactor;
      const hMm = res.dimensionsPx.height / scaleFactor;

      if (res.rotatedRect) {
        const { center, size, angle } = res.rotatedRect;
        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.rotate(angle * Math.PI / 180);
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2 / drawScale;
        ctx.strokeRect(-size.width / 2, -size.height / 2, size.width, size.height);
        ctx.restore();
      }

      ctx.fillStyle = '#0f172a';
      const text = `L: ${Math.min(wMm, hMm).toFixed(1)}mm  x  A: ${Math.max(wMm, hMm).toFixed(1)}mm`;
      const fontSize = 16 / drawScale;
      ctx.font = `bold ${fontSize}px font-mono`;
      const textWidth = ctx.measureText(text).width;
      const labelX = res.centroid.x - (textWidth / 2);
      const labelY = res.centroid.y;

      ctx.fillRect(labelX - 10, labelY - (fontSize + 10), textWidth + 20, fontSize + 20);
      ctx.fillStyle = '#4ade80';
      ctx.fillText(text, labelX, labelY);
    } else {
      ctx.fillStyle = '#eab308';
      ctx.fillText('Calculando dimensões...', res.centroid.x, res.centroid.y);
    }
    return;
  }

  if (validPoints.length >= 2) {
    validPoints.forEach((res) => {
      ctx.fillStyle = '#eab308';
      ctx.beginPath();
      ctx.arc(res.centroid.x, res.centroid.y, 4 / drawScale, 0, 2 * Math.PI);
      ctx.fill();
    });

    const p1 = validPoints[0].centroid;
    const p2 = validPoints[1].centroid;

    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 2 / drawScale;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.setLineDash([]);

    if (scaleFactor) {
      const distMm = calculateDistance(p1, p2, scaleFactor);
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;

      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      const text = `Dist: ${distMm.toFixed(2)} mm`;
      ctx.font = `bold ${16 / drawScale}px sans-serif`;
      const textWidth = ctx.measureText(text).width;
      ctx.fillRect(midX - 5, midY - (20 / drawScale), textWidth + 10, 25 / drawScale);

      ctx.fillStyle = '#fbbf24';
      ctx.fillText(text, midX, midY);
    }
    return;
  }

  if (results.length > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    const xPos = 10 / drawScale;
    const yPos = 10 / drawScale;
    ctx.fillRect(xPos, yPos, 220 / drawScale, 30 / drawScale);
    ctx.fillStyle = '#fbbf24';
    ctx.font = `bold ${14 / drawScale}px sans-serif`;
    ctx.fillText('Buscando objeto...', xPos + (10 / drawScale), yPos + (20 / drawScale));
  }
};

const drawRegions = (ctx, regions, viewMode, activeRegionId, currentBarcode, drawScale) => {
  regions.forEach((region) => {
    const { x, y, w, h } = region.box;
    const isActive = region.id === activeRegionId;

    let strokeColor = '#64748b';
    let lineWidth = 2;

    if (viewMode === 'operator') {
      if (region.status === 'ok') strokeColor = '#22c55e';
      else if (region.status === 'bad') strokeColor = '#ef4444';
      else strokeColor = '#3b82f6';
      lineWidth = 3;
    } else {
      strokeColor = '#fbbf24';
      lineWidth = isActive ? 3 : 2;
    }

    ctx.lineWidth = lineWidth / drawScale;
    ctx.strokeStyle = strokeColor;
    ctx.setLineDash(viewMode === 'setup' && !isActive ? [5, 5] : []);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    if (viewMode === 'setup' || (viewMode === 'operator' && currentBarcode)) {
      ctx.fillStyle = strokeColor;
      const labelText = viewMode === 'operator' && region.status
        ? (region.status === 'ok' ? 'OK' : 'FALHA')
        : region.name;

      ctx.font = `bold ${12 / drawScale}px sans-serif`;
      const textWidth = ctx.measureText(labelText).width;

      ctx.fillRect(x, y - (22 / drawScale), textWidth + (16 / drawScale), (22 / drawScale));
      ctx.fillStyle = (viewMode === 'operator' && region.status) ? '#fff' : '#000';
      ctx.fillText(labelText, x + (4 / drawScale), y - (6 / drawScale));
    }

    if (viewMode === 'setup' && isActive) {
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(x + w, y + h, 8 / drawScale, 0, 2 * Math.PI);
      ctx.fill();
    }
  });
};

export const drawInspectionFrame = ({
  ctx,
  drawScale,
  viewMode,
  activeRegionId,
  currentBarcode,
  calibrationPoints,
  projectType,
  scaleFactor,
  regions,
  video,
  frameCountRef,
  measurementResultsRef,
}) => {
  if (viewMode === 'calibration') {
    drawCalibration(ctx, calibrationPoints, drawScale);
  }

  if (projectType === 'metrology' && viewMode === 'operator' && currentBarcode) {
    frameCountRef.current += 1;

    if (frameCountRef.current % 10 === 0 && scaleFactor) {
      measurementResultsRef.current = regions.map((r) => {
        const res = processMeasurement(video, r, scaleFactor);
        return { id: r.id, ...res };
      });
    }

    drawMeasurements(ctx, measurementResultsRef.current, scaleFactor, drawScale);
  }

  drawRegions(ctx, regions, viewMode, activeRegionId, currentBarcode, drawScale);
};
