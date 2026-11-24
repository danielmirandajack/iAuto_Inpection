const $ = (id) => document.getElementById(id);

const state = {
  running: false,
  paused: false,
  drawing: false,
  box: null,
  start: null,
  mode: "capture",
  fabrics: [],
  lastLive: { width: 0, height: 0, detections: [] },
};

let liveTimer = 0;
let liveBlob = "";
let pullingFrame = false;
let gridSkuId = null;
let imageControlTimer = 0;
let lastTrainRunning = false;

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!res.ok) {
    const detail = body && typeof body === "object" ? (body.detail ?? body) : (text || res.statusText);
    const message = typeof detail === "string" ? detail : JSON.stringify(detail);
    throw new Error(message);
  }
  return body;
}

function fillSelect(el, items, getValue, getLabel, selected) {
  el.innerHTML = items
    .map((item) => {
      const value = getValue(item);
      const sel = String(value) === String(selected) ? "selected" : "";
      return `<option value="${value}" ${sel}>${getLabel(item)}</option>`;
    })
    .join("");
}

function setStep(n) {
  document.querySelectorAll(".steps li").forEach((li) => {
    const step = Number(li.dataset.step);
    li.classList.toggle("is-current", step === n);
    li.classList.toggle("is-done", step < n);
  });
}

function setGuide(title, text) {
  $("guideTitle").textContent = title;
  $("guideText").innerHTML = text;
}

function hasBox() {
  if (!state.box) return false;
  return Math.abs(state.box.w) > 8 && Math.abs(state.box.h) > 8;
}

function setProdStep(current) {
  document.querySelectorAll("#prodSteps li").forEach((li) => {
    const step = li.dataset.step;
    li.classList.toggle("is-current", step === current);
    li.classList.toggle("is-done", step < current);
  });
}

function renderAlert(live) {
  const banner = $("alertBanner");
  const alert = live.alert;
  const on = Boolean(state.mode === "production" && alert && alert.active);
  banner.hidden = !on;
  $("videoWrap").classList.toggle("is-alarm", on);
  if ($("clockHud") && live.clock_time) $("clockHud").textContent = live.clock_time;
  if (on) {
    $("alertTime").textContent = alert.clock_time;
    $("alertDetail").textContent = `${alert.class_label} · ${alert.confidence}% · ${alert.meters.toFixed(3)} m`;
  }
  const list = $("alertList");
  if (list) {
    list.innerHTML = (live.alerts || [])
      .map(
        (item) =>
          `<li><span>${item.clock_time}</span><strong>${item.class_label}</strong><span>${item.meters.toFixed(3)} m</span></li>`
      )
      .join("") || "<li>Nenhuma falha nesta sessão.</li>";
  }
}

