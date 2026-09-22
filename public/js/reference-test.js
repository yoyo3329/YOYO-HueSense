(() => {
  const form = document.querySelector('#rd-form');
  const queryInput = document.querySelector('#rd-query');
  const targetSelect = document.querySelector('#rd-target');
  const status = document.querySelector('#rd-status');
  const summary = document.querySelector('#rd-summary');
  const distributions = document.querySelector('#rd-distributions');
  const manual = document.querySelector('#rd-manual');
  const warning = document.querySelector('#rd-warning');
  const grid = document.querySelector('#rd-grid');
  const sourceBody = document.querySelector('#source-body');
  const familyBody = document.querySelector('#family-body');
  const exportButton = document.querySelector('#export-json');
  const clearLabelsButton = document.querySelector('#clear-labels');

  const mCount = document.querySelector('#m-count');
  const mLoaded = document.querySelector('#m-loaded');
  const mBroken = document.querySelector('#m-broken');
  const mBrokenRate = document.querySelector('#m-broken-rate');
  const mGood = document.querySelector('#m-good');
  const mGray = document.querySelector('#m-gray');
  const mWrong = document.querySelector('#m-wrong');

  let current = null;
  let imageState = new Map();
  let labels = new Map();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await runDiscovery();
  });

  clearLabelsButton.addEventListener('click', () => {
    labels = new Map();
    grid.querySelectorAll('.rd-labels button').forEach((button) => button.classList.remove('active'));
    updateMetrics();
  });

  exportButton.addEventListener('click', () => {
    if (!current) return;

    const payload = {
      exported_at: new Date().toISOString(),
      input: current.input,
      mode: current.mode,
      source_mode: current.source_mode,
      reference_count: current.reference_count,
      source_distribution: current.source_distribution,
      query_family_distribution: current.query_family_distribution,
      dead_url_count: countImageState('broken'),
      dead_url_ratio: ratio(countImageState('broken'), current.reference_count),
      manual_summary: labelSummary(),
      references: current.references.map((item) => ({
        ...item,
        load_status: imageState.get(item.id) || 'pending',
        manual_label: labels.get(item.id) || null,
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `reference-test-${slug(current.input)}-${new Date().toISOString().slice(0,10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  });

  async function runDiscovery() {
    const q = queryInput.value.trim();
    if (!q) {
      status.textContent = '請先輸入測試概念。';
      return;
    }

    status.textContent = '正在建立原始 Reference Pool；這一步不會執行 Gate / CLIP / A/B/C…';
    summary.hidden = true;
    distributions.hidden = true;
    manual.hidden = true;
    grid.replaceChildren();
    imageState = new Map();
    labels = new Map();

    try {
      const response = await fetch('../api/reference-discovery.php', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
        body: JSON.stringify({
          q,
          target: Number(targetSelect.value) || 80,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.message || `Reference Discovery 失敗（HTTP ${response.status}）`);
      }

      current = data;
      warning.textContent = data.source_warning || '';
      renderDistribution(sourceBody, data.source_distribution || {});
      renderDistribution(familyBody, data.query_family_distribution || {});
      renderReferences(data.references || []);

      mCount.textContent = String(data.reference_count || 0);
      summary.hidden = false;
      distributions.hidden = false;
      manual.hidden = false;

      const errorCount = Array.isArray(data.provider_errors) ? data.provider_errors.length : 0;
      status.textContent = `完成：取得 ${data.reference_count} 張 raw Reference。Provider/query 錯誤 ${errorCount} 筆。請開始人工標記。`;
      updateMetrics();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Reference Discovery 失敗。';
    }
  }

  function renderDistribution(tbody, data) {
    tbody.replaceChildren();
    Object.entries(data).forEach(([key, value]) => {
      const tr = document.createElement('tr');
      const name = document.createElement('th');
      const count = document.createElement('td');
      name.textContent = key;
      count.textContent = String(value);
      tr.append(name, count);
      tbody.appendChild(tr);
    });
  }

  function renderReferences(items) {
    grid.replaceChildren();

    items.forEach((item, index) => {
      imageState.set(item.id, 'pending');

      const card = document.createElement('article');
      card.className = 'rd-card';
      card.dataset.id = item.id;

      const img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = item.alt || '';
      img.src = item.image_small || item.image_regular;

      img.addEventListener('load', () => {
        imageState.set(item.id, 'loaded');
        updateMetrics();
      }, {once: true});

      img.addEventListener('error', () => {
        imageState.set(item.id, 'broken');
        card.classList.add('is-broken');
        updateMetrics();
      }, {once: true});

      const body = document.createElement('div');
      body.className = 'rd-body';

      const badges = document.createElement('div');
      badges.className = 'rd-badges';
      [
        `#${index + 1}`,
        item.provider_name || item.provider,
        item.query_family,
      ].forEach((text) => {
        const badge = document.createElement('span');
        badge.className = 'rd-badge';
        badge.textContent = text;
        badges.appendChild(badge);
      });

      const alt = document.createElement('div');
      alt.className = 'rd-alt';
      alt.textContent = item.alt || '(沒有文字 metadata)';

      const q = document.createElement('div');
      q.className = 'rd-alt';
      q.textContent = `query：${item.query || ''}`;

      const link = document.createElement('a');
      link.href = item.photo_url || item.image_regular || '#';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = '查看原始來源';

      const labelWrap = document.createElement('div');
      labelWrap.className = 'rd-labels';

      [
        ['good', '合理'],
        ['gray', '灰區'],
        ['wrong', '錯圖'],
      ].forEach(([value, text]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = text;
        button.addEventListener('click', () => {
          labels.set(item.id, value);
          labelWrap.querySelectorAll('button').forEach((node) => node.classList.remove('active'));
          button.classList.add('active');
          updateMetrics();
        });
        labelWrap.appendChild(button);
      });

      body.append(badges, alt, q, link, labelWrap);
      card.append(img, body);
      grid.appendChild(card);
    });
  }

  function updateMetrics() {
    const total = current?.reference_count || 0;
    const loaded = countImageState('loaded');
    const broken = countImageState('broken');
    const summary = labelSummary();

    mLoaded.textContent = String(loaded);
    mBroken.textContent = String(broken);
    mBrokenRate.textContent = `${(ratio(broken, total) * 100).toFixed(1)}%`;
    mGood.textContent = String(summary.good);
    mGray.textContent = String(summary.gray);
    mWrong.textContent = String(summary.wrong);
  }

  function countImageState(state) {
    let count = 0;
    imageState.forEach((value) => {
      if (value === state) count++;
    });
    return count;
  }

  function labelSummary() {
    const result = {good: 0, gray: 0, wrong: 0, unlabeled: 0};
    const total = current?.reference_count || 0;
    labels.forEach((value) => {
      if (Object.prototype.hasOwnProperty.call(result, value)) result[value]++;
    });
    result.unlabeled = Math.max(0, total - result.good - result.gray - result.wrong);
    return result;
  }

  function ratio(a, b) {
    return b > 0 ? a / b : 0;
  }

  function slug(value) {
    return String(value || 'reference')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'reference';
  }
})();
