# Arquitetura — iAuto Inspection (Visão_local_V1)

Mapa técnico da versão local. Para instalação e visão de produto, use o [README](./README.md).

## Visão geral

SPA React sem backend. Inferência, treino e UI acontecem no cliente. `App.jsx` só orquestra hooks e componentes; o estado de modelo/ROI vive em `useInspectionModels`, o classificador em `useTraining`, o overlay em `useInspectionCanvas`.

```
Câmera (getUserMedia)
    → <video> + <canvas> overlay (RAF)
    → recorte da ROI (pixels nativos do vídeo)
        → [detecção] MobileNetV2 embedding → KNN → OK/FALHA
        → [medição]  OpenCV (Otsu + maior contorno) → mm
    → inspeção salva no mock localStorage
```

## Camadas

### UI (`src/components`)

| Componente | Papel |
| --- | --- |
| `StartScreen` | Lista / cria modelos |
| `AppHeader` / `AppFooter` | Chrome e troca Setup ↔ Operador |
| `CameraStage` | Vídeo, canvas, overlay de barcode, badge global |
| `SetupSidebar` | Guia de treino (3 passos), threshold, histórico |
| `OperatorSidebar` | Status por ROI, salvar, histórico da sessão |
| `CalibrationSidebar` | Dois pontos + distância real em mm |
| `ModelNameModal` / `ModelTypeModal` | Nome e tipo (detecção vs. medição) |
| `ErrorScreen` / `SyncScreen` | Falha de câmera/IA e loading |

`InspectionHistory.jsx` permanece na raiz de `src/`: modal com os últimos 100 registros e export.

### Hooks (`src/hooks`)

| Hook | Responsabilidade |
| --- | --- |
| `useAiEngine` | Backend WebGL, scripts MobileNet + KNN, `classifier` / `mobilenetModel` |
| `useWebcam` | `getUserMedia`, lista de devices, restart ao trocar câmera |
| `useInspectionModels` | CRUD de modelos e ROIs, config em localStorage + mock |
| `useTraining` | Exemplos, fundo, loop de predição (~333 ms), reset de fotos |
| `useInspectionCanvas` | Loop RAF; desenha via `drawInspectionFrame` |
| `useRegionInteraction` | Arrastar / redimensionar ROI; cliques de calibração |
| `useInspectionHistory` | Fetch inicial + `saveToHistory` (snapshot JPEG) |
| `useSyncedRef` | Espelha state em ref para o RAF não ficar stale |

`useCalibration.js` (ainda na raiz de `src/`) guarda pontos A/B e o fator px/mm.

### Utilitários e serviços

| Arquivo | Função |
| --- | --- |
| `utils/videoMetrics.js` | Letterbox/pillarbox (`object-fit: contain`) → coords do vídeo |
| `utils/captureFrame.js` | Recorte JPEG da ROI e screenshot com overlays |
| `utils/drawInspectionFrame.js` | Calibração, cotas de metrologia, caixas das ROIs |
| `utils/inspectionLabels.js` | Label `Modelo::regionId` |
| `utils/datasetTensors.js` | Serializar / desserializar dataset do KNN |
| `services/MeasurementService.js` | `processMeasurement`, `calculateDistance` |

### Bibliotecas em `public/libs`

Carregadas como script global (não via npm), com nomes `iauto-*`:

- `iauto-inference-engine.js` — MobileNet TF.js (Google, Apache-2.0). Boot: `window.mobilenet.load({ version: 2, alpha: 1.0 })`
- `iauto-cluster-module.js` — `window.knnClassifier.create()`
- `iauto-vision-core.js` — OpenCV.js, async no `index.html`

## Fluxo de detecção

1. ROI em coordenadas intrínsecas do vídeo (`box.x/y/w/h`).
2. `tf.browser.fromPixels` + `slice` + `mobilenet.infer(crop, true)`.
3. Treino: `addExample` com label `NomeModelo::id`; fundo usa o label literal `background`.
4. Predição (só com barcode e modo operador): `predictClass`; **OK** se o label bate e a confiança ≥ threshold.
5. Peça aprovada se **todas** as regiões estão `ok`.

O overlay do canvas lê só **refs** (não state) para não congelar o RAF.

## Fluxo de metrologia

1. Calibração: dois cliques + mm reais → `scaleFactor` (px/mm), persistido globalmente.
2. No operador, a cada 10 frames: blur → Otsu → maior contorno (área > 50) → `minAreaRect`.
3. 1 ponto válido: desenha L × A em mm. 2+ pontos: distância entre centroides.

`MetrologyProvider` faz polling em `window.cv`; `MeasurementService` falha silencioso se OpenCV ainda não carregou.

## Persistência

```
localStorage.supabase_mock_store
    models[]
    inspections[]
    training_samples[]     # metadados; storage.remove é no-op

localStorage.modelData:{nome}
    type, regions, backgroundSamples

localStorage.smart_inspector_scale_factor
    número (px/mm) — um só para todos os modelos

RAM (src/db.js → inMemoryImages)
    JPEG de treino por modelo/label — perdido no reload
```

O mock emula `select/order/limit/eq/neq/insert/update/delete`. Uploads de storage não persistem arquivo.

## Módulo de tecido (`fabric/`)

Serviço Python separado (não usa TF.js/KNN). Webcam via OpenCV, SQLite em `fabric/data/fabric.sqlite`, UI em `http://127.0.0.1:8765`. Ver [fabric/README.md](./fabric/README.md).

Cada tecido (SKU) tem nome único, fotos em `fabric/data/samples/{tecido}/` e pesos em `fabric/data/models/{tecido}/best.pt`. Treino e produção usam só esse tecido: o export YOLO filtra por `sku_id` e o detector recusa pesos de outro nome.

## Segurança e build

- Trava de hostname em `src/main.jsx` (ver README).
- `vite.config.js`: `vite-plugin-javascript-obfuscator` (control-flow, dead code, self-defending) + Terser sem console/sourcemap.

## Limitações conhecidas desta versão

- Fotos de treino não sobrevivem ao F5 (`db.js` não é IndexedDB, apesar do nome histórico da API).
- Escala de metrologia é global, não por modelo.
- Evidências em base64 no `localStorage` podem estourar quota.
- Sem testes automatizados.
- `src/temp_db_snippet.js` e `scripts/db.js` são residual; não entram no bundle da UI.

## Convenção de labels

- Objeto: `{nomeDoModelo}::{regionId}` — evita colisão entre modelos.
- Fundo: `background` (sem prefixo). O isolamento entre modelos depende de `clearAllClasses` + filtro `getImagesByModel`.
