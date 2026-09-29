# GLYPHOS Phase 4: research and decision report

*Photo/video studio: background removal and matting, point-prompted selection, video tracking, video editing that keeps the audio, mask editor, dithering.*

Date: 2026-09-28. The repository was read and not modified (`package.json`, `vercel.json`, `src/studio/exporting.ts`, `src/studio/media.ts`, `src/engine/fonts.ts`).

Sources for every claim are listed in section 9. Licences, file sizes and ONNX I/O signatures were read from the model cards, the Hugging Face API (`/api/models/<id>?blobs=true`), the repository LICENSE files, the npm registry, and the ONNX graphs themselves (inspected with the `onnx` Python package).

## How the timings were obtained

- **WASM figures were measured by me (M).** Setup: `onnxruntime-web@1.30.0`, WASM execution provider, Node 22, on a 4-vCPU Xeon at 2.1 GHz. This is the same WASM binary a browser uses. Each figure is the steady state after a warm-up run (the first run is 1.5–2.5× slower). RSS is the resident memory of the process.
- **WebGPU figures were not measured.** The sandbox has no GPU. They are quoted from the source named next to each one (R = reported).

---

## 0. TL;DR

| Need | Pick | Code licence / weights licence | Download | Runs |
|---|---|---|---|---|
| Automatic cutout, default | **BiRefNet_lite at 512²** (`studioludens/birefnet-lite-512`) | MIT / MIT | fp16 98.5 MB (WebGPU), fp32 191.9 MB (WASM) | WebGPU ≈0.85 s (R). WASM 4 threads 3.5–4.2 s (M), 1 thread ≈11 s (M) |
| Cutout, high-quality (HQ) path | **BiRefNet_lite at 1024², graph patched for WebGPU** (`jiabins0303/birefnet-lite-1024-webgpu`) | MIT / MIT | fp16 114.8 MB | WebGPU only: 3.4–5.3 s (R). WASM fails with `std::bad_alloc` (M) |
| Hair edges, all paths | Guided-filter upsampling of the matte plus blur-fusion foreground-colour estimation, written as our own WebGL2 shader | own code | 0 | GPU, a few ms |
| Click to select (photo) | **EdgeTAM**, image graphs (`onnx-community/EdgeTAM-ONNX`) | Apache-2.0 / Apache-2.0 | encoder 9.7 MB fp16 or 19.5 MB fp32 (4.9 MB uint8). Decoder 10.5 MB fp16 or 21 MB fp32 | WASM 4 threads: encoder 0.8–1.1 s, decoder 0.12 s per click (M) |
| Video tracking with SAM 2 memory | WebGPU only. Candidate: `diffusionstudio/sam2.1-tiny-video-onnx-fp16` (512², 83 MB, 0.25 s/frame on an M1 (R)); benchmark `jax-image-tools/edgetam-video-onnx` (65 MB) against it | Apache-2.0 / Apache-2.0 (community exports) | 65–83 MB | WASM is not viable: 7.5–11 s per frame (M, EdgeTAM video graphs) |
| Tracking fallback (no WebGPU) | Keyframed SAM decodes seeded from the previous mask (box plus points), optical-flow warping in WebGL2 in between, signed-distance-field (SDF) interpolation, user corrections become keyframes | own code | reuses EdgeTAM | about 1 s per keyframe on WASM |
| ML runtime | **`onnxruntime-web` 1.30.x used directly** (not transformers.js), in one module Worker | MIT | JS 39 KB gz plus one WASM binary of 6.6 MB gz | WebGPU EP with the WASM EP as fallback |
| Export with the original audio | **mediabunny `Conversion` with `composable: true`**: video discarded, audio packets copied; our `CanvasSource` supplies the video | MPL-2.0 | already a dependency (^1.60) | main thread (as today) |
| Mask editor | **Custom Pointer Events + Canvas2D/WebGL2** (no Konva) | own code | 0 KB vs ≈104 KB gz for react-konva + Konva | main thread |
| Headers | CSP `script-src 'self' 'wasm-unsafe-eval'`. COOP `same-origin` + COEP `require-corp` on the studio routes. Self-host models under `/models/<sha>/` so `connect-src` stays unchanged | | | |

**Do not use** any of the following. Each is either non-commercial or copyleft on the weights:

- `briaai/RMBG-1.4`: the BRIA licence is non-commercial.
- `briaai/RMBG-2.0`: CC BY-NC 4.0. **It is rembg's current default** (`bria-rmbg`).
- `onnx-community/ISNet-ONNX`: AGPL-3.0.
- `@imgly/background-removal`: AGPL, or a commercial licence.
- `facebook/sam3`: custom "SAM License" and gated.

Many transformers.js tutorials use RMBG-1.4. Do not copy them.

---

## 1. Background removal and matting

### 1.1 Candidates (code licence and weights licence listed separately)

