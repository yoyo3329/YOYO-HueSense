'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.YOYOShadowB1Mapper = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const VERSION = '0.4.0';
  function assert(c, m) { if (!c) throw new Error(m); }

  function flattenPaletteNodes(observations) {
    assert(observations && Array.isArray(observations.items), 'B1 observations.items required');
    const out = [];
    let productionRank = 1;

    for (let imageIndex = 0; imageIndex < observations.items.length; imageIndex++) {
      const image = observations.items[imageIndex];
      const palette = Array.isArray(image.palette) ? image.palette : [];

      for (let paletteIndex = 0; paletteIndex < palette.length; paletteIndex++) {
        const swatch = palette[paletteIndex];
        const lch = swatch && swatch.lch;
        if (!lch) continue;

        const L = Number(lch.L);
        const C = Number(lch.C);
        const H = lch.H == null ? null : Number(lch.H);

        if (!Number.isFinite(L) || !Number.isFinite(C) ||
            (H !== null && !Number.isFinite(H))) continue;

        out.push({
          id: `${image.id}__palette_${paletteIndex + 1}`,
          productionRank: productionRank++,
          clipScore: image.clip_score == null ? null : Number(image.clip_score),
          colorFeatures: { L, C, H },
          harnessProvenance: {
            source_image_id: image.id,
            clip_rank: image.clip_rank,
            query_family: image.query_family,
            source_domain: image.source_domain,
            palette_index: paletteIndex,
            hex: swatch.hex,
            ratio: swatch.ratio,
            b1_analysis_mode: image.analysis_provenance && image.analysis_provenance.analysis_mode
          }
        });
      }
    }
    return out;
  }

  const accessors = Object.freeze({
    getResultId: x => x.id,
    getProductionRank: x => x.productionRank,
    getClipScore: x => x.clipScore,
    getPhysicalFeatures: x => x.colorFeatures
  });

  function summarize(observations, nodes) {
    return {
      source: 'y2k_color_mvp_b1_observations.json',
      source_images: observations.items.length,
      palette_nodes: nodes.length,
      expected_max_nodes: observations.items.length * 5,
      decoded_pixel_images: observations.items.filter(
        x => x.analysis_provenance && x.analysis_provenance.analysis_mode === 'decoded_pixels'
      ).length,
      observation_errors: observations.items.filter(x => x.observation_error).length
    };
  }

  return Object.freeze({ VERSION, flattenPaletteNodes, accessors, summarize });
});
