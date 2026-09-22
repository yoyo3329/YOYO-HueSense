'use strict';

const fs = require('fs');
const path = require('path');
const Contract = require('./shadow-result-contract.js');
const Mapper = require('./shadow-b1-real-mapper.js');

function assert(c, m) { if (!c) throw new Error(m); }
let pass = 0, total = 0;
function check(name, fn) {
  total++;
  try { fn(); pass++; console.log(`PASS  ${name}`); }
  catch (e) { console.error(`FAIL  ${name} — ${e.message}`); process.exitCode = 1; }
}

const b1 = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'y2k_color_mvp_b1_observations.json'), 'utf8'
));
const nodes = Mapper.flattenPaletteNodes(b1);
const summary = Mapper.summarize(b1, nodes);

check('real B1 source has 24 images', () => {
  assert(summary.source_images === 24, `got ${summary.source_images}`);
});
check('real B1 fixture yields exactly 120 palette nodes', () => {
  assert(nodes.length === 120, `got ${nodes.length}`);
});
check('all B1 source images use decoded-pixel analysis', () => {
  assert(summary.decoded_pixel_images === 24, `got ${summary.decoded_pixel_images}`);
});
check('real B1 source has no observation errors', () => {
  assert(summary.observation_errors === 0, `got ${summary.observation_errors}`);
});
check('all mapped palette nodes satisfy projected-item contract', () => {
  for (const n of nodes) {
    Contract.assertProjectedItem({
      result_id: n.id,
      production_rank: n.productionRank,
      clip_score: n.clipScore,
      physical_features: n.colorFeatures
    });
  }
});
check('30/60/120 benchmark slices are available without duplication', () => {
  for (const n of [30, 60, 120]) {
    const ids = nodes.slice(0, n).map(x => x.id);
    assert(ids.length === n, `slice ${n} unavailable`);
    assert(new Set(ids).size === n, `slice ${n} has duplicate ids`);
  }
});
check('browser harness does not load production app.js', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const scriptSrcs = [...html.matchAll(/<script\s+src=["']([^"']+)["']/gi)].map(m => m[1]);
  assert(
    !scriptSrcs.some(src => /(?:^|\/)app\.js(?:$|\?)/i.test(src)),
    `production app.js script found: ${scriptSrcs.join(', ')}`
  );
});
check('browser fixture JS is present and self-contained', () => {
  const s = fs.readFileSync(
    path.join(__dirname, 'yoyo-b1-real-observations.fixture.js'), 'utf8'
  );
  assert(s.startsWith('window.YOYO_B1_REAL_OBSERVATIONS = '), 'fixture global missing');
  assert(s.includes('"items"'), 'fixture content missing');
});

console.log(`\n${pass}/${total} Shadow Browser v0.4 static checks ${pass === total ? 'PASS' : 'FAIL'}.`);
if (pass !== total) process.exit(1);