| Model | Code licence | Weights licence | Weights on disk | Input | ONNX export (where) | Browser | WASM, 4 threads (M) | WebGPU (R) | Hair/fur edges |
|---|---|---|---|---|---|---|---|---|---|
| **BiRefNet (general, Swin-L)** | MIT (`ZhengPeng7/BiRefNet`) | MIT (HF card `license: mit`) | safetensors 444.5 MB. ONNX fp32 972.7 MB / fp16 489.7 MB (`onnx-community/BiRefNet-ONNX`). GitHub release `v1`: 928 MB | 1024² | yes: GitHub release v1, onnx-community | too big. `nuki` reports WebGPU buffer overflow and a WASM OOM | not run (OOM class) | n/a | very good |
| **BiRefNet_lite (Swin-T)** | MIT | MIT | safetensors 177.6 MB. ONNX fp32 224.0 / fp16 114.5 MB (`onnx-community/BiRefNet_lite-ONNX`). Release `…swin_v1_tiny…onnx` 214 MB | 1024² | yes | **the upstream 1024 ONNX does not run in browsers**: WASM `std::bad_alloc` (M, reproduced); WebGPU fails (`studioludens`) | **OOM** | n/a | good |
| BiRefNet_lite at 512² (`studioludens/birefnet-lite-512`) | MIT (third-party re-export) | MIT | fp32 191.9 MB, fp16 98.5 MB | 512² | yes (PyTorch 2.0.1 plus Kazuhito00's patched `deform_conv2d` exporter) | yes: transformers.js or ORT-web, WebGPU and WASM | fp32 **3.5–4.2 s** (1 thread 11.2 s). fp16 on WASM 9–11 s (fp16 on CPU is 2.5× slower). RSS ≈2.6–2.9 GB | **0.85 s** (jiabins card) | fair: 512² loses fine strands |
| BiRefNet_lite at 1024², WebGPU-patched (`jiabins0303/birefnet-lite-1024-webgpu`) | MIT (graph surgery) | MIT | fp16 114.8 MB | 1024² | yes. Upstream graph rewritten: 59 `Split` nodes with 32 outputs each, and 80 `GatherND` (deform-conv emulation) made WebGPU-runnable | **WebGPU only** (needs `maxStorageBuffersPerShaderStage ≥ 8`) | `std::bad_alloc` (M) | **3.4 s** (jiabins); 5.3 s on an Apple M-series in Chrome 140 (nuki) | better. The card reports "+45 % edge gradient" over 512 and states its own caveats |
| **BiRefNet_lite-matting** | MIT | MIT (HF `license: mit`) | safetensors **89.0 MB**; release `.pth` 84.8 MB | trained on matting sets | **no ONNX published** (checked the HF search and the GitHub release assets). Needs our own export (same recipe as studioludens and jiabins) | unknown until exported | n/a | n/a | should be the best edges among the "lite" models (trained on P3M-10k, AM-2k, AIM-500, Distinctions-646, HIM2K, PPM-100). Card metrics on TE-P3M-500-NP: S .978, MSE .003 |
| BiRefNet_HR / HR-matting / dynamic / dynamic-matting | MIT | MIT | 444.5 MB each (Swin-L); HR ONNX 1.02 GB | 2048² or dynamic | HR ONNX in the GitHub release | no (size) | n/a | n/a | best, server-class only |
| **BEN2 Base** (PramaLLC) | MIT (GitHub LICENSE) | MIT (HF card) | `BEN2_Base.onnx` 222.9 MB; `onnx-community/BEN2-ONNX` fp16 219.1 MB | 1024² | yes (official and onnx-community) | transformers.js card exists; WebGPU not verified | **33–38 s**, RSS ≈4.3 GB (M) | not found | strong (refiner "CGM" targets hair); too heavy for the browser |
| **MODNet** (portrait matting) | Apache-2.0 | Apache-2.0 (README: "code, models, and demos … Apache License 2.0") | `Xenova/modnet`: fp32 25.9, fp16 13.0, uint8 6.6, q4f16 11.8 MB | shortest edge 512, multiple of 32 | yes (`Xenova/modnet`, transformers.js default for `background-removal`) | yes, WebGPU and WASM | 512²: 0.62–0.75 s (1 thread 1.7 s); uint8 0.48–0.66 s; 1024²: 2.6–2.75 s. RSS ≈0.43 GB (M) | real-time at 256 in the transformers.js video demo; 1.7 s at 640×480 (nuki) | good on **people only**; fails on objects and pets |
| RMBG-1.4 (BRIA) | n/a | **bria-rmbg-1.4: "source-available … non-commercial use"**, commercial licence sold separately | 176.2 / 88.2 / 44.4 MB | 1024² | yes | yes | n/a | 0.6 s (nuki) | good. **Excluded (licence)** |
| RMBG-2.0 (BRIA) | n/a | **CC BY-NC 4.0**, gated | 884.9 MB; ONNX 1024 MB fp32 / 513.6 fp16 / 233.8 q4f16 | 1024² | yes | heavy | n/a | n/a | very good. **Excluded (licence)** |
| InSPyReNet / transparent-background | MIT / MIT | weights on Google Drive/OneDrive via the MIT repo. Trained on DUTS/HRSOD/UHRSD/DIS5K | Swin-B or Res2Net50 `.pth` | 384² (fast), 1024² (base) | no official ONNX | no maintained browser build | n/a | n/a | good. Not a practical browser option |
| withoutBG "Open Weights" | Apache-2.0 (`withoutbg/withoutbg`) | **withoutBG Open Model License**: Apache-2.0 for their parts **plus the Meta DINOv3 licence for the backbone** | 454.5 MB ONNX | n/a | yes | no (size). Its cloud mode uploads images (against GLYPHOS's local-only promise) | n/a | n/a | good. Excluded (size, mixed licence) |
| ISNet ONNX (`onnx-community/ISNet-ONNX`, the IMG.LY family) | n/a | **AGPL-3.0** | 176 / 88 / 44 MB | 1024² | yes | yes | n/a | 0.65 s (nuki) | good. **Excluded (AGPL)** |

**Training-data caveat (legal review item, not a blocker).** The DIS5K terms (read: `DIS5K-Dataset-Terms-of-Use.pdf`) say the dataset is "available for non-commercial use in research or educational purpose" and that "commercial use of this dataset is prohibited even after … processing". The following models list DIS5K in their training data: BiRefNet general and lite, BEN2 ("trained on the DIS5k and our 22K proprietary"), and ISNet. The weights themselves carry an explicit MIT or Apache grant from their authors, but that grant cannot settle the terms attached to the training data. The jiabins card raises the same point. Several matting datasets are also distributed for research use. The owner should accept this residual risk explicitly. It applies equally to every open cutout model worth using.

### 1.2 rembg and the models it loads

rembg itself is **MIT** (`LICENSE.txt`). It is a Python CLI and library, so it is useful only as a catalogue of models, not as a browser dependency. File sizes come from its GitHub release `v0.0.0`.

| rembg model | Source | Weights licence | Size | Commercial use? |
|---|---|---|---|---|
| `u2net`, `u2netp`, `u2net_human_seg` | xuebinqin/U-2-Net | Apache-2.0 (repo) | 168 MB / 4.36 MB / 168 MB | OK. Training-data provenance is not stated |
| `u2net_cloth_seg` | levindabhi/cloth-segmentation | MIT (repo) | 168 MB | OK by licence. Trained on iMaterialist; check the data terms |
| `silueta` | a reduced u2net from U-2-Net **issue #295** | **no explicit licence** (derived from Apache u2net) | 42.1 MB | unclear, so avoid |
| `isnet-general-use` | xuebinqin/DIS | Apache-2.0 (code); trained on DIS5K (**non-commercial dataset terms**) | 170 MB | licence OK, data caveat |
| `isnet-anime` | SkyTNT/anime-segmentation | Apache-2.0 | 168 MB | OK |
| `sam` (vit_b encoder/decoder, quantized) | facebookresearch/segment-anything | Apache-2.0 | 95.2 + 8.34 MB | OK |
| `birefnet-general`, `-general-lite`, `-portrait`, `-dis`, `-hrsod`, `-cod`, `-massive` | ZhengPeng7/BiRefNet | MIT | 928 MB each; lite 214 MB | OK (DIS5K caveat) |
| **`bria-rmbg` (RMBG-2.0), the rembg DEFAULT** | briaai/RMBG-2.0 | **CC BY-NC 4.0**; the rembg README itself says it "requires a paid agreement for commercial use" | 977 MB | **NO. This is the accidental-use trap** |
| `withoutbg` | cloud API | n/a (uploads images) | n/a | not local |
| ViTMatte option (`-vm`) | hustvl/ViTMatte, MIT; HF weights apache-2.0 | trained on Composition-1k / Distinctions-646 (research datasets) | 109–379 MB | licence OK, data caveat |

### 1.3 Recommendation: background removal

1. **Default: BiRefNet_lite at 512².** It is general-purpose, so it handles objects and pets, which MODNet cannot. The code and weights are MIT, and it is the only general model already proven to run on both WebGPU and WASM.
   - Ship `model_fp16.onnx` (98.5 MB) to WebGPU devices.
   - On WASM, fp16 is 2.5× slower (M), so desktop WASM needs the fp32 file (191.9 MB, 3.5–4.2 s with 4 threads). An alternative is a self-made int8 quantization; test its quality before shipping.
   - On phones without WebGPU, do not load BiRefNet. The WASM run peaks at ≈2.6–2.9 GB (M). Offer click-to-select (EdgeTAM, section 2) plus refinement instead.
2. **HQ path, desktop with WebGPU only: `jiabins0303/birefnet-lite-1024-webgpu` `onnx/model_fp16.onnx`.**
   - Size 114.8 MB, sha256 `4059896039dfccb0f15b9080ff06d11d90e499449bb045e797055eb8901cf5f4` (from the card).
   - It takes 3.4–5.3 s per image and gives the best hair and fur edges of any MIT model that runs in a browser today.
   - **Follow-up task:** export `ZhengPeng7/BiRefNet_lite-matting` with the same recipe: PyTorch 2.0.1 + Kazuhito00's `deform-conv2d-onnx-exporter`, then jiabins' `patch_split.py` and `patch_deform.py`. Compare it with the HQ model on a hair/fur test set. If it wins, swap it in; it has the same architecture and a similar size.
3. **Always post-process the matte in WebGL2.** This is cheap and gives most of the visible edge quality:
   - (a) Upsample the 512² or 1024² logits to full resolution with a **guided filter**, using the image as the guide.
   - (b) Estimate the **foreground colour** with "Approximate Fast Foreground Colour Estimation" (blur-fusion, ICIP 2021; the README says it takes about 11 lines of Python). This removes background colour bleeding into hair.
   - Write both ourselves; neither needs a dependency.
4. **Video background removal:** use per-frame BiRefNet-512 on WebGPU as an offline export job (≈0.85 s/frame). Smooth the alpha over time with a flow-compensated exponential moving average (EMA). MODNet (13 MB fp16) is an optional "live portrait preview" for people, since it runs in real time at 256.

### 1.4 Where to host the models

**Facts:**
- GitHub **blocks files over 100 MiB** and warns above 50 MiB, so models cannot go into Git without LFS. Vercel can pull LFS if it is enabled in the project settings.
- Vercel limits: "Static File uploads" is 100 MB on Hobby and 1 GB on Pro, and applies to CLI source uploads. Fast Data Transfer is 100 GB/month on Hobby; Pro has a Flat Rate CDN. **Hobby is non-commercial only.**
- Vercel's CDN "cacheable response criteria" include "doesn't exceed 10MB in content length". The docs state this for server responses, while static files are "automatically cached … for the lifetime of the deployment".
- Hugging Face `resolve/` URLs return a 302 to `us.aws.cdn.hf.co` (xet bridge), with `access-control-allow-origin: *` on the file and `cache-control: no-store` on the redirect. I checked this with curl.

**Decision: self-host same-origin.**
- A build step (`scripts/fetch-models.mjs`) downloads each file from a **pinned HF commit** (`resolve/<sha>/…`), checks its sha256, and writes it to `dist/models/<name>.<sha8>.onnx`. Nothing large enters Git.
- Serve these with `Cache-Control: public, max-age=31536000, immutable`.
- In the client, store the downloaded bytes in Cache Storage (or the origin private file system, OPFS) under the sha, and call `navigator.storage.persist()`.
- Why self-host:
  - `connect-src` stays unchanged.
  - The "everything local" story stays clean (no third-party requests).
  - We control the exact bytes. This matters because most of these exports are single-maintainer community repositories, some only weeks old.
- **Verify on a preview deployment** that a ≈100 MB `.onnx` returns `x-vercel-cache: HIT`. If it does not, split each model into ≤10 MB chunks, fetch them in parallel and concatenate them in the worker.
- **Fallback** (Hobby plan, or bandwidth pressure): mirror the files into a GLYPHOS-owned Hugging Face repo, pinned by commit, and add `https://huggingface.co https://*.hf.co` to `connect-src`.

---

## 2. Point-prompted segmentation and video tracking

### 2.1 Candidates

| Model | Code licence | Weights licence | ONNX (where): encoder / decoder sizes | Input | Browser support | WASM, 4 threads (M) | WebGPU (R) | Notes |
|---|---|---|---|---|---|---|---|---|
| **EdgeTAM** | Apache-2.0 | Apache-2.0 (README: "model checkpoints and code") | `onnx-community/EdgeTAM-ONNX`. **Encoder** fp32 19.5 / fp16 9.7 / int8 4.9 MB. **Decoder** fp32 21.0 / fp16 10.5 / int8 8.7 / q4f16 4.6 MB. Full `.pt` 56 MB | 1024² | transformers.js `EdgeTamModel` (image only); ORT-web | **encoder 0.82–1.08 s** (1 thread 2.6–2.7 s; uint8 0.77–0.83 s), RSS 0.45 GB. **Decoder 0.12 s** | no browser number. Native: 16 FPS video / 40 FPS image on an iPhone 15 Pro Max | 22× faster than SAM 2 (README). Quality below SAM 2.1: SA-23 1-click mIoU 55.5 vs 61.9; SA-V val J&F 72.3 vs 76.8 (B+) |
| **SAM 2.1 hiera-tiny** | Apache-2.0 | Apache-2.0 | `onnx-community/sam2.1-hiera-tiny-ONNX`. Encoder fp32 134.1 / fp16 67.0 / int8 52.6 / q4f16 28.5 MB. Decoder as EdgeTAM (21.0 / 10.5 / 8.7 / 4.6) | 1024² | transformers.js `Sam2Model` (image only); ORT-web | encoder **5.3 s**, RSS 1.3 GB; decoder 0.09 s | full video loop 1.3 s/frame at 1024 fp16, 0.25 s at 512 (M1) | 38.9 M params; 91 FPS on A100 (README) |
| SAM 2.1 hiera-small | Apache-2.0 | Apache-2.0 | encoder fp32 162.5 / fp16 81.2 / int8 59.7 / q4f16 32.5 MB; same decoder | 1024² | same | not run (slower than tiny) | n/a | 46 M params |
| SAM 3 tracker | "SAM License" (custom) | **custom, gated** (`facebook/sam3`: `license: other`, gated manual) | encoder fp32 1869 / fp16 934.7 / q4f16 295.6 MB | n/a | transformers.js `Sam3TrackerModel` | n/a | n/a | **Excluded** (licence, size) |
| **SlimSAM-77** | Apache-2.0 | Apache-2.0 | `Xenova/slimsam-77-uniform`: encoder 23.3 / fp16 12.2 / q 8.9 MB; decoder 16.6 / 8.6 / 4.9 MB | 1024² | transformers.js `SamModel` | encoder 3.0–3.3 s (q 2.6–2.8 s), **RSS 2.1 GB** | n/a | SAM-1 decoder; no video |
| EfficientSAM (ti / s) | Apache-2.0 | Apache-2.0 (weights in the repo) | HF Space `yunyangx/EfficientSAM`: ti encoder 24.8 + decoder 16.6 MB; s encoder 89.6 MB | 1024² | ORT-web (no transformers.js class) | not run | n/a | no video |
| MobileSAM | Apache-2.0 | Apache-2.0 (HF mirror tagged MIT) | `mobile_sam.pt` 40.7 MB. Encoder ONNX in the rembg release: 26.9 MB (quant 10.5 MB). SAM-1 decoder | 1024² | ORT-web | not run | n/a | 8 ms encoder on GPU (README); no video |

**The exported decoders take no mask prompt.** The image decoders published for transformers.js (EdgeTAM and SAM 2.1) have these inputs: `input_points`, `input_labels`, `input_boxes`, `image_embeddings.{0,1,2}`. They have no `mask_input` (I inspected the graphs). Tracking by feeding the previous mask back in as a prompt is therefore not possible with these files. Seed each frame with a box and points instead.

### 2.2 Is SAM 2 memory-attention tracking possible in the browser today?

- **transformers.js 4.3: no.** `Sam2Model`, `EdgeTamModel` and `Sam3TrackerModel` only run `vision_encoder` and then `prompt_encoder_mask_decoder`. `Sam2VideoProcessor` is an empty subclass (I read the 4.3.0 dist).
- **With WebGPU and community exports: yes.** Three exports include the memory graphs:
  - `square-zero-labs/sam2.1-tiny-video-onnx`: fp32 at 1024. vision 134 + memory-attention 32 + decoder 17.8 + memory-encoder 5.6 MB. Validated against `propagate_in_video_iterator` (worst per-frame IoU 0.9967).
  - `diffusionstudio/sam2.1-tiny-video-onnx-fp16`: 512², fp16. 58.4 + 13.0 + 8.9 + 2.8 MB = **83 MB**. Reports **0.25 s per tracked frame on an M1 with ORT-web 1.30 WebGPU** (1.3 s at 1024). Used in Diffusion Studio's mask tool.
  - `jax-image-tools/edgetam-video-onnx`: fp32 at 1024. 19.8 + 17.8 + 20.9 + 6.7 = **65 MB**. Gated against PyTorch (worst IoU 1.000). No browser timing is published.
  - All three are Apache-2.0 (inherited). The memory bank itself is assembled in JS; each card documents the layout.
- **On WASM: not viable.** EdgeTAM video graphs, 4 threads (M), per frame:
  - vision encoder 2.3–2.6 s (this export also emits large positional encodings; these are constant and could be cached or removed),
  - memory_attention 3.1–5.4 s (7 memories × 512 tokens + 64 pointer tokens),
  - mask decoder 0.27–0.33 s,
  - memory_encoder 1.7–2.5 s.
  - Total **≈7.5–11 s per frame**, which is 40+ minutes for 10 s of 30 fps video.
- **Risk:** these exports are weeks or months old, have a single maintainer and near-zero downloads. The SAM 2 encoder ONNX is also fragile in ORT-web: `perceptuality/sam2.1-tiny-video-ort` documents a shape-inference failure that is only fixed by converting to the `.ort` format. Pin them, self-host them, and add an integration test.

### 2.3 Pragmatic tracking design (works everywhere; memory tracking is an upgrade)

1. **Seed:** the user clicks positive and negative points on frame *k*. Run the EdgeTAM encoder once and the decoder once per click (0.12 s WASM). The result is the mask M_k.
2. **Propagate, keyframed:** every *N* frames (default 5; lower for fast motion) run a SAM decode on frame t. Seed it from the previous mask:
   - the **box** of M_{t−1} expanded by 10–20 %,
   - 1–3 **positive points** at distance-transform maxima inside the mask,
   - 2–4 **negative points** just outside the mask, in areas that were background.

   From the three candidate masks, choose by **IoU with the flow-warped previous mask**, not by `iou_scores` alone. When `object_score_logits ≤ 0`, mark the frame "occluded" and keep the last mask.
3. **In between keyframes:** warp masks with **dense optical flow computed in WebGL2** (pyramidal Lucas–Kanade or block matching on luma at ¼ resolution). Warp forward from keyframe *a* and backward from keyframe *b*, then blend the two warped **SDFs** by time. This is cheap and gives smooth boundaries.
4. **User correction:** a click on any frame turns it into a keyframe and re-runs only the affected segment.
5. **Upgrade:** when WebGPU is present, replace steps 2 and 3 with SAM 2.1-tiny-512 (or EdgeTAM) memory tracking, which handles occlusion and re-appearance natively.

Cost on WASM, 4 threads: about 1 s per keyframe (encoder plus decoder). With N = 5, 10 s of 30 fps video needs 60 keyframes, about 1 minute.

---

## 3. Runtime: onnxruntime-web vs transformers.js

| | **onnxruntime-web 1.30.0** (MIT, 2026-09-14) | **@huggingface/transformers 4.3.0** (Apache-2.0, 2026-09-16) |
|---|---|---|
| Depends on | itself | `onnxruntime-web@1.31.0-dev.20260914`; imports `onnxruntime-web/webgpu` |
| JS size (minified, gzip) | `onnxruntime-web/webgpu` (native WebGPU EP) 118 KB / **39 KB**. `/wasm` 73 / 25 KB. Default `onnxruntime-web` (JSEP + WebNN) 414 / 113 KB | `transformers.web.min.js` 450 / **126 KB**, plus the ORT JS |
| WASM binary (raw / gzip) | `ort-wasm-simd-threaded.asyncify.wasm` (webgpu bundle, includes the CPU EP) 26.8 MB / **6.6 MB**. Plain `.wasm` (CPU only) 14.2 / 3.7 MB. JSEP 28.3 / 6.6 MB. JSPI 16.8 / 4.1 MB | the same files. **By default it fetches them from `cdn.jsdelivr.net/npm/onnxruntime-web@<ver>/dist/`**, and models from `https://huggingface.co/` |
| CSP friction | `wasmPaths` must point to same-origin files **from the same build** (ORT docs). `env.wasm.proxy` "cannot work in a CSP restricted environment" (it uses Blob workers); we do not need it because we run in our own Worker | also: with `env.useWasmCache` (the default), outside Chrome it turns the WASM factory `.mjs` into a **`blob:` URL and imports it**. That needs `script-src blob:` unless you set `env.useWasmCache = false` |
| Model support relevant here | anything we export | `background-removal` pipeline (default model `Xenova/modnet`); `SamModel`, `Sam2Model`, `EdgeTamModel`, `Sam3TrackerModel` (image only) |

**Choice: use onnxruntime-web directly.** All our models have trivial pre-processing (resize plus normalise, done in WebGL or on an OffscreenCanvas). The video-memory graphs need ORT directly anyway. This also avoids transformers.js's hub, CDN and blob-URL behaviour. transformers.js remains handy for prototyping.

### WebGPU availability (MDN browser-compat-data, read 2026-09-28)

| Browser | WebGPU | In workers |
|---|---|---|
| Chrome / Edge | 113+ on Windows, macOS, ChromeOS. **Linux since 144, Intel Gen12+ only.** Android 121+ | yes |
| Firefox | **141+, partial**: Windows since 141. macOS Apple silicon since 145 (Tahoe) or 147 (older macOS). **No Linux, no Intel Mac, no Android** | yes (not in service workers) |
| Safari (macOS, iOS, iPadOS) | **26+** | yes |

So the WASM fallback is still needed: Firefox on Linux, Intel Macs and Android, Linux Chrome without Intel Gen12+, and iOS/Safari before 26.

### Threads, cross-origin isolation, and what it breaks

- ORT WASM threads need `crossOriginIsolated`. The default thread count is min(4, `hardwareConcurrency`/2). Measured gain with 4 threads vs 1: MODNet 2.4×, EdgeTAM 2.7×, BiRefNet-512 2.9×.
- Headers: `Cross-Origin-Opener-Policy: same-origin` plus `Cross-Origin-Embedder-Policy: require-corp`.
  - **Safari has no `credentialless`** (MDN BCD: Chrome 96, Firefox 119, Safari ✗), so use `require-corp`.
- What cross-origin isolation breaks:
  - cross-origin `no-cors` subresources that lack CORP (images, scripts, CSS),
  - cross-origin iframes,
  - `window.opener` links to cross-origin popups (for example OAuth or share popups).
- In GLYPHOS, `default-src 'self'` already blocks third-party subresources. The same-origin `/ex/salidas/web/` iframe keeps working because it receives the same headers.
  - `src/engine/fonts.ts` injects a `fonts.googleapis.com` stylesheet. The current CSP already blocks it, and COEP would block it too, so keep fonts self-hosted.
  - Hugging Face CDN fetches would still work (CORS `*`).
- **Scope the COOP/COEP headers to the studio routes only**, to limit the blast radius.
- WebGPU does not need cross-origin isolation.

### Lazy loading, the worker, and memory

**Loading and the worker:**
- Load the ML module with `import()` only when a Cutout or Select tool is first used.
- Before downloading, show the size and ask. Download with a progress bar (`fetch` plus a `ReadableStream` reader), store by sha in Cache Storage, and create sessions inside **one module Worker** (`new Worker(new URL('./ml.worker.ts', import.meta.url), { type: 'module' })`).
- Pass frames as transferable `ImageBitmap` or `VideoFrame`. Return masks as a transferable `Uint8Array`.
- Keep **only one large session resident**; call `session.release()` when switching models.
- Pick the backend once:
  - WebGPU if `navigator.gpu.requestAdapter()` succeeds and the limits are OK,
  - otherwise WASM with threads (if isolated), otherwise single-threaded WASM.
- Ship fp16 artifacts for WebGPU and fp32 or int8 for WASM (fp16 on the WASM EP measured 2.5× slower).

**Memory (RSS measured on WASM):**

| Model | RSS |
|---|---|
| MODNet at 512² | 0.43 GB |
| EdgeTAM encoder | 0.45 GB |
| SAM 2.1-tiny encoder | 1.3 GB |
| SlimSAM | 2.1 GB |
| BiRefNet-lite-512 | 2.6–2.9 GB |
| BEN2 | 4.3 GB |
| BiRefNet-lite-1024 | fails with `std::bad_alloc` (32-bit WASM heap) |

On phones, allow only EdgeTAM and MODNet on the WASM path. Gate BiRefNet behind WebGPU; on Chromium, also check `navigator.deviceMemory ≥ 4`.

---

## 4. mediabunny (installed 1.60.0 = latest, MPL-2.0)

All API names below were checked against `node_modules/mediabunny/dist/modules/src/*.d.ts` and the documentation sources.

### 4.1 Reading frames at exact timestamps and decoding audio

```ts
import { Input, BlobSource, ALL_FORMATS, VideoSampleSink, CanvasSink, AudioBufferSink, AudioSampleSink } from 'mediabunny';

const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
const vTrack = await input.getPrimaryVideoTrack();   // InputVideoTrack | null
const aTrack = await input.getPrimaryAudioTrack();   // InputAudioTrack | null
const duration = await input.computeDuration();

// Exact-time frame: returns "the last sample with a timestamp <= t" (null before the first frame).
const frames = new VideoSampleSink(vTrack!);
const s = await frames.getSample(t);
try { s?.draw(ctx, 0, 0, w, h); } finally { s?.close(); }     // always close() VideoSamples

// Batched frames for ML at the model size; decodes each packet at most once when times are sorted.
const ml = new CanvasSink(vTrack!, { width: 512, height: 512, fit: 'fill', poolSize: 2 });
for await (const wc of ml.canvasesAtTimestamps(times)) {         // WrappedCanvas | null
  if (!wc) continue;
  const bmp = await createImageBitmap(wc.canvas);
  mlWorker.postMessage({ t: wc.timestamp, bmp }, [bmp]);
}

// Decoded audio: Web Audio buffers (waveform, effects) or raw AudioSamples.
for await (const { buffer, timestamp } of new AudioBufferSink(aTrack!).buffers(start, end)) { /* AudioBuffer */ }
for await (const smp of new AudioSampleSink(aTrack!).samples(start, end)) { /* smp.copyTo(f32, { format: 'f32', planeIndex: 0 }); */ smp.close(); }
```

Notes on reading:
- `samples()` pre-decodes ahead, so use it for sequential playback. Use `samplesAtTimestamps()` or `canvasesAtTimestamps()` for sparse or sorted access.
- `CanvasSink` yields an `OffscreenCanvas` when running in a worker.
- To land on frame centres of variable-frame-rate sources, request `(i + 0.5) / fps`.

### 4.2 Export that keeps the ORIGINAL audio (packet copy, no re-encode)

This pattern fits the current `exportVideo()`: our `CanvasSource` drives the video, and a **composable `Conversion`** copies the audio packets into the same `Output`, stepped in lockstep.

```ts
import { Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, CanvasSource, Conversion, QUALITY_HIGH } from 'mediabunny';

const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
const videoSrc = new CanvasSource(eng.canvas, { codec: 'avc', quality: QUALITY_HIGH, keyFrameInterval: 2 });
output.addVideoTrack(videoSrc, { frameRate: fps });

const audio = await Conversion.init({
  input, output,
  composable: true,                 // we own start()/finalize(); the conversion only adds the audio track
  video: { discard: true },
  audio: {},                        // no codec/quality/resample => copied if the container accepts the codec
  trim: { start, end },             // arbitrary-range copy supported since v1.56.0 (the docs page still shows an old warning)
  copy: { mode: 'preferred' },      // transcode only when the codec cannot go in the container (e.g. AAC -> WebM)
  showWarnings: false,
});
await output.start();
for (let i = 0; i < n; i++) {
  renderFrame(i);
  await videoSrc.add(i / fps, 1 / fps);
  await audio.execute({ until: (i + 1) / fps });   // lockstep, keeps memory bounded
}
await audio.execute();
await output.finalize();
```

- `conversion.utilizedTracks` and `discardedTracks` tell you whether audio made it into the output.
- Manual alternative:
  - Read packets with `new EncodedPacketSink(aTrack).packets(await sink.getPacket(start))`.
  - Add each one to `new EncodedAudioPacketSource(aTrack.codec!)` as `add(pkt.clone({ timestamp: pkt.timestamp - start }), first ? { decoderConfig: await aTrack.getDecoderConfig() } : undefined)`.
  - The `Conversion` path is preferable because it already handles edit lists, negative timestamps and boundary policy (`boundaryPolicy`, `boundaryTolerance`, `shiftTolerance`).
- Note: the existing `tidyRecording()` passes `audio: { discard: true }`. The new editor path must not.

### 4.3 Re-encoding audio (after edits: gain, fades, speed, mixing)

- The simplest route is the `Conversion` audio options:
  - `audio: { codec, quality, sampleRate, numberOfChannels, process: (sample) => … }`, or
  - render the audio with `OfflineAudioContext` and feed `new AudioBufferSource({ codec, quality })` (or an `AudioSampleSource`) into the same `Output`.
- Choose the codec with `getFirstEncodableAudioCodec(output.format.getSupportedAudioCodecs(), { numberOfChannels, sampleRate })`.
  - WebM accepts only Opus or Vorbis.
  - MP4 accepts AAC, Opus, MP3, FLAC and more.
- Browser encode support (WebCodecs `AudioEncoder`: Chrome 94, Firefox 130 desktop, Safari 26; not on Firefox Android):

  | Codec | Chrome / Edge | Firefox | Safari |
  |---|---|---|---|
  | **AAC** (`mp4a.40.2`) | Windows, macOS, ChromeOS, Android | **none** on any platform | 26+ |
  | **Opus** | all platforms, including Linux | desktop | 26+ |

  - **No browser encodes AAC on desktop Linux.** Source: webcodecsfundamentals.org session data.
  - If AAC is missing, call `registerAacEncoder()` from `@mediabunny/aac-encoder` (MPL-2.0, v1.60.0; ≈1 MB minified, ≈250 KB gzip). It is FFmpeg's AAC encoder compiled to WASM and runs **in a `blob:` Worker**, so it needs `'wasm-unsafe-eval'` (and `worker-src blob:`, which is already allowed). Check `canEncodeAudio('aac')` first. The other fallback is Opus in MP4.
  - **Licence check:** because it embeds FFmpeg code, confirm the LGPL obligations with the maintainer before shipping.
  - MP3 and FLAC encoding are never provided by WebCodecs; mediabunny offers `@mediabunny/mp3-encoder` and `@mediabunny/flac-encoder`.

### 4.4 Limits

- `BufferTarget` keeps the whole file in RAM. For long exports use `StreamTarget` (for example into a File System Access writable on Chromium) or `fastStart: 'fragmented'`.
- `alpha: 'keep'` (transparent video) needs WebM or MKV.
- Video encoding still depends on WebCodecs availability, which `codecsAt()` already checks.

---

## 5. Canvas interaction: Konva / react-konva vs a custom mask editor

| | Konva 10.7.0 + react-konva 19.3.0 (both MIT; react-konva peer `react ^19.3`) | Custom Pointer Events + Canvas2D/WebGL2 |
|---|---|---|
| Bundle (esbuild, minified) | Konva alone 192 KB / **58 KB gz**. With react-konva (incl. `react-reconciler 0.34`) ≈340 KB / **≈104 KB gz** on top of React | ≈10–20 KB of our code |
| Rect, ellipse, polygon, lasso | built-in shapes and `Line({closed})` | `Path2D` into an OffscreenCanvas mask, then boolean ops (add, subtract, intersect) as blend modes |
| Soft brush painting (alpha) | vector strokes (`Line` plus `globalCompositeOperation`). A raster soft mask has to be baked separately | **stamp soft radial dabs** (hardness, flow, pressure via `PointerEvent.pressure`, smooth input via `getCoalescedEvents()`) into an R8 WebGL texture. Paint is `max` or add; erase is subtract |
| Feathering | Konva `Blur` filter on the CPU (slow on large masks) | separable Gaussian in a shader, or an SDF (jump flooding) plus `smoothstep`, applied live |
| Transform handles | `Konva.Transformer` (strong point) | about 150 lines: 8 handles plus rotation, in an overlay |
| Touch and pinch | **not built in**: its docs sample implements pinch by hand with `touchmove` and `Konva.hitOnDragEnabled` | 2-pointer tracking with Pointer Events, `touch-action: none`, `setPointerCapture` |
| Fit with the engine | a second scene graph and canvas stack beside our WebGL2 renderer | masks are textures the engine samples directly |

**Recommendation: custom.** The hard parts are raster soft masks, feathering and GPU compositing. Konva does not solve these, and it would add ≈104 KB gz plus a second render tree. Its one strong feature, the transformer handles, is small to write. Reconsider Konva only if the studio later grows into a layered vector compositor.

---

## 6. Dithering algorithms

**How Dither Garden groups them** (read from `dithergarden.com/editor.html` `<optgroup>`s):
- **Error Diffusion:** Atkinson, Floyd–Steinberg, Stucki, Riemersma, Jarvis.
- **Ordered Dithering:** Bayer 4×4, 8×8, 16×16, Threshold.
- **Stylized:** Blocky Pixel, **Blue Noise**, Serpentine, ASCII Art, Adaptive Error, Binary, Shades, Blocks, Stipple, Asterisk, Cross, Solid, Text.
- Colour modes: Monochrome, Duotone, Tritone, RGB.
- It hides the heavy ones on mobile (`data-mobile="hide"`): Stucki, Riemersma, Jarvis, Bayer 16, Blue Noise, ASCII, Adaptive Error, Blocky.
- Its scripts also include `sierra.js`.

| Algorithm | Kernel / idea | Where | Notes |
|---|---|---|---|
| Threshold, random (white-noise) | per pixel | **fragment shader** | the baseline |
| **Bayer 2/4/8/16** | index matrix, computed by formula or from a tiny texture | **shader** | stable in animation, so it suits ASCII video |
| Cluster-dot / halftone (angled screens) | periodic threshold function | **shader** | print look; duotone/tritone per channel |
| **Blue noise** (void-and-cluster texture) | texture lookup plus threshold; per-frame offset for temporal variation | **shader** | CC0 textures from momentsingraphics.de (16²–1024²; start with 64²) |
| Interleaved gradient noise, **a_dither** (Kolås, public domain) | arithmetic only | **shader** | no texture; "spatially stable" |
| Pattern / Knoll / Yliluoma (palette) | per-pixel candidate mixing | shader (costly but parallel) | for arbitrary palettes |
| **Floyd–Steinberg** | 7,3,5,1 /16, one row ahead | **CPU** (sequential) | reference quality |
| **Atkinson** | 6×(1/8), 2 rows ahead; spreads only 75 % of the error | CPU | Mac look; highlights and shadows wash out |
| **Jarvis–Judice–Ninke** | 12 taps /48, 2 rows ahead | CPU | smoothest, slowest |
| **Stucki** | 12 taps /42 | CPU | like JJN, faster |
| **Burkes** | 7 taps /32, 1 row ahead | CPU | fast |
| **Sierra (3-row) / Two-row Sierra / Sierra Lite** | /32, /16, /4 | CPU | Lite is the cheapest |
| Serpentine scanning | alternate the direction per row | CPU | option for every kernel above; reduces worm artefacts |
| **Riemersma** | error diffused along a Hilbert curve | CPU | organic texture |
| Ostromoukhov (variable coefficients) | intensity-dependent kernel | CPU | best "blue-noise-like" error diffusion |
| Dot diffusion (Knuth) | class matrix, processed in passes | GPU multipass possible | niche |

**Cost in GLYPHOS.** The dither runs on the **character-cell grid**, not on pixels. So CPU error diffusion is effectively free:
- My unrolled Floyd–Steinberg in JS: **0.43 ms at 240×135 cells**, 27 ms at 1920×1080 pixels, 169 ms at 4000×3000. JJN is ≈2–3× Floyd–Steinberg.
- Run error diffusion in JS on the grid every frame (main thread, or a worker for pixel-resolution export).
- Keep ordered, blue-noise and a_dither in the WebGL2 fragment shader. These are the only ones that stay temporally stable for video.
- WebGL2 has no compute shaders, so do not attempt GPU error diffusion.

---

## 7. Recommendation

### 7.1 Chosen stack and exact artifacts

| Role | Artifact (pin the HF commit and sha256; self-host under `/models/`) | Size | Code / weights licence | Backend |
|---|---|---|---|---|
| Runtime | `onnxruntime-web@1.30.x`: `onnxruntime-web/webgpu` JS plus `ort-wasm-simd-threaded.asyncify.{mjs,wasm}` copied to `/ort/1.30.x/` | JS 39 KB gz; WASM 26.8 MB raw / 6.6 MB gz. Or `/wasm` 3.7 MB gz for CPU-only browsers | MIT | Worker |
| Cutout, default | `studioludens/birefnet-lite-512` `onnx/model_fp16.onnx` (WebGPU); `onnx/model.onnx` (WASM, desktop only) | 98.5 MB / 191.9 MB | MIT / MIT | WebGPU; WASM with 4 threads ≈4 s |
| Cutout, HQ | `jiabins0303/birefnet-lite-1024-webgpu` `onnx/model_fp16.onnx` (sha256 `40598960…cf5f4`) | 114.8 MB | MIT / MIT | WebGPU only |
| Cutout, to evaluate | our own export of `ZhengPeng7/BiRefNet_lite-matting` (safetensors 89.0 MB) | ≈110 MB fp16 | MIT / MIT | WebGPU |
| Portrait live preview (optional) | `Xenova/modnet` `onnx/model_fp16.onnx` (WebGPU), `model_uint8.onnx` (WASM) | 13.0 / 6.6 MB | Apache-2.0 / Apache-2.0 | both |
| Select (click) | `onnx-community/EdgeTAM-ONNX`: `vision_encoder(_fp16).onnx` + `.onnx_data`, `prompt_encoder_mask_decoder(_fp16).onnx` + `.onnx_data` | fp16 ≈20 MB total; fp32 ≈41 MB | Apache-2.0 / Apache-2.0 | both (WASM ≈1 s + 0.12 s per click) |
| Track, WebGPU | `diffusionstudio/sam2.1-tiny-video-onnx-fp16` (5 graphs + `constants.json`); benchmark `jax-image-tools/edgetam-video-onnx` against it | 83 MB / 65 MB | Apache-2.0 (community exports) | WebGPU only |
| Track, fallback | keyframed EdgeTAM decodes plus WebGL2 optical flow and SDF interpolation (our code) | 0 | own | both |
| Matte refinement | guided-filter upsampling plus blur-fusion foreground estimation (our shaders) | 0 | own | GPU |
| Media | `mediabunny` ^1.60 (have it); `@mediabunny/aac-encoder` loaded lazily only when `!canEncodeAudio('aac')` | ≈250 KB gz | MPL-2.0 (check FFmpeg LGPL) | main thread plus blob worker |
| Mask editor | custom Pointer Events + Canvas2D/WebGL2 | ≈15 KB | own | main thread |

### 7.2 What runs where

| Where | What |
|---|---|
| **Main thread** | React UI; pointer input; mask-editor overlay; compositing, feathering, refinement and dithering shaders inside the existing WebGL2 engine; mediabunny export (the `CanvasSource` reads the engine canvas, as today); error diffusion on the cell grid |
| **ML Worker** (one module worker) | ORT sessions: WebGPU EP when an adapter is available, otherwise the WASM EP with `numThreads = crossOriginIsolated ? min(4, hc/2) : 1`. Pre-processing on an OffscreenCanvas. One large model resident at a time |
| **Optional decode worker** | `CanvasSink`/`VideoSampleSink` producing `OffscreenCanvas`es for batch jobs (WebCodecs works in workers) |
| **blob: worker** | mediabunny AAC encoder, only when needed |

### 7.3 Header and CSP changes (`vercel.json`)

**Every route**, CSP `script-src`:
- Today: `script-src 'self'`.
- New: `script-src 'self' 'wasm-unsafe-eval'`. This is required for ORT-web and the AAC encoder; without it, WebAssembly is blocked (MDN).

**Leave unchanged:**
- `connect-src 'self' blob: data:` (models are self-hosted).
- `worker-src 'self' blob:`.
- Do **not** add `script-src blob:`. If transformers.js is ever used, set `env.useWasmCache = false` and `env.backends.onnx.wasm.wasmPaths = '/ort/<ver>/'`.

**Studio routes only** (for example `/studio/(.*)` and `/` if the studio lives there):
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

**Model and runtime files:**
```
/models/(.*)  -> Cache-Control: public, max-age=31536000, immutable ; Cross-Origin-Resource-Policy: same-origin
/ort/(.*)     -> Cache-Control: public, max-age=31536000, immutable ; Content-Type application/wasm for *.wasm
```

**Only if you switch to an HF mirror:** add `https://huggingface.co https://*.hf.co` to `connect-src`. The redirect target varies (for example `us.aws.cdn.hf.co`).

### 7.4 Risks

1. **Community ONNX exports.** The 512 and 1024 BiRefNet exports and all video-memory graphs come from single-maintainer repositories, and SAM 2 encoder exports are known to break in ORT-web. Pin commits and sha256, self-host, and add golden-image tests in Playwright.
2. **Memory.** BiRefNet on WASM peaks at ≈2.6–2.9 GB and 1024 does not fit at all. Mobile without WebGPU gets EdgeTAM, MODNet and refinement only.
3. **Training-data terms.** DIS5K is non-commercial and several matting datasets are research-only. This is a residual risk for every candidate; it needs an explicit decision from the owner.
4. **WebGPU coverage.** Firefox covers only Windows and Apple-silicon macOS; Linux Chrome only Intel Gen12+. The HQ cutout and memory tracking are WebGPU-only features, so the UI must degrade clearly.
5. **Vercel.** Hobby is non-commercial and includes 100 GB/month, which is roughly 1,000 downloads of the default model. Edge caching of files over 10 MB must be verified; if it fails, chunk the files or use the HF mirror.
6. **AAC.** There is no native AAC encoder on Firefox or desktop Linux. The polyfill embeds FFmpeg, so its LGPL status needs confirming. Opus-in-MP4 is the fallback.
7. **Timing numbers.** The WASM figures are server-class CPU timings (M); phones will be 2–4× slower. The WebGPU figures are third-party (R) and not reproduced here. Benchmark on target devices before fixing UI copy ("≈1 s").
8. **Cross-origin isolation.** It breaks any future cross-origin embeds or popups. Scope it to the studio routes.

---

## 8. Appendix: raw measurements (M)

Setup: `onnxruntime-web@1.30.0` WASM EP, Node 22, 4 vCPU Xeon at 2.1 GHz. Figures are 3 runs with the first one dropped, plus RSS.

| Model / file | Input | 4 threads (ms) | 1 thread (ms) | RSS |
|---|---|---|---|---|
| Xenova/modnet fp32 | 512² | 623, 745 | 1726, 1690 | 0.43 GB |
| Xenova/modnet uint8 | 512² | 480, 655 | n/a | 0.55 GB |
| Xenova/modnet fp32 | 1024² | 2594, 2750 | n/a | 0.70 GB |
| studioludens birefnet-lite-512 fp32 | 512² | 3531, 4166 | 11310, 11219 | 2.86 GB |
| studioludens birefnet-lite-512 fp16 | 512² | 9205, 10877 | n/a | 2.65 GB |
| onnx-community BiRefNet_lite fp32 | 1024² | **std::bad_alloc** | n/a | n/a |
| jiabins birefnet-lite-1024-webgpu fp16 | 1024² | **std::bad_alloc** (a WebGPU-only graph) | n/a | n/a |
| onnx-community BEN2 fp16 | 1024² | 35857, 32617 | n/a | 4.31 GB |
| EdgeTAM vision_encoder fp32 | 1024² | 816, 1084 | 2677, 2596 | 0.45 GB |
| EdgeTAM vision_encoder uint8 | 1024² | 766, 828 | n/a | 0.66 GB |
| EdgeTAM prompt_encoder_mask_decoder fp32 | 2 points | 119, 118 | n/a | 0.35 GB |
| SAM 2.1-tiny vision_encoder fp32 | 1024² | 5320, 5260 | n/a | 1.32 GB |
| SAM 2.1-tiny decoder fp32 | 2 points | 94, 87 | n/a | 0.34 GB |
| SlimSAM-77 vision_encoder fp32 / quantized | 1024² | 3294, 2958 / 2800, 2626 | n/a | 2.19 / 2.14 GB |
| EdgeTAM video: vision / memory_attention / mask_decoder / memory_encoder | 1024², 7 memories | 2563, 2308 / 5362, 3096 / 274, 326 / 1699, 2544 | n/a | 1.7 / 0.55 / 0.41 / n/a GB |
| JS Floyd–Steinberg (unrolled) | 240×135 / 1920×1080 / 4000×3000 | 0.43 / 27.5 / 169 | (single-threaded JS) | n/a |

The benchmark script is in the scratchpad at `phase4/bench/bench.mjs`.

---

## 9. Sources (checked)

**Background removal**
- BiRefNet README and model zoo: https://github.com/ZhengPeng7/BiRefNet (raw README); release assets: https://github.com/ZhengPeng7/BiRefNet/releases/expanded_assets/v1
- BiRefNet on Hugging Face: https://huggingface.co/ZhengPeng7/BiRefNet · https://huggingface.co/ZhengPeng7/BiRefNet_lite-matting · HF API `https://huggingface.co/api/models?author=ZhengPeng7`
- BiRefNet ONNX exports: https://huggingface.co/onnx-community/BiRefNet_lite-ONNX · https://huggingface.co/onnx-community/BiRefNet-ONNX · https://huggingface.co/studioludens/birefnet-lite-512 · https://huggingface.co/jiabins0303/birefnet-lite-1024-webgpu
- BEN2: https://huggingface.co/PramaLLC/BEN2 · https://github.com/PramaLLC/BEN2 (LICENSE) · https://huggingface.co/onnx-community/BEN2-ONNX
- rembg: https://github.com/danielgatis/rembg (README, LICENSE.txt) · https://github.com/danielgatis/rembg/releases/expanded_assets/v0.0.0
- Licences of the rembg-loaded models: https://github.com/xuebinqin/U-2-Net (LICENSE) · https://github.com/xuebinqin/DIS (LICENSE, README, DIS5K-Dataset-Terms-of-Use.pdf) · https://github.com/SkyTNT/anime-segmentation (LICENSE) · https://github.com/levindabhi/cloth-segmentation (LICENSE) · https://github.com/facebookresearch/segment-anything (LICENSE)
- MODNet: https://github.com/ZHKKKe/MODNet (README licence section) · https://huggingface.co/Xenova/modnet
- BRIA: https://huggingface.co/briaai/RMBG-1.4 · https://huggingface.co/briaai/RMBG-2.0
- InSPyReNet: https://github.com/plemeri/InSPyReNet (LICENSE, docs/model_zoo.md) · https://github.com/plemeri/transparent-background
- withoutBG: https://github.com/withoutbg/withoutbg · https://huggingface.co/withoutbg/withoutbg-openweights-onnx
- AGPL and ViTMatte: https://huggingface.co/onnx-community/ISNet-ONNX · npm `@imgly/background-removal` · https://huggingface.co/hustvl/vitmatte-small-distinctions-646 · https://github.com/hustvl/ViTMatte (LICENSE)
- Foreground-colour estimation: https://github.com/Photoroom/fast-foreground-estimation
- Browser benchmarks and demos: https://github.com/AkaraChen/nuki · https://github.com/huggingface/transformers.js-examples/tree/main/video-background-removal (main.js)

**Segmentation and tracking**
- SAM 2 and EdgeTAM: https://github.com/facebookresearch/sam2 (README licence, checkpoint table) · https://huggingface.co/facebook/sam2.1-hiera-tiny · https://github.com/facebookresearch/EdgeTAM (README) · https://huggingface.co/facebook/EdgeTAM · https://huggingface.co/facebook/sam3 · https://github.com/facebookresearch/sam3 (LICENSE: "SAM License")
- Image ONNX exports: https://huggingface.co/onnx-community/EdgeTAM-ONNX · https://huggingface.co/onnx-community/sam2.1-hiera-tiny-ONNX · https://huggingface.co/onnx-community/sam2.1-hiera-small-ONNX · https://huggingface.co/onnx-community/sam3-tracker-ONNX
- Video ONNX exports: https://huggingface.co/square-zero-labs/sam2.1-tiny-video-onnx · https://huggingface.co/diffusionstudio/sam2.1-tiny-video-onnx-fp16 · https://huggingface.co/jax-image-tools/edgetam-video-onnx · https://huggingface.co/perceptuality/sam2.1-tiny-video-ort
- Other SAMs: https://github.com/yformer/EfficientSAM · https://huggingface.co/spaces/yunyangx/EfficientSAM · https://github.com/ChaoningZhang/MobileSAM · https://github.com/czg1225/SlimSAM · https://huggingface.co/Xenova/slimsam-77-uniform
- transformers.js: https://github.com/huggingface/transformers.js/releases · https://github.com/huggingface/transformers.js/pull/1454 · https://github.com/huggingface/transformers.js/pull/1461 · npm tarball `@huggingface/transformers@4.3.0` (dist read)
- Other browser SAM projects: https://github.com/lucasgelfond/webgpu-sam2 · https://github.com/Labelbox/sam2-web · https://labelbox.com/blog/bringing-ai-to-the-browser-sam2-for-interactive-image-segmentation/

**Runtime and headers**
- Package data: npm registry (`onnxruntime-web`, `@huggingface/transformers`, `konva`, `react-konva`, `mediabunny`, `@mediabunny/aac-encoder`); tarballs inspected
- ORT-web: https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html
- MDN: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src · https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy
- MDN browser-compat-data (raw JSON): `api/GPU.json`, `api/WorkerNavigator.json`, `api/AudioEncoder.json`, `api/VideoEncoder.json`, `http/headers/Cross-Origin-Embedder-Policy.json` at https://github.com/mdn/browser-compat-data
- Codec support data: https://webcodecsfundamentals.org/codecs/mp4a.40.2.html · https://webcodecsfundamentals.org/codecs/opus.html

**mediabunny**
- Docs: https://mediabunny.dev/guide/media-sinks · https://mediabunny.dev/guide/converting-media-files · https://mediabunny.dev/guide/supported-formats-and-codecs · https://mediabunny.dev/guide/extensions/aac-encoder
- Docs sources: https://github.com/Vanilagy/mediabunny/tree/main/docs/guide
- Releases (v1.56.0 arbitrary-trim copy; v1.58.0 `boundaryTolerance`): https://github.com/Vanilagy/mediabunny/releases
- Local `.d.ts` files of 1.60.0

**Hosting**
- Vercel: https://vercel.com/docs/limits · https://vercel.com/docs/cdn-cache · https://vercel.com/docs/limits/fair-use-guidelines · https://vercel.com/docs/project-configuration/git-settings · https://vercel.com/changelog/cli-deployment-limits-removed
- GitHub file-size limits: https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github
- Hugging Face CDN headers checked with curl on `resolve/main/...` URLs

**Canvas and dithering**
- Konva pinch-zoom sample: https://konvajs.org/docs/sandbox/Multi-touch_Scale_Stage.html
- Dithering: https://www.dithergarden.com/editor.html (HTML read) · https://www.dithergarden.com/ · https://tannerhelland.com/2012/12/28/dithering-eleven-algorithms-source-code.html · https://momentsingraphics.de/BlueNoise.html · https://pippin.gimp.org/a_dither/
