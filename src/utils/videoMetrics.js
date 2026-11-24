/** Maps object-fit:contain letterbox/pillarbox between screen and video pixels. */
export const getVideoContentRect = (video, canvas) => {
  if (!video || !canvas) return null;
  const rect = canvas.getBoundingClientRect();

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cw = rect.width;
  const ch = rect.height;

  if (!vw || !vh || !cw || !ch) return null;

  const videoRatio = vw / vh;
  const containerRatio = cw / ch;

  let drawWidth;
  let drawHeight;
  let offsetX;
  let offsetY;

  if (containerRatio > videoRatio) {
    drawHeight = ch;
    drawWidth = ch * videoRatio;
    offsetX = (cw - drawWidth) / 2;
    offsetY = 0;
  } else {
    drawWidth = cw;
    drawHeight = cw / videoRatio;
    offsetX = 0;
    offsetY = (ch - drawHeight) / 2;
  }

  return {
    rect,
    offsetX,
    offsetY,
    scale: vw / drawWidth,
    drawScale: drawWidth / vw,
  };
};
