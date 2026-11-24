export const captureCropBase64 = (video, box) => {
  if (!video) return null;

  const canvas = document.createElement('canvas');
  canvas.width = box.w;
  canvas.height = box.h;
  const ctx = canvas.getContext('2d');

  if (canvas.width <= 0 || canvas.height <= 0) return null;

  ctx.drawImage(
    video,
    box.x, box.y, box.w, box.h,
    0, 0, canvas.width, canvas.height
  );
  return canvas.toDataURL('image/jpeg', 0.8);
};

export const captureFullScreenshot = (video, regions) => {
  if (!video) return null;

  const offCanvas = document.createElement('canvas');
  offCanvas.width = video.videoWidth;
  offCanvas.height = video.videoHeight;
  const ctx = offCanvas.getContext('2d');

  if (offCanvas.width === 0 || offCanvas.height === 0) return null;

  ctx.drawImage(video, 0, 0, offCanvas.width, offCanvas.height);

  regions.forEach((region) => {
    const { x, y, w, h } = region.box;

    let strokeColor = '#3b82f6';
    if (region.status === 'ok') strokeColor = '#22c55e';
    else if (region.status === 'bad') strokeColor = '#ef4444';

    ctx.lineWidth = 2;
    ctx.strokeStyle = strokeColor;
    ctx.strokeRect(x, y, w, h);

    const labelText = region.status ? (region.status === 'ok' ? 'OK' : 'FALHA') : region.name;
    ctx.font = 'bold 12px sans-serif';
    const textWidth = ctx.measureText(labelText).width;
    const textHeight = 16;

    ctx.fillStyle = strokeColor;
    ctx.fillRect(x, y - textHeight, textWidth + 10, textHeight);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(labelText, x + 5, y - 4);
  });

  const allOk = regions.every((r) => r.status === 'ok');
  const globalStatus = allOk ? 'APROVADO' : 'REPROVADO';
  const statusColor = allOk ? '#22c55e' : '#ef4444';

  ctx.save();
  ctx.font = 'bold 24px sans-serif';
  ctx.fillStyle = statusColor;
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 1;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.strokeText(globalStatus, offCanvas.width - 15, offCanvas.height - 15);
  ctx.fillText(globalStatus, offCanvas.width - 15, offCanvas.height - 15);
  ctx.restore();

  return offCanvas.toDataURL('image/jpeg', 0.8);
};
