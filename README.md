# iAuto Inspection

Sistema de inspeção industrial por visão computacional, da **iAutomotivo** (Daniel Miranda). Roda inteiro no navegador: câmera, treino da IA, inspeção OK/FALHA e medições em milímetros.

Esta pasta (`Visão_local_V1`) é a **versão local / offline** (UI v2.7 Stable). Pacote npm: `smart-inspector`.

## O que faz

O operador escolhe um **modelo de inspeção** (ex.: um veículo), posiciona regiões na imagem da câmera e treina a IA com poucas fotos. Na linha, lê um **código de barras**; cada região vira OK ou FALHA. Se todas passam, a peça é **APROVADO**.

Dois tipos de projeto:

| Tipo | Uso |
| --- | --- |
| **Detecção** | Transfer learning: MobileNetV2 extrai o embedding do recorte; um KNN classifica peça vs. fundo. Threshold padrão 85%. A UI pede 5 fotos aprovadas + 5 de fundo (teto de 20 por objeto). |
| **Medição** | OpenCV.js no ROI: maior contorno, centroide e retângulo rotacionado, convertidos para mm após calibração (2 pontos + distância real). |

Três telas:

- **Setup** — câmera, ROIs, treino, threshold, histórico, atalho de calibração
- **Operador** — barcode, inferência ~3 FPS, badge APROVADO/FALHA, salvar evidência
- **Calibração** — só metrologia: dois pontos na imagem + distância em mm

## Stack

| Camada | Tecnologia |
| --- | --- |
| UI | React 18, Vite 4, Tailwind CSS, Lucide |
| IA | TensorFlow.js, MobileNetV2, KNN (`public/libs`) |
| Visão / metrologia | OpenCV.js (`iauto-vision-core.js`, ~10 MB) |
| Relatórios | jsPDF, SheetJS (CSV / Excel / PDF) |
| Persistência **desta versão** | `localStorage` (modelos e inspeções) + RAM (fotos de treino) |

Não há cliente Supabase real neste checkout. `src/supabase.js` é um **mock** com a mesma API (`from`, `select`, `insert`…) sobre `localStorage`. `postgres` e `dotenv` no `package.json` são residual de uma versão cloud.

## Persistência (importante)

| Dado | Onde | Sobrevive ao F5? |
| --- | --- | --- |
| Modelos, inspeções, samples (metadados) | `localStorage` → `supabase_mock_store` | Sim |
| Config do modelo (ROIs, tipo) | `localStorage` → `modelData:Nome` | Sim |
| Escala px/mm | `localStorage` → `smart_inspector_scale_factor` (**global**, não por modelo) | Sim |
| Fotos de treino (JPEG) | Array em memória (`src/db.js`) | **Não** — retreinar após recarregar |
| Evidência da inspeção | JPEG em base64 no histórico local | Sim, até estourar a quota do browser |

Schema lógico que o app espera (mesmo no mock):

- `models` — `id`, `name`, `config` (`type`, `regions`, `backgroundSamples`)
- `inspections` — `barcode`, `model_name`, `status`, `image_url`, `details[]`
- `training_samples` — `model_id`, `label`, `image_path` (o storage do mock é no-op)

## Como rodar

Repositório: [github.com/danielmirandajack/iAuto_Inpection](https://github.com/danielmirandajack/iAuto_Inpection)

```bash
npm install
npm run dev
```

Build de produção (ofuscação + minify, sem sourcemap):

```bash
npm run build
npm run preview
```

Não é necessário `.env`. O README antigo pedia `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`; esta versão local **não lê** essas variáveis.

## Estrutura

```
src/
  App.jsx                 Orquestrador (câmera + IA + UI)
  InspectionHistory.jsx   Modal de auditoria e export CSV/Excel/PDF
  supabase.js             Mock localStorage
  db.js                   Imagens de treino em memória
  useCalibration.js       Pontos A/B → fator px/mm
  MetrologyContext.jsx    Polling até OpenCV (`window.cv`) ficar pronto
  components/             Telas e sidebars
  hooks/                  Câmera, modelos, treino, canvas, histórico
  utils/                  Recorte, overlay, labels, tensores
  services/MeasurementService.js   Contorno OpenCV + distância
public/libs/
  iauto-inference-engine.js   MobileNet (TF.js)
  iauto-cluster-module.js     KNN classifier
  iauto-vision-core.js        OpenCV.js
```

Detalhe dos módulos: ver [ARCHITECTURE.md](./ARCHITECTURE.md).

## Fluxo resumido

1. Criar ou abrir um modelo (detecção ou medição).
2. No setup, posicionar ROIs e gravar peças aprovadas + fundo.
3. Ir para produção, ler o código de barras.
4. Inferência contínua; **SALVAR & PRÓXIMO** grava evidência e status.

Detecção: recorte da ROI → `mobilenet.infer` → KNN → label `NomeModelo::regionId` vs. `background`, comparado ao threshold.

Medição: a cada 10 frames, maior contorno no ROI. Um objeto: L × A em mm. Dois ou mais: distância entre centroides.

## Licença

Uso restrito. Todos os direitos reservados a Daniel Miranda Jack / iAutomotivo.