function syncActions() {
  const wrap = $("videoWrap");
  const production = state.mode === "production";
  $("steps").hidden = production;
  $("prodSteps").hidden = !production;
  $("capturePanel").hidden = production;
  $("prodPanel").hidden = !production;
  $("modeCapture").classList.toggle("is-on", !production);
  $("modeProd").classList.toggle("is-on", production);
  wrap.classList.toggle("is-live", state.running && !state.paused);
  wrap.classList.toggle("is-paused", state.paused && !production);
  $("pauseBtn").hidden = production || !state.running || state.paused;
  $("resumeBtn").hidden = production || !state.paused;
  $("drawHelp").hidden = production || !state.paused;
  $("goodBtn").disabled = production || !state.running;
  $("defectBtn").disabled = production || !(state.paused && hasBox());
  document.body.classList.toggle("is-production", production);
  $("newFabricRow").hidden = production;
  $("samplesCard").hidden = production;
  $("sku").disabled = state.running;
  $("addSku").disabled = production || state.running;
  $("newSku").disabled = production || state.running;
  $("startBtn").disabled = production && !state.fabrics.some((f) => f.has_model);
  $("skuLabelText").textContent = production ? "Tecido treinado" : "Tecido já criado";
  $("skuHelp").textContent = production
    ? "Só aparecem tecidos com modelo treinado. Para criar um novo, volte a Captura / treino."
    : "Esta lista são os tecidos que já existem. Escolha o desenho/cor que está a passar agora.";

  if (production) {
    if (!state.running) {
      setProdStep("p1");
      $("actionTitle").textContent = "Produção — análise ao vivo";
      $("actionLead").textContent = "Ligue a câmera com o modelo treinado. O sistema marca a hora de cada falha.";
      setGuide("Modo produção", "Escolha o <strong>tecido treinado</strong> e ligue a câmera. Só esse modelo e essas fotos entram na inspeção.");
    } else if (state.lastLive.alert && state.lastLive.alert.active) {
      setProdStep("p3");
      $("actionTitle").textContent = "Falha detectada";
      $("actionLead").textContent = `Às ${state.lastLive.alert.clock_time} foi identificado: ${state.lastLive.alert.class_label}.`;
      setGuide("Problema identificado", `Hora <strong>${state.lastLive.alert.clock_time}</strong> · ${state.lastLive.alert.class_label}`);
    } else {
      setProdStep("p2");
      $("actionTitle").textContent = "Tecido em análise";
      $("actionLead").textContent = "Passe o tecido. Se aparecer um defeito, o alerta vermelho mostra a hora (hh:mm:ss).";
      setGuide("Análise ao vivo", "O modelo está a inspecionar. Aguarde o tecido passar à frente da câmera.");
    }
    return;
  }

  if (!state.running) {
    setStep(1);
    $("actionTitle").textContent = "Passo 1 — Ligar a câmera";
    $("actionLead").textContent = "Crie ou escolha o tecido. As fotos e o treino ficam só nesse nome.";
    setGuide("Comece pela câmera", "Clique em <strong>Ligar câmera</strong> à direita.");
    return;
  }
  if (!state.paused) {
    setStep(2);
    $("actionTitle").textContent = "Passo 2 — Pausar";
    $("actionLead").textContent = "Quando vir o defeito, pare o tecido físico e clique em Pausar (ou Espaço).";
    setGuide("Imagem ao vivo", "Pode <strong>gravar tecido BOM</strong> já. Para defeito, <strong>pare o tecido</strong> e clique em <strong>Pausar para marcar</strong>.");
    return;
  }
  if (!hasBox()) {
    setStep(3);
    $("actionTitle").textContent = "Passo 3 — Desenhar o quadrado";
    $("actionLead").textContent = "Na foto, clique e arraste em cima do defeito. O retângulo azul marca a zona.";
    setGuide(
      "Clique e arraste na foto",
      "Pressione o botão do rato num canto do defeito, arraste até o outro canto e solte. Depois grave à direita."
    );
    return;
  }
  setStep(4);
  $("actionTitle").textContent = "Passo 4 — Gravar";
  $("actionLead").textContent = "Escolha o tipo de defeito e clique em Gravar DEFEITO. Ou grave tecido BOM se a foto estiver boa.";
  setGuide("Quadrado pronto", "Se a marcação estiver certa, escolha o tipo e clique em <strong>Gravar DEFEITO</strong>.");
}

