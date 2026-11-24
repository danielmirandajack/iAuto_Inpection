# iAuto Inspection — módulo de tecido (local)

Inspeção contínua de tecido no Zenbook, **100% local**: webcam FHD, SQLite e JPEG no disco. Sem nuvem.

Não substitui o app React de peça parada (`src/`). Este serviço é independente.

## Como correr

```powershell
cd fabric
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Abra `http://127.0.0.1:8765`.

## Um modelo por tecido

Cada tecido tem um **nome único**. As fotos e o ficheiro `best.pt` pertencem só a esse nome.

1. Em **Captura / treino**, crie o tecido (ex: `brim-azul`).
2. Grave tecido bom e defeitos **com esse nome selecionado**.
3. Clique **Treinar modelo** — o treino usa só as fotos desse tecido.
4. Em **Produção**, escolha o mesmo nome. O sistema carrega apenas `data/models/{nome}/best.pt`.

Um tecido novo começa do zero: não herda fotos nem pesos de outro desenho.

## Uso do piloto

1. Coloque uma luminária LED no tecido e aproxime a webcam (10–20 cm de largura visível).
2. Velocidade inicial: **0,5–1,5 m/min**.
3. Escolha ou crie o **tecido**, depois **Ligar câmera**.
4. Quando aparecer um defeito, **pare o tecido** e pressione **Espaço** (pausar).
5. Escolha o frame mais nítido na tira inferior.
6. **Tecido bom** ou desenhe uma caixa e **Gravar defeito**.
7. Retome. Os ficheiros ficam em `fabric/data/` (SQLite + imagens).

O treino **não** corre a cada foto. Quando houver várias amostras de defeito com caixa, clique **Treinar modelo**.

Treino (opcional, pesado neste notebook):

```powershell
pip install -r requirements-train.txt
```

## Dados

| Item | Local |
| --- | --- |
| Banco | `data/fabric.sqlite` |
| Fotos | `data/samples/{sku}/{classe}/` |
| Dataset YOLO exportado | `data/yolo/{sku}/` |
| Pesos | `data/models/{sku}/best.pt` |

Nada disto sai do computador.
