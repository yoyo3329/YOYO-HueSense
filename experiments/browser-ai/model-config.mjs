// Community conversion, NOT a claim of equivalence to the research snapshot.
export const MODEL = Object.freeze({
  id: 'akiyamanx/sam2.1-hiera-tiny-onnx',
  revision: 'aa11669045f8d82c74e46f8f77c9b56792c90ebb',
  family: 'SAM2.1 Hiera Tiny', precision: 'fp32', runtime: '1.24.3',
  license: 'Apache-2.0 (publisher declaration; upstream Meta Apache-2.0)',
  encoder: Object.freeze({file: 'sam2.1_hiera_tiny.encoder.ort', bytes: 134721512, sha256: 'a987ec27f61a8d732516a543cbb306cd81c56e845321337e190b1848a54f0d5b'}),
  decoder: Object.freeze({file: 'sam2.1_hiera_tiny.decoder.onnx', bytes: 16519561, sha256: 'c40f5aa7d37b681cd500481a85d44839fd81c93dce1e86271a2c866470d22105'})
});
export const modelURL = spec => `https://huggingface.co/${MODEL.id}/resolve/${MODEL.revision}/${spec.file}`;