function renderCounts(live) {
  const counts = live.counts || [];
  $("counts").innerHTML = counts
    .map((c) => `<li><span>${c.label}</span><strong>${c.count}</strong></li>`)
    .join("");
  if (live.mm_per_px) {
    $("opticsHint").textContent =
      `${live.mm_per_px} mm/px · defeito mínimo ~${live.min_defect_mm} mm · ${live.width}×${live.height} @ ${live.fps} fps`;
  }
  $("meterHud").textContent = `${(live.meters || 0).toFixed(3)} m`;
  const fpsEl = $("fpsHud");
  if (fpsEl) {
    if (live.paused) fpsEl.textContent = "pausado";
    else if (live.running && typeof live.fps === "number") fpsEl.textContent = `${Number(live.fps).toFixed(1)} fps`;
    else fpsEl.textContent = "-- fps";
  }
  if (live.mm_per_px) {
    $("opticsHint").textContent =
      `${live.mm_per_px} mm/px · defeito mínimo ~${live.min_defect_mm} mm · ${live.width}×${live.height} @ ${live.fps} fps`;
  }
  if (live.running && !live.paused && typeof live.brightness === "number" && live.brightness < 12) {
    $("opticsHint").textContent = "Imagem muito escura. Abra Câmera e velocidade e escolha a entrada RGB (não a IR).";
  }
  if (live.train?.running || (live.train?.message && live.train.message !== "Nenhum treino iniciado.")) {
    $("trainMsg").textContent = live.train.message;
  }
  if (typeof live.model_loaded === "boolean") {
    $("statusLine").textContent = live.model_loaded
      ? (state.mode === "production"
        ? `Produção · ${live.model_sku || "modelo ativo"}`
        : `Captura · ${live.model_sku || "modelo disponível"}`)
      : "Local · sem modelo carregado";
  }
  if (live.model_path) {
    const maxConf = Number(live.last_max_conf || 0);
    const threshold = Math.round(Number(live.detect_conf || 0.15) * 100);
    if (state.mode === "production" && live.running) {
      if ((live.detections || []).length) {
        const best = live.detections.reduce((a, b) => (a.confidence > b.confidence ? a : b));
        $("modelHint").textContent =
          `Falha: ${best.class_slug} · ${Math.round(best.confidence * 100)}% (limiar ${threshold}%)`;
      } else {
        $("modelHint").textContent =
          `A inspecionar '${live.model_sku}'. Nenhuma falha ≥ ${threshold}% (máx neste instante: ${maxConf}%).`;
      }
    } else {
      $("modelHint").textContent = live.model_sku
        ? `Modelo só de '${live.model_sku}': ${live.model_path}`
        : `Modelo: ${live.model_path}`;
    }
  } else if (live.model_error) {
    $("modelHint").textContent = live.model_error;
  }
}

function containRect(img, srcW, srcH) {
  const cw = img.clientWidth;
  const ch = img.clientHeight;
  if (!srcW || !srcH) return { x: 0, y: 0, w: cw, h: ch };
  const scale = Math.min(cw / srcW, ch / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
}

function normBox(box) {
  let { x, y, w, h } = box;
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  return { x, y, w, h };
}

function paintOverlay() {
  const canvas = $("overlay");
  const img = $("live");
  const w = img.clientWidth;
  const h = img.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const srcW = state.lastLive.width || img.naturalWidth;
  const srcH = state.lastLive.height || img.naturalHeight;
  const mapped = containRect(img, srcW, srcH);

  (state.lastLive.detections || []).forEach((det) => {
    const x = mapped.x + det.bbox[0] * mapped.w;
    const y = mapped.y + det.bbox[1] * mapped.h;
    const bw = det.bbox[2] * mapped.w;
    const bh = det.bbox[3] * mapped.h;
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, bw, bh);
    ctx.font = "12px Segoe UI";
    ctx.fillStyle = "#ef4444";
    ctx.fillText(`${det.class_slug}`, x, Math.max(12, y - 6));
  });

  if (state.box && (state.drawing || hasBox())) {
    const b = normBox(state.box);
    ctx.save();
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = "rgba(37, 99, 235, 0.18)";
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.restore();
    ctx.fillStyle = "#1d4ed8";
    ctx.font = "bold 13px Segoe UI";
    ctx.fillText("Defeito marcado", b.x, Math.max(16, b.y - 8));
  }
}

function pointerPos(ev) {
  const r = $("overlay").getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}

function onPointerDown(ev) {
  if (!state.paused) {
    $("captureMsg").textContent = "Pause primeiro. Só depois dá para desenhar o quadrado.";
    return;
  }
  ev.preventDefault();
  $("overlay").setPointerCapture(ev.pointerId);
  const p = pointerPos(ev);
  state.drawing = true;
  state.start = p;
  state.box = { x: p.x, y: p.y, w: 0, h: 0 };
  $("guide").style.opacity = "0.35";
  paintOverlay();
}

function onPointerMove(ev) {
  if (!state.drawing) return;
  ev.preventDefault();
  const p = pointerPos(ev);
  state.box.w = p.x - state.start.x;
  state.box.h = p.y - state.start.y;
  paintOverlay();
}

