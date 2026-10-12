# 來源、版本、授權與實際檢查

檢查日期：2026-10-12。沒有將以下專案 README 的宣稱視為本次真實推論證據。

## 本階段選用模型

- Repository: <https://huggingface.co/akiyamanx/sam2.1-hiera-tiny-onnx/tree/aa11669045f8d82c74e46f8f77c9b56792c90ebb>
- Revision: `aa11669045f8d82c74e46f8f77c9b56792c90ebb`（immutable URL，非 main）。
- Encoder: `sam2.1_hiera_tiny.encoder.ort`，134,721,512 bytes，SHA-256 `a987ec27f61a8d732516a543cbb306cd81c56e845321337e190b1848a54f0d5b`。
- Decoder: `sam2.1_hiera_tiny.decoder.onnx`，16,519,561 bytes，SHA-256 `c40f5aa7d37b681cd500481a85d44839fd81c93dce1e86271a2c866470d22105`。
- 兩檔實際下載成功；位元組數及 SHA-256 均与 HF API LFS metadata 相符。實際下載回應觀察到 `Access-Control-Allow-Origin: *`。這是 HTTP 層證據，不是瀏覽器 CSP 或 WebGPU 成功證據。
- 實際以 ORT 開啟兩個模型、讀取張量契約，並在 Linux CPU 跑前向運算。沒有只照模型卡寫 adapter。
- HF 模型卡宣告 Apache-2.0，但只有簡短授權 metadata，未提供完整轉換 provenance。上游 Meta SAM2 checkpoint/code 採 Apache-2.0：<https://github.com/facebookresearch/sam2/blob/main/LICENSE>，副本在 `licenses/SAM2-APACHE-2.0.txt`。不重新散布權重；若未來散布轉換模型，需保留授權／通知並核對轉換來源。
- 本分支的身分是 **community-converted SAM2.1 Tiny fp32**；不是現有研究的 certified snapshot，也尚未證明逐值等價。

## 原始碼交叉核對

### WebSAM

<https://github.com/Xevion/WebSAM/tree/2fb75b428f65272f4c32d2451a9c482f687c4cf9>

實際讀取 `src/lib/inference/models.ts`、`session.ts`、`encoder.ts`、`decoder.ts` 與 `package.json`。發現使用預最佳化 `.ort` encoder，註記 Hiera raw ONNX shape optimizer 問題；session 採 WebGPU-only、encoder disable graph optimization。WebSAM 的 encoder 使用 longest-edge padding；不可直接當成 Meta SAM2 的 square resize 契約。本次沒有複製其程式碼：該 snapshot 未發現 LICENSE，GitHub license metadata 為 null。

### SAM2 匯出器

<https://github.com/vietanhdev/samexporter/tree/35133ce8670e0d190ac10cc08efba9b9a443fb51>

實際讀取 `samexporter/export_sam2.py` 與 `samexporter/sam2_onnx.py`，核對 ImageNet RGB normalization、square resize、獨立 x/y scale、float32 point labels、mask feedback 與 low-resolution logits。匯出器程式的契約與選用模型實際 I/O 名稱吻合，但**不因此宣稱這些 binary 必定由該 commit 匯出**。

### 曾檢查但未採用

<https://huggingface.co/cstr/sam2.1-hiera-tiny-ONNX/tree/e5524d4d1a529b43d5073d96ebc8d2bd09f44641> 提供另一種 ONNX 契約（int64 labels、4 candidates），模型卡未列 mask-input 修正；不能與本 Provider 混用。沒有採用其權重。

## Runtime

ONNX Runtime Web **1.24.3**，npm lockfile 固定版本與套件 integrity；實際安裝並準備同源 ESM/JSEP assets。MIT 授權副本：`licenses/ONNX-RUNTIME-MIT.txt`，來源 <https://github.com/microsoft/onnxruntime/blob/v1.24.3/LICENSE>。

官方文件：

- <https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html>：WebGPU 不搭配 ORT proxy worker；WASM 多執行緒需 crossOriginIsolated；JS/WASM 版本必須一致。
- <https://onnxruntime.ai/docs/tutorials/web/deploy.html>：跨來源 worker 與資源託管限制。

本次使用自己的同源 module Worker、WebGPU session、單執行緒 WASM runtime support，不用 ORT proxy worker，不承諾全部算子均在 GPU 執行。

## 第二階段參考的初步核對（未宣稱 CLIP 推論通過）

- <https://github.com/Anika215/zero-shot-image-classifier/tree/5d8dd83621ff7a56de85d090bb2cf96ced4e9266>：實讀 `src/worker.js`，CLIP 使用 Transformers.js `zero-shot-image-classification` 與 `Xenova/clip-vit-base-patch32`；沒有固定模型 revision。該 snapshot 無 LICENSE，未複製其程式。
- <https://github.com/huggingface/transformers.js/blob/main/LICENSE>：Apache-2.0。後續須獨立固定 runtime、tokenizer、processor、模型 revision、dtype 並檢查 binary。
- <https://github.com/mlfoundations/open_clip/blob/main/LICENSE>：程式碼 MIT；模型權重的授權與身分仍須分別確認。
- CLIP zero-shot pipeline 的 label score 不可直接當成現有 OpenCLIP cosine similarity；不同 checkpoint 不可宣稱數值一致。第二階段尚未下載或執行 CLIP 權重。