function onPointerUp(ev) {
  if (!state.drawing) return;
  ev.preventDefault();
  state.drawing = false;
  $("guide").style.opacity = "";
  if (!hasBox()) {
    state.box = null;
    $("captureMsg").textContent = "Quadrado demasiado pequeno. Clique, arraste e solte sobre o defeito.";
  } else {
    $("captureMsg").textContent = "Quadrado desenhado. Escolha o tipo e grave o defeito.";
  }
  syncActions();
  paintOverlay();
}

$("overlay").addEventListener("pointerdown", onPointerDown);
$("overlay").addEventListener("pointermove", onPointerMove);
$("overlay").addEventListener("pointerup", onPointerUp);
$("overlay").addEventListener("pointercancel", onPointerUp);

function toNormalizedBox() {
  if (!hasBox()) return null;
  const img = $("live");
  const liveW = state.lastLive.width || img.naturalWidth || 1920;
  const liveH = state.lastLive.height || img.naturalHeight || 1080;
  const rect = containRect(img, liveW, liveH);
  const b = normBox(state.box);
  return [
    (b.x - rect.x) / rect.w,
    (b.y - rect.y) / rect.h,
    b.w / rect.w,
    b.h / rect.h,
  ];
}

function fillFabricSelect(selectedId) {
  const source = state.mode === "production"
    ? state.fabrics.filter((f) => f.has_model)
    : state.fabrics;
  if (!source.length) {
    $("sku").innerHTML = state.mode === "production"
      ? '<option value="">Nenhum tecido treinado</option>'
      : '<option value="">Crie um tecido primeiro</option>';
    showFabricSummary();
    return;
  }
  const selected = source.some((f) => f.id === Number(selectedId))
    ? selectedId
    : source[0].id;
  fillSelect(
    $("sku"),
    source,
    (f) => f.id,
    (f) => {
      const mark = f.has_model ? "treinado" : "sem modelo";
      return `${f.name} · ${mark} · ${f.sample_total} fotos`;
    },
    selected
  );
  showFabricSummary();
}

function currentFabric() {
  const id = Number($("sku").value);
  return state.fabrics.find((f) => f.id === id) || null;
}

function showFabricSummary(reloadGrid) {
  const fabric = currentFabric();
  if (!fabric) {
    $("fabricHint").textContent = "Cada tecido tem as suas fotos e o seu modelo. Um novo nome começa do zero.";
    loadSampleGrid(null);
    updateTrainHint(null);
    return;
  }
  $("fabricHint").textContent = fabric.has_model
    ? `Tecido '${fabric.name}': ${fabric.sample_total} fotos e modelo próprio (${fabric.model_id}). Novos defeitos ou mais fotos entram no mesmo modelo ao treinar de novo.`
    : `Tecido '${fabric.name}': ${fabric.sample_total} fotos. Ainda sem modelo — treine só este tecido.`;
  if (!state.running) {
    renderCounts({ counts: fabric.counts });
  }
  if (reloadGrid || gridSkuId !== fabric.id) {
    loadSampleGrid(fabric.id);
  }
  updateTrainHint(fabric);
}

function defectTrainState(fabric) {
  const defects = (fabric?.counts || []).filter((item) => !item.is_good);
  const used = defects.filter((item) => Number(item.count) > 0);
  const weak = used.filter((item) => Number(item.count) < 4);
  const total = used.reduce((sum, item) => sum + Number(item.count), 0);
  return { used, weak, total };
}

function updateTrainHint(fabric) {
  const btn = $("trainBtn");
  if (!btn || lastTrainRunning) return;
  if (!fabric) {
    btn.disabled = true;
    $("trainMsg").textContent = "Escolha um tecido para treinar.";
    return;
  }
  const { used, weak, total } = defectTrainState(fabric);
  if (total < 4 || weak.length) {
    btn.disabled = true;
    const missing = weak.length
      ? weak.map((item) => `${item.label} (${item.count}/4)`).join(", ")
      : "4 fotos com caixa de um tipo de defeito";
    $("trainMsg").textContent =
      `Ainda não dá para treinar. Cada tipo de defeito precisa de pelo menos 4 fotos com quadrado. Falta: ${missing}.`;
    return;
  }
  btn.disabled = false;
  const types = used.map((item) => `${item.label}×${item.count}`).join(", ");
  $("trainMsg").textContent = fabric.has_model
    ? `Atualiza o modelo de '${fabric.name}' com TODAS as fotos deste tecido (${types}). O modelo atual serve de ponto de partida — os defeitos antigos não são apagados. Em produção continua um só ficheiro best.pt.`
    : `Primeiro treino de '${fabric.name}' com ${types}. Em produção este tecido usa um único modelo com todos os tipos gravados.`;
}

async function loadSampleGrid(skuId) {
  const grid = $("sampleGrid");
  if (!grid) return;
  gridSkuId = skuId;
  if (!skuId) {
    grid.innerHTML = "";
    return;
  }
  try {
    const samples = await api(`/api/samples?sku_id=${skuId}`);
    if (gridSkuId !== skuId) return;
    if (!samples.length) {
      grid.innerHTML = "<p class='hint'>Ainda não há fotos deste tecido.</p>";
      return;
    }
    grid.innerHTML = samples
      .map((item) => {
        const src = `/api/media/${encodeURI(item.image_path)}`;
        const label = item.class_label || item.class_slug || "";
        return `<figure>
          <button type="button" class="sample-del" data-delete-sample="${item.id}" title="Apagar esta foto" aria-label="Apagar foto ${label}">×</button>
          <img src="${src}" alt="${label}">
          <figcaption>${label}</figcaption>
        </figure>`;
      })
      .join("");
  } catch {
    grid.innerHTML = "<p class='hint'>Não foi possível listar as fotos deste tecido.</p>";
  }
}

async function deleteSample(sampleId) {
  if (lastTrainRunning) {
    $("trainMsg").textContent = "Espere o treino terminar antes de apagar fotos.";
    return;
  }
  const fabric = currentFabric();
  try {
    const result = await api(`/api/samples/${sampleId}`, { method: "DELETE" });
    if (Array.isArray(result.fabrics)) {
      state.fabrics = result.fabrics;
      fillFabricSelect(fabric?.id);
    } else if (fabric) {
      await refreshFabrics(fabric.id);
    }
    $("trainMsg").textContent = result.message;
  } catch (err) {
    $("trainMsg").textContent = err.message;
  }
}

$("sampleGrid")?.addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-delete-sample]");
  if (!btn) return;
  ev.preventDefault();
  const sampleId = Number(btn.getAttribute("data-delete-sample"));
  if (!sampleId) return;
  const label = btn.closest("figure")?.querySelector("figcaption")?.textContent || "esta foto";
  const ok = window.confirm(
    `Apagar só esta foto (${label})?\nDeixa de entrar no próximo treino. As outras fotos deste tecido ficam. O modelo actual só muda quando treinar de novo.`
  );
  if (!ok) return;
  deleteSample(sampleId);
});

async function refreshFabrics(selectedId) {
  let fabrics = [];
  try {
    const data = await api("/api/fabrics");
    fabrics = data.fabrics || [];
  } catch {
    const data = await api("/api/bootstrap");
    fabrics = data.fabrics || data.skus || [];
  }
  state.fabrics = fabrics;
  fillFabricSelect(selectedId || Number($("sku").value));
}

async function bootstrap() {
  const data = await api("/api/bootstrap");
  state.fabrics = data.fabrics || data.skus || [];
  fillFabricSelect(data.config?.sku_id);
  fillSelect(
    $("camera"),
    data.cameras,
    (c) => c.index,
    (c) => c.label,
    (data.cameras.find((c) => c.recommended) || data.cameras[0] || {}).index
  );
  fillSelect(
    $("defectClass"),
    data.classes.filter((c) => !c.is_good),
    (c) => c.slug,
    (c) => c.label
  );
  if (data.config.speed_m_per_min) $("speed").value = data.config.speed_m_per_min;
  if (data.config.fov_width_cm) $("fov").value = data.config.fov_width_cm;
  if (data.config.auto_good_sec) $("autoGood").value = data.config.auto_good_sec;
  setImageControls({
    exposure: Number(data.config?.camera_exposure ?? data.camera?.controls?.exposure ?? -2),
    gain: Number(data.config?.camera_gain ?? data.camera?.controls?.gain ?? 64),
    brightness: Number(data.config?.camera_brightness ?? data.camera?.controls?.brightness ?? 0),
    contrast: Number(data.config?.camera_contrast ?? data.camera?.controls?.contrast ?? 50),
    saturation: Number(data.config?.camera_saturation ?? data.camera?.controls?.saturation ?? 64),
  });
  state.running = Boolean(data.camera?.running);
  state.paused = Boolean(data.camera?.paused);
  syncActions();
  if (state.running && !state.paused) startLiveView();
}

async function poll() {
  try {
    const live = await api("/api/live");
    state.running = live.running;
    state.paused = live.paused;
    state.lastLive = live;
    const fabric = currentFabric();
    if (state.running && live.sku_id && fabric && Number(live.sku_id) === fabric.id) {
      renderCounts(live);
    } else if (fabric) {
      renderCounts({ counts: fabric.counts });
    }
    renderAlert(live);
    const train = live.train || {};
    if (lastTrainRunning && !train.running) {
      await refreshFabrics(train.sku_id || Number($("sku").value));
    }
    lastTrainRunning = Boolean(train.running);
    if (!state.drawing) {
      syncActions();
      paintOverlay();
    }
  } catch {
    /* servidor a arrancar */
  }
}

function stopLiveView() {
  if (liveTimer) {
    clearInterval(liveTimer);
    liveTimer = 0;
  }
}

async function pullFrame() {
  if (!state.running || pullingFrame) return;
  pullingFrame = true;
  try {
    const res = await fetch(`/api/frame?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok || res.status === 204) return;
    const blob = await res.blob();
    if (blob.size < 80) return;
    const url = URL.createObjectURL(blob);
    const prev = liveBlob;
    const img = $("live");
    img.onload = () => {
      if (prev) URL.revokeObjectURL(prev);
    };
    img.src = url;
    liveBlob = url;
  } catch {
    /* frame ainda não pronto */
  } finally {
    pullingFrame = false;
  }
}

function startLiveView() {
  stopLiveView();
  pullFrame();
  liveTimer = setInterval(pullFrame, 70);
}

$("startBtn").onclick = async () => {
  const fabric = currentFabric();
  if (!fabric) {
    $("captureMsg").textContent = state.mode === "production"
      ? "Não há tecido treinado. Em Captura, crie um nome, grave fotos e treine."
      : "Crie ou escolha um tecido primeiro.";
    return;
  }
  if (state.mode === "production" && !fabric.has_model) {
    $("captureMsg").textContent = `O tecido '${fabric.name}' ainda não tem modelo. Treine este tecido em Captura.`;
    return;
  }
  $("captureMsg").textContent = `A abrir a câmera para '${fabric.name}'...`;
  try {
    await api("/api/session/start", {
      method: "POST",
      body: JSON.stringify({
        sku_id: Number($("sku").value),
        camera_index: Number($("camera").value),
        speed_m_per_min: Number($("speed").value),
        fov_width_cm: Number($("fov").value),
        auto_good_sec: Number($("autoGood").value),
        mode: state.mode,
      }),
    });
    state.running = true;
    state.paused = false;
    state.box = null;
    startLiveView();
    $("captureMsg").textContent = state.mode === "production"
      ? `Produção em '${fabric.name}'. Só este modelo está ativo.`
      : `Captura em '${fabric.name}'. As fotos ficam só neste tecido.`;
    syncActions();
  } catch (err) {
    $("captureMsg").textContent = err.message;
  }
};

$("stopBtn").onclick = async () => {
  stopLiveView();
  await api("/api/session/stop", { method: "POST" });
  state.running = false;
  state.paused = false;
  state.box = null;
  $("live").removeAttribute("src");
  if (liveBlob) {
    URL.revokeObjectURL(liveBlob);
    liveBlob = "";
  }
  $("filmBlock").hidden = true;
  $("captureMsg").textContent = "Câmera desligada.";
  syncActions();
};

async function pause() {
  if (!state.running) {
    $("captureMsg").textContent = "Ligue a câmera primeiro.";
    return;
  }
  const data = await api("/api/pause", { method: "POST" });
  state.paused = true;
  state.box = null;
  stopLiveView();
  await pullFrame();
  const strip = $("filmstrip");
  $("filmBlock").hidden = false;
  strip.innerHTML = data.frames
    .map(
      (f) =>
        `<img data-index="${f.index}" class="${f.index === data.selected_index ? "active" : ""}" src="/api/buffer/${f.index}/thumb" alt="instante ${f.index}" />`
    )
    .join("");
  strip.querySelectorAll("img").forEach((img) => {
    img.onclick = async () => {
      strip.querySelectorAll("img").forEach((el) => el.classList.remove("active"));
      img.classList.add("active");
      await api("/api/buffer/select", {
        method: "POST",
        body: JSON.stringify({ index: Number(img.dataset.index) }),
      });
      state.box = null;
      await pullFrame();
      $("captureMsg").textContent = "Instante escolhido. Desenhe o quadrado na foto.";
      syncActions();
    };
  });
  $("captureMsg").textContent = "Imagem parada. Clique e arraste na foto para marcar o defeito.";
  syncActions();
}

$("pauseBtn").onclick = pause;
$("resumeBtn").onclick = async () => {
  await api("/api/resume", { method: "POST" });
  state.paused = false;
  state.box = null;
  $("filmBlock").hidden = true;
  startLiveView();
  $("captureMsg").textContent = "Vídeo retomado.";
  syncActions();
};

async function saveSample(classSlug, needBox) {
  if (!state.running) {
    $("captureMsg").textContent = "Ligue a câmera primeiro.";
    return;
  }
  if (needBox && !state.paused) {
    $("captureMsg").textContent = "Para gravar defeito, pause a imagem e desenhe o quadrado.";
    return;
  }
  const bbox = needBox ? toNormalizedBox() : null;
  if (needBox && (!bbox || bbox[2] < 0.005 || bbox[3] < 0.005)) {
    $("captureMsg").textContent = "Ainda não há quadrado. Clique e arraste na foto.";
    return;
  }
  try {
    const result = await api("/api/samples", {
      method: "POST",
      body: JSON.stringify({
        class_slug: classSlug,
        bbox,
        origin: state.paused ? "manual_pause" : "manual_live",
      }),
    });
    renderCounts({ counts: result.counts });
    const fabric = currentFabric();
    if (fabric) {
      await refreshFabrics(fabric.id);
      showFabricSummary(true);
    }
    $("captureMsg").textContent = needBox
      ? "Defeito gravado. Pode desenhar outro ou retomar o vídeo."
      : "Tecido bom gravado.";
    state.box = null;
    syncActions();
    paintOverlay();
  } catch (err) {
    $("captureMsg").textContent = err.message;
  }
}

$("goodBtn").onclick = () => saveSample("bom", false);
$("defectBtn").onclick = () => saveSample($("defectClass").value, true);

$("addSku").onclick = async () => {
  if (state.mode === "production") {
    $("captureMsg").textContent = "Em produção só se escolhe um tecido já treinado. Crie o nome em Captura / treino.";
    return;
  }
  const name = $("newSku").value.trim();
  if (!name) {
    $("captureMsg").textContent = "Escreva o nome do novo desenho/cor. A lista acima são os que já existem.";
    return;
  }
  try {
    const sku = await api("/api/skus", { method: "POST", body: JSON.stringify({ name }) });
    $("newSku").value = "";
    if (Array.isArray(sku.fabrics)) {
      state.fabrics = sku.fabrics;
      fillFabricSelect(sku.id);
    } else {
      await refreshFabrics(sku.id);
    }
    $("captureMsg").textContent = `'${sku.name}' criado e selecionado. Agora ligue a câmera, grave fotos deste tecido e treine.`;
    showFabricSummary();
  } catch (err) {
    $("captureMsg").textContent = err.message;
  }
};

$("sku").addEventListener("change", showFabricSummary);

$("trainBtn").onclick = async () => {
  const fabric = currentFabric();
  if (!fabric) {
    $("trainMsg").textContent = "Escolha o tecido a treinar.";
    return;
  }
  const { weak, total } = defectTrainState(fabric);
  if (total < 4 || weak.length) {
    updateTrainHint(fabric);
    return;
  }
  lastTrainRunning = true;
  $("trainMsg").textContent = `A treinar '${fabric.name}' com todas as fotos deste tecido...`;
  try {
    const status = await api("/api/train", {
      method: "POST",
      body: JSON.stringify({ sku_id: fabric.id }),
    });
    $("trainMsg").textContent = status.message;
    await refreshFabrics(fabric.id);
  } catch (err) {
    lastTrainRunning = false;
    $("trainMsg").textContent = err.message;
  }
};

$("resetTrainBtn").onclick = async () => {
  const fabric = currentFabric();
  if (!fabric) {
    $("trainMsg").textContent = "Escolha o tecido cujas fotos quer apagar.";
    return;
  }
  const ok = window.confirm(
    `Apagar todas as fotos e o modelo de '${fabric.name}'?\nO nome do tecido fica. Esta ação não tem volta.`
  );
  if (!ok) return;
  $("trainMsg").textContent = `A limpar '${fabric.name}'...`;
  try {
    const result = await api("/api/train/reset", {
      method: "POST",
      body: JSON.stringify({ sku_id: fabric.id }),
    });
    if (Array.isArray(result.fabrics)) {
      state.fabrics = result.fabrics;
      fillFabricSelect(fabric.id);
    } else {
      await refreshFabrics(fabric.id);
    }
    showFabricSummary(true);
    $("trainMsg").textContent = result.message;
  } catch (err) {
    $("trainMsg").textContent = err.message;
  }
};

window.addEventListener("keydown", (ev) => {
  if (ev.code !== "Space") return;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(ev.target.tagName)) return;
  ev.preventDefault();
  if (state.mode === "production") return;
  if (!state.paused) pause();
  else $("resumeBtn").click();
});

window.addEventListener("resize", paintOverlay);

$("modeCapture").onclick = async () => {
  if (state.running) {
    $("captureMsg").textContent = "Pare a câmera antes de mudar de modo.";
    return;
  }
  state.mode = "capture";
  await refreshFabrics(Number($("sku").value));
  syncActions();
};
$("modeProd").onclick = async () => {
  if (state.running) {
    $("captureMsg").textContent = "Pare a câmera antes de mudar de modo.";
    return;
  }
  state.mode = "production";
  await refreshFabrics(Number($("sku").value));
  syncActions();
};

const imageControlNames = ["exposure", "gain", "brightness", "contrast", "saturation"];

function getImageControls() {
  return Object.fromEntries(
    imageControlNames.map((name) => [name, Number($(`${name}Control`).value)])
  );
}

function setImageControls(controls) {
  imageControlNames.forEach((name) => {
    const value = Number(controls[name]);
    if (!Number.isFinite(value)) return;
    $(`${name}Control`).value = String(value);
    $(`${name}Value`).textContent = String(value);
  });
}

function onImageControlInput(ev) {
  const name = ev.target.id.replace("Control", "");
  $(`${name}Value`).textContent = ev.target.value;
  clearTimeout(imageControlTimer);
  imageControlTimer = setTimeout(async () => {
    try {
      const result = await api("/api/camera/controls", {
        method: "POST",
        body: JSON.stringify(getImageControls()),
      });
      setImageControls(result.controls);
    } catch (err) {
      $("captureMsg").textContent = err.message;
    }
  }, 120);
}

imageControlNames.forEach((name) => {
  $(`${name}Control`).addEventListener("input", onImageControlInput);
});

$("resetImageBtn").onclick = async () => {
  try {
    const result = await api("/api/camera/controls/reset", { method: "POST" });
    setImageControls(result.controls);
    $("captureMsg").textContent = "Imagem restaurada: pretos neutros, sem névoa cinza.";
  } catch (err) {
    $("captureMsg").textContent = err.message;
  }
};

bootstrap();
syncActions();
setInterval(poll, 800);
