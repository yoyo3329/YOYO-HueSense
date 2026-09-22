'use strict';

const form = document.querySelector('#search-form');
const textarea = document.querySelector('#project-description');
const characterCount = document.querySelector('#character-count');
const searchButton = document.querySelector('#search-button');
const interpretationSection = document.querySelector('#interpretation-section');
const interpretationSummary = document.querySelector('#interpretation-summary');
const interpretationNotice = document.querySelector('#interpretation-notice');
const conceptGroups = document.querySelector('#concept-groups');
const conceptTemplate = document.querySelector('#concept-chip-template');
const targetPreview = document.querySelector('#target-preview');
const searchPlanPreview = document.querySelector('#search-plan-preview');
const reparseButton = document.querySelector('#reparse-button');
const confirmSearchButton = document.querySelector('#confirm-search-button');
const resultSection = document.querySelector('#result-section');
const searchSummary = document.querySelector('#search-summary');
const statusMessage = document.querySelector('#status-message');
const photoGrid = document.querySelector('#photo-grid');
const loadMoreButton = document.querySelector('#load-more-button');
const clearButton = document.querySelector('#clear-button');
const cardTemplate = document.querySelector('#photo-card-template');
const directionSection = document.querySelector('#direction-section');
const directionGrid = document.querySelector('#direction-grid');
const directionNote = document.querySelector('#direction-note');
const directionTemplate = document.querySelector('#direction-card-template');

const CATEGORY_LABELS = {
  subject: '主題',
  context: '情境',
  atmosphere: '氣氛',
  color: '色彩感受',
  exclusion: '排除條件',
};

const TARGET_LABELS = {
  meanLightness: '明度',
  meanChroma: '色度',
  temperature: '冷暖',
  contrast: '對比',
  visualWeight: '視覺重量',
  neutralRatio: '中性色比例',
  darkRatio: '深色比例',
  highChromaRatio: '高彩度比例',
  hueConcentration: '色相集中度',
  accentRatio: '強調色比例',
};

const state = {
  query: '',
  interpretation: null,

   /*
   * ColorRuleEngine 產生的共同基準。
   */
  baseTarget: {},
   /*
   * BranchBuilder 已經在搜尋前建立好的
   * A / B / C。
   */
branches: {
  A: null,
  B: null,
  C: null,
},
 /*
   * B 是最接近使用者原始輸入的 Base。
   * 因此預設先搜尋 B。
   */

activeBranch: 'B',
  targetProfile: {},
  featureWeights: {},
  constraints: [],
  exclusionTerms: [],
  searchPlan: [],
  page: 1,
  totalPages: 1,
  loading: false,
  photos: [],
  directions: [],
  selectedDirection: null,
  analysisMeta: null,
  scoreMap: new Map(),
  analysisVersion: 0,
  requestSequence: 0,
  activeRequestId: 0,
  photoOwnership: new Map(),
  deriveTimer: null,
  publicConfig: {
    inputMaxLength: 300,
    defaultPerPage: 30,
  },
  analysisConfig: {},
};


async function loadPublicSettings() {
  try {
    const response = await fetch('../api/settings.php', {
      headers: { Accept: 'application/json' },
    });
    const data = await response.json().catch(() => null);
    if (response.ok && data?.ok) {
      applyPublicConfig(data.public_config);
    }
  } catch (_) {
    applyPublicConfig(state.publicConfig);
  }
}

loadPublicSettings();

textarea.addEventListener('input', () => {
  characterCount.textContent = `${textarea.value.length} / ${state.publicConfig.inputMaxLength}`;
  if (state.interpretation && textarea.value.trim() !== state.query) {
    interpretationSection.classList.add('is-stale');
  }
});

textarea.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    form.requestSubmit();
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  await interpretDescription();
});

reparseButton.addEventListener('click', interpretDescription);

confirmSearchButton.addEventListener('click', async () => {
  if (!state.interpretation?.concepts?.length) {
    showError('至少需要保留一個概念。');
    return;
  }

 /*
 * 正式搜尋前，
 * 強制呼叫 derive.php，
 * 確保 Base Target 與 A / B / C
 * 已經全部建立完成。
 */
window.clearTimeout(state.deriveTimer);
await refreshDerivedPreview();

const hasAllBranches =
  ['A', 'B', 'C'].every(
    (code) =>
      state.branches[code]
      && typeof state.branches[code] === 'object'
  );

if (!hasAllBranches) {
  showError('目前無法建立完整的 A／B／C 搜尋方向。');
  return;
}

state.query = textarea.value.trim();
  state.page = 1;
  state.totalPages = 1;
  /*
 * 每次確認新的搜尋，
 * 都先從最貼近原始需求的 B 開始。
 */
  state.activeBranch = 'B';
  state.photos = [];
  state.directions = [];
  state.selectedDirection = null;
  state.analysisMeta = null;
  state.scoreMap = new Map();
  state.photoOwnership = new Map();
  state.analysisVersion += 1;
  state.activeRequestId = ++state.requestSequence;
  window.ToneAnalyzer.clearCache();

  resultSection.hidden = false;

directionGrid.replaceChildren();
photoGrid.replaceChildren();

/*
 * A / B / C 已經由 BranchBuilder 建立完成，
 * 所以搜尋圖片以前就能顯示。
 */
renderBranchDirections();

resultSection.scrollIntoView({
  behavior: 'smooth',
  block: 'start',
});
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  await searchPhotos(false);
});

loadMoreButton.addEventListener('click', async () => {
  if (state.loading || state.page >= state.totalPages) return;
  state.page += 1;
  await searchPhotos(true);
});

clearButton.addEventListener('click', resetAll);

async function interpretDescription() {
  const query = textarea.value.trim();
  if (!query) {
    textarea.focus();
    showError('請先寫下你想搜尋的專案或視覺感受。');
    return;
  }

  setInterpretationLoading(true);
  resultSection.hidden = true;

  try {
    const response = await fetch('../api/interpret.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ q: query }),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.ok) {
      throw new Error(data?.message || `解析失敗（HTTP ${response.status}）`);
    }

    state.query = query;
    state.interpretation = data.interpretation;
    applyPublicConfig(data.public_config);
    applyDerivedData(data);
    interpretationSection.classList.remove('is-stale');
    renderInterpretation();
    interpretationSection.hidden = false;
    interpretationSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    showError(error instanceof Error ? error.message : '語意解析失敗。');
  } finally {
    setInterpretationLoading(false);
  }
}

function renderInterpretation() {
  const interpretation = state.interpretation;
  if (!interpretation) return;

  const confidence = Math.round((Number(interpretation.overall_confidence) || 0) * 100);
  const sourceText = interpretation.source === 'openrouter' ? 'OpenRouter 結構化解析' : '規則備援解析';
  interpretationSummary.textContent = `${interpretation.summary}（${sourceText}，整體信心 ${confidence}%）`;

  interpretationNotice.hidden = !interpretation.notice;
  interpretationNotice.textContent = interpretation.notice || '';
  conceptGroups.replaceChildren();

  Object.keys(CATEGORY_LABELS).forEach((category) => {
    const concepts = interpretation.concepts.filter((item) => item.category === category);
    if (!concepts.length) return;

    const section = document.createElement('section');
    section.className = 'concept-group';
    const heading = document.createElement('h3');
    heading.textContent = CATEGORY_LABELS[category];
    const list = document.createElement('div');
    list.className = 'concept-chip-list';

    concepts.forEach((concept) => list.appendChild(createConceptChip(concept)));
    section.append(heading, list);
    conceptGroups.appendChild(section);
  });

  renderDerivedPreview();
}

function createConceptChip(concept) {
  const node = conceptTemplate.content.cloneNode(true);
  const article = node.querySelector('.concept-chip');
  const original = node.querySelector('.concept-original');
  const searchTerm = node.querySelector('.concept-search-term');
  const categorySelect = node.querySelector('.concept-category');
  const prioritySelect = node.querySelector('.concept-priority');
  const removeButton = node.querySelector('.concept-remove');

  article.dataset.conceptId = concept.id;
  original.textContent = concept.original_text || concept.normalized_label;
  searchTerm.textContent = concept.search_term ? `→ ${concept.search_term}` : '→ 僅作色彩規則';
  categorySelect.value = concept.category;
  prioritySelect.value = concept.priority;

  categorySelect.addEventListener('change', () => {
    concept.category = categorySelect.value;
    if (concept.category === 'exclusion') {
      concept.priority = 'exclude';
    } else if (concept.priority === 'exclude') {
      concept.priority = 'secondary';
    }
    renderInterpretation();
    scheduleDerivedRefresh();
  });

  prioritySelect.addEventListener('change', () => {
    concept.priority = prioritySelect.value;
    if (concept.priority === 'exclude') {
      concept.category = 'exclusion';
    } else if (concept.category === 'exclusion') {
      concept.category = 'color';
    }
    renderInterpretation();
    scheduleDerivedRefresh();
  });

  removeButton.addEventListener('click', () => {
    state.interpretation.concepts = state.interpretation.concepts.filter(
      (item) => item.id !== concept.id,
    );
    renderInterpretation();
    scheduleDerivedRefresh();
  });

  return node;
}

function scheduleDerivedRefresh() {
  window.clearTimeout(state.deriveTimer);
  state.deriveTimer = window.setTimeout(refreshDerivedPreview, 180);
}

async function refreshDerivedPreview() {
  if (!state.interpretation?.concepts?.length) {
    state.targetProfile = {};
    state.searchPlan = [];
    renderDerivedPreview();
    return;
  }

  try {
    const response = await fetch('../api/derive.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ concepts: state.interpretation.concepts }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      throw new Error(data?.message || '無法更新規則預覽。');
    }
    state.interpretation.concepts = data.concepts;
    applyDerivedData(data);
    renderDerivedPreview();
  } catch (error) {
    interpretationNotice.hidden = false;
    interpretationNotice.textContent = error instanceof Error ? error.message : '無法更新規則預覽。';
  }
}

function applyPublicConfig(config) {
  if (!config || typeof config !== 'object') return;

  const maxLength = Math.max(1, Number(config.input_max_length) || 300);
  const defaultPerPage = Math.max(1, Number(config.default_per_page) || 30);
  state.publicConfig = { inputMaxLength: maxLength, defaultPerPage };
  textarea.maxLength = maxLength;
  characterCount.textContent = `${textarea.value.length} / ${maxLength}`;
}

function applyDerivedData(data) {
 /*
   * -------------------------
   * Base Target
   * -------------------------
   */
  if (
    data.base_target
    && typeof data.base_target === 'object'
  ) {
    state.baseTarget = data.base_target;
  }

  /*
   * -------------------------
   * derive.php 回傳完整
   * A / B / C 時保存起來。
   * -------------------------
   */
  if (
    data.branches
    && typeof data.branches === 'object'
  ) {
    state.branches = {
      A: data.branches.A || null,
      B: data.branches.B || null,
      C: data.branches.C || null,
    };
  }

  /*
   * -------------------------
   * search.php 回傳的是
   * 本次真正執行的單一 Branch。
   * -------------------------
   */
  if (
    data.branch
    && typeof data.branch === 'object'
    && ['A', 'B', 'C'].includes(data.branch.code)
  ) {
    state.activeBranch = data.branch.code;

    /*
     * 也同步更新該 Branch，
     * 避免前端資料與後端不同步。
     */
    state.branches[data.branch.code] = {
      ...(state.branches[data.branch.code] || {}),
      ...data.branch,
    };
  }

  /*
   * search.php 現在的 target_profile
   * 已經會回傳「目前 Branch」的 Target。
   */
  state.targetProfile =
    data.target_profile
    || state.branches[state.activeBranch]?.target_profile
    || state.baseTarget
    || {};

  state.featureWeights =
    data.feature_weights
    || state.branches[state.activeBranch]?.feature_weights
    || {};

  state.constraints =
    Array.isArray(data.constraints)
      ? data.constraints
      : (
          state.branches[state.activeBranch]?.constraints
          || []
        );

  state.exclusionTerms =
    Array.isArray(data.exclusion_terms)
      ? data.exclusion_terms
      : [];

  /*
   * search_plan 現在代表
   * 目前 activeBranch 的搜尋詞。
   */
  state.searchPlan =
    Array.isArray(data.search_plan)
      ? data.search_plan
      : (
          state.branches[state.activeBranch]?.search_plan
          || []
        );

  if (
    data.analysis_config
    && typeof data.analysis_config === 'object'
  ) {
    state.analysisConfig =
      data.analysis_config;
  }

  applyPublicConfig(
    data.public_config
  );
}

function renderDerivedPreview() {
  targetPreview.replaceChildren();
  Object.entries(state.targetProfile).forEach(([key, value]) => {
    const wrapper = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = TARGET_LABELS[key] || key;
    detail.textContent = formatTargetValue(key, Number(value));
    wrapper.append(term, detail);
    targetPreview.appendChild(wrapper);
  });

  if (!targetPreview.children.length) {
    const empty = document.createElement('p');
    empty.textContent = '目前概念主要用於內容搜尋，沒有強制指定色彩數值。';
    targetPreview.appendChild(empty);
  }

  searchPlanPreview.replaceChildren();
  state.searchPlan.forEach((plan) => {
    const item = document.createElement('li');
    item.innerHTML = `<strong>${escapeHtml(plan.query)}</strong><span>${Math.round((plan.weight || 0) * 100)}%</span>`;
    searchPlanPreview.appendChild(item);
  });
}

async function searchPhotos(append) {
  const requestedBranch = state.activeBranch;
  const requestedPage = state.page;
  const requestedQuery = state.query;
  const requestId = ++state.requestSequence;
  state.activeRequestId = requestId;

  const branchName =
    state.branches[requestedBranch]?.name
    || requestedBranch;

  setLoading(
    true,
    append
      ? `正在載入更多 ${branchName} 方向圖片…`
      : `正在搜尋 ${branchName} 方向圖片…`,
  );

  try {
    const response = await fetch('../api/search.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        q: requestedQuery,
        branch_id: requestedBranch,
        page: requestedPage,
        per_page: state.publicConfig.defaultPerPage,
        interpretation: state.interpretation,
      }),
    });
    const data = await response.json().catch(() => null);

    /*
     * 如果使用者已經開始另一個搜尋 / 切換方向，
     * 舊 response 不可以回頭覆蓋新畫面。
     */
    if (
      requestId !== state.activeRequestId
      || requestedBranch !== state.activeBranch
      || requestedQuery !== state.query
    ) {
      return;
    }

    if (!response.ok || !data?.ok) {
      throw new Error(data?.message || `搜尋失敗（HTTP ${response.status}）`);
    }

    state.totalPages = Math.max(1, Number(data.total_pages) || 1);
    state.interpretation = data.interpretation;
    applyDerivedData(data);
    const newPhotos = Array.isArray(data.results) ? data.results : [];

    if (!append) {
      state.photos = [];
      state.selectedDirection = null;
    }

    mergePhotos(newPhotos);
    renderSearchSummary(data);

    if (!state.photos.length) {
      renderBranchDirections();
      statusMessage.textContent =
        `${state.activeBranch} 方向目前沒有找到候選圖片，可切換其他方向或修改描述。`;
    } else {
      await analyzeCurrentPhotos();
    }

    if (requestId !== state.activeRequestId) {
      return;
    }

    loadMoreButton.hidden =
      state.page >= state.totalPages
      || newPhotos.length === 0;
  } catch (error) {
    if (requestId !== state.activeRequestId) {
      return;
    }

    if (state.page > 1) {
      state.page -= 1;
    }
    showError(error instanceof Error ? error.message : '發生未知錯誤。');
  } finally {
    if (requestId === state.activeRequestId) {
      setLoading(false);
    }
  }
}

function mergePhotos(newPhotos) {
  const map = new Map(state.photos.map((photo) => [String(photo.id), photo]));
  newPhotos.forEach((photo) => map.set(String(photo.id), { ...map.get(String(photo.id)), ...photo }));
  state.photos = [...map.values()];
}

async function analyzeCurrentPhotos()  {
  const analysisVersion =
    ++state.analysisVersion;

  statusMessage.classList.remove(
    'is-error'
  );

  statusMessage.textContent =
    `正在分析 ${state.activeBranch} 方向的 ${state.photos.length} 張圖片，計算 OKLab／OKLCH 特徵與符合度…`;

  const analysis =
    await window.ToneAnalyzer.analyze(
      state.photos,
      {
        concurrency:
          Number(
            state.analysisConfig.concurrency
          )
          || 5,

        scoringConfig:
          state.analysisConfig,

        /*
         * 現在這裡放的是
         * activeBranch 的 Target。
         */
        targetProfile:
          state.targetProfile,

        featureWeights:
          state.featureWeights,

        constraints:
          state.constraints,

        exclusionTerms:
          state.exclusionTerms,

        onProgress(
          completed,
          total
        ) {
          if (
            analysisVersion
            !== state.analysisVersion
          ) {
            return;
          }

          statusMessage.textContent =
            `${state.activeBranch} 方向像素分析與符合度計算：${completed} / ${total} 張`;
        },
      }
    );

  if (
    analysisVersion
    !== state.analysisVersion
  ) {
    return;
  }

  /*
   * ToneAnalyzer 目前仍可能回傳
   * analysis.directions，
   * 但 app.js 從現在開始不再使用它
   * 定義 A / B / C。
   */
  state.directions = [];

  state.analysisMeta =
    analysis.meta;

  state.scoreMap =
    new Map(
      (
        analysis.scoredPhotos
        || []
      ).map(
        (score) => [
          String(
            score.photoId
          ),
          score,
        ]
      )
    );

  /*
   * 把目前 Branch 搜回來的圖片，
   * 加上像素符合度。
   */
  state.photos =
    state.photos
      .map(
        (photo) => ({
          ...photo,

          score:
            state.scoreMap.get(
              String(photo.id)
            )
            || null,
        })
      )
      .sort(
        (a, b) =>
          (
            b.score?.finalScore
            || 0
          )
          -
          (
            a.score?.finalScore
            || 0
          )
      );

  /*
   * 同一瀏覽器搜尋期間，同一 provider photo id 只歸給目前已看過的
   * A/B/C 中分數最高的方向。這不是完整 server-side shared session，
   * 但可以先避免使用者切換方向時同一張圖一直重複出現。
   */
  state.photos.forEach((photo) => {
    const photoId = String(photo?.id || '');
    const score = Number(photo?.score?.finalScore) || 0;
    if (!photoId || photo?.score?.qualified === false) {
      return;
    }

    const owner = state.photoOwnership.get(photoId);
    if (!owner || score > Number(owner.score || 0) + 0.03 || owner.branch === state.activeBranch) {
      state.photoOwnership.set(photoId, {
        branch: state.activeBranch,
        score,
      });
    }
  });

  /*
   * A/B/C 顯示改由 BranchBuilder 資料負責。
   */
  renderBranchDirections();

  renderVisiblePhotos();
  updateResultStatus();
}

function renderSearchSummary(data) {
  const queries = (data.search_plan || []).map((item) => item.query).join('／');
  const providers = (data.providers || []).map((item) => item.name).filter(Boolean).join('＋');
  const errorCount = Array.isArray(data.provider_errors) ? data.provider_errors.length : 0;
  const sourceText = providers ? `・來源 ${escapeHtml(providers)}` : '';
  const warningText = errorCount > 0 ? `・${errorCount} 筆圖庫請求未成功` : '';

  const branchName =
  data.branch?.name
  || state.branches[state.activeBranch]?.name
  || state.activeBranch;

searchSummary.innerHTML =
  `你的描述：<strong>${escapeHtml(data.input)}</strong><br>` +
  `目前方向：<strong>${escapeHtml(state.activeBranch)}・${escapeHtml(branchName)}</strong><br>` +
  `搜尋線索：<strong>${escapeHtml(queries || '未建立')}</strong>` +
  `${sourceText}・本頁合併 ${Number(data.candidate_count) || 0} 張候選圖${warningText}`;
}

function renderPhotos(photos) {
  const fragment = document.createDocumentFragment();
  photos.forEach((photo) => {
    const node = cardTemplate.content.cloneNode(true);
    const card = node.querySelector('.photo-card');
    const photoLink = node.querySelector('.photo-link');
    const image = node.querySelector('.photo-image');
    const score = node.querySelector('.photo-score');
    const description = node.querySelector('.photo-description');
    const photographerLink = node.querySelector('.photographer-link');
    const providerLink = node.querySelector('.provider-link');

    card.style.setProperty('--placeholder', photo.color || '#e9e8e4');
    photoLink.href = photo.photo_url || '#';
    photoLink.style.backgroundColor = photo.color || '#e9e8e4';
    image.src = photo.image_small;
    image.alt = photo.alt || `${photo.provider_name || '圖庫'} photo`;
    image.width = Number(photo.width) || 800;
    image.height = Number(photo.height) || 600;
    description.textContent = photo.alt || '未提供圖片描述';
    photographerLink.textContent = photo.photographer || `${photo.provider_name || '圖庫'} photographer`;
    photographerLink.href = photo.photographer_url || photo.photo_url || '#';
    providerLink.textContent = photo.provider_name || '圖片來源';
    providerLink.href = photo.provider_url || photo.photo_url || '#';

    if (photo.score) {
      score.textContent = `綜合符合 ${Math.round(photo.score.finalScore * 100)}%`;
      score.title =
        `內容 ${Math.round((photo.score.semanticScore || 0) * 100)}%・` +
        `主題元素 ${Math.round((photo.score.themeElementScore || 0) * 100)}%・` +
        `配色參考 ${Math.round((photo.score.paletteReferenceScore || 0) * 100)}%・` +
        `色彩 ${Math.round((photo.score.colorMatch || 0) * 100)}%・` +
        `交集 ${Math.round((photo.score.queryOverlapScore || 0) * 100)}%・` +
        `主色占比 ${Math.round((photo.score.dominantColorRatio || 0) * 100)}%・` +
        `有效色數 ${Math.round(photo.score.significantColorCount || 0)}・` +
        `Gate ${escapeHtml(photo.score.gateStatus || photo.content_gate_status || 'CANDIDATE')}`;
    } else {
      score.hidden = true;
    }

    fragment.appendChild(node);
  });
  photoGrid.appendChild(fragment);
}

function renderVisiblePhotos() {
  photoGrid.replaceChildren();

  const qualified = state.photos.filter((photo) => {
    if (photo.score?.qualified === false) {
      return false;
    }

    const owner = state.photoOwnership.get(String(photo?.id || ''));
    return !owner || owner.branch === state.activeBranch;
  });

  /*
   * 前端像素 dHash 近似去重：
   * 同一張圖的縮圖 / 微幅裁切 / 連續近似版本會優先只留高分者。
   * 沒有 pixel hash（CORS fallback）的圖片仍可保留。
   */
  const visible = [];
  const keptHashes = [];
  const photographerCounts = new Map();

  qualified.forEach((photo) => {
    const hash = String(photo?.score?.perceptualHash || '');
    const photographer = String(photo?.photographer || '').trim().toLowerCase();

    const nearDuplicate =
      hash.length === 16
      && keptHashes.some((keptHash) => hammingHexDistance(hash, keptHash) <= 5);

    if (nearDuplicate) {
      return;
    }

    if (
      photographer
      && (photographerCounts.get(photographer) || 0) >= 2
    ) {
      return;
    }

    visible.push(photo);

    if (hash.length === 16) {
      keptHashes.push(hash);
    }

    if (photographer) {
      photographerCounts.set(
        photographer,
        (photographerCounts.get(photographer) || 0) + 1,
      );
    }
  });

  renderPhotos(visible);
}

function hammingHexDistance(firstHash, secondHash) {
  if (firstHash.length !== secondHash.length) {
    return Number.POSITIVE_INFINITY;
  }

  let distance = 0;

  for (let index = 0; index < firstHash.length; index += 1) {
    const first = Number.parseInt(firstHash[index], 16);
    const second = Number.parseInt(secondHash[index], 16);

    if (!Number.isFinite(first) || !Number.isFinite(second)) {
      return Number.POSITIVE_INFINITY;
    }

    let xor = first ^ second;
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }

  return distance;
}

function renderBranchDirections() {
  directionGrid.replaceChildren();

  const branches =
    ['A', 'B', 'C']
      .map(
        (code) =>
          state.branches[code]
      )
      .filter(Boolean);

  if (branches.length !== 3) {
    directionSection.hidden = true;
    return;
  }

  directionSection.hidden = false;

  directionNote.textContent =
    'A／B／C 已於圖片搜尋前依共同 Base Target 建立；B 為最接近原始需求的核心方向，A 與 C 為不同視覺延伸。';

  const fragment =
    document.createDocumentFragment();

  branches.forEach(
    (branch) => {
      const node =
        directionTemplate.content
          .cloneNode(true);

      const card =
        node.querySelector(
          '.direction-card'
        );

      const code =
        node.querySelector(
          '.direction-code'
        );

      const score =
        node.querySelector(
          '.direction-score'
        );

      const name =
        node.querySelector(
          '.direction-name'
        );

      const description =
        node.querySelector(
          '.direction-description'
        );

      const palette =
        node.querySelector(
          '.direction-palette'
        );

      const tags =
        node.querySelector(
          '.direction-tags'
        );

      const accessibility =
        node.querySelector(
          '.direction-accessibility'
        );

      const metricsList =
        node.querySelector(
          '.direction-metrics'
        );

      const button =
        node.querySelector(
          '.direction-button'
        );

      const isSelected =
        state.activeBranch
        === branch.code;

      card.classList.toggle(
        'is-selected',
        isSelected
      );

      code.textContent =
        branch.code;

      score.textContent =
        branch.code === 'B'
          ? '核心基準'
          : '延伸方向';

      name.textContent =
        branch.name
        || branch.code;

      description.textContent =
        branch.description
        || '';

      /*
       * Branch 此時還不是由某張圖片產生，
       * 因此還沒有實際 palette。
       */
      if (palette) {
        palette.hidden = true;
      }

      /*
       * 顯示相較 Base 的主要差異。
       */
      if (tags) {
        renderBranchDeltaTags(
          tags,
          branch
        );
      }

      /*
       * WCAG 是實際色票產生後才檢查，
       * Branch Target 階段先不顯示。
       */
      if (accessibility) {
        accessibility.hidden = true;
      }

      renderBranchTargetMetrics(
        metricsList,
        branch
      );

      button.textContent =
        isSelected
          ? '目前顯示此方向'
          : `搜尋 ${branch.code} 方向圖片`;

      button.setAttribute(
        'aria-pressed',
        String(isSelected)
      );

      button.addEventListener(
        'click',
        async () => {
          if (
            state.loading
            || state.activeBranch
              === branch.code
          ) {
            return;
          }

          /*
           * 切換真正的 Branch。
           */
          state.activeBranch =
            branch.code;

          /*
           * 每個方向切換時
           * 從第 1 頁重新開始。
           */
          state.page = 1;
          state.totalPages = 1;

          /*
           * 將目前分析目標
           * 切成該 Branch Target。
           */
          state.targetProfile =
            branch.target_profile
            || {};

          state.featureWeights =
            branch.feature_weights
            || state.featureWeights;

          state.constraints =
            Array.isArray(
              branch.constraints
            )
              ? branch.constraints
              : [];

          state.searchPlan =
            Array.isArray(
              branch.search_plan
            )
              ? branch.search_plan
              : [];

          /*
           * 不可以讓上一個 Branch
           * 的圖片留在新的 Branch。
           */
          state.photos = [];
          state.scoreMap =
            new Map();

          state.analysisMeta =
            null;

          state.analysisVersion += 1;

          photoGrid.replaceChildren();

          /*
           * 先更新按鈕選取狀態。
           */
          renderBranchDirections();
          renderDerivedPreview();

          /*
           * 真正送：
           * branch_id = A / B / C
           */
          await searchPhotos(false);

          document
            .querySelector(
              '.result-header'
            )
            ?.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
            });
        }
      );

      fragment.appendChild(
        node
      );
    }
  );

  directionGrid.appendChild(
    fragment
  );
}
function renderBranchTargetMetrics(
  container,
  branch
) {
  if (!container) return;

  container.replaceChildren();

  const target =
    branch.target_profile
    || {};

  const entries = [
    [
      '明度',
      formatTargetValue(
        'meanLightness',
        Number(
          target.meanLightness
          ?? 0
        )
      ),
    ],

    [
      '色度',
      formatTargetValue(
        'meanChroma',
        Number(
          target.meanChroma
          ?? 0
        )
      ),
    ],

    [
      '冷暖',
      formatTargetValue(
        'temperature',
        Number(
          target.temperature
          ?? 0
        )
      ),
    ],

    [
      '對比',
      formatTargetValue(
        'contrast',
        Number(
          target.contrast
          ?? 0
        )
      ),
    ],

    [
      '視覺重量',
      formatTargetValue(
        'visualWeight',
        Number(
          target.visualWeight
          ?? 0
        )
      ),
    ],

    [
      '中性色比例',
      formatTargetValue(
        'neutralRatio',
        Number(
          target.neutralRatio
          ?? 0
        )
      ),
    ],

    [
      '深色比例',
      formatTargetValue(
        'darkRatio',
        Number(
          target.darkRatio
          ?? 0
        )
      ),
    ],
  ];

  entries.forEach(
    ([label, value]) => {
      const wrapper =
        document.createElement(
          'div'
        );

      const term =
        document.createElement(
          'dt'
        );

      const detail =
        document.createElement(
          'dd'
        );

      term.textContent =
        label;

      detail.textContent =
        value;

      wrapper.append(
        term,
        detail
      );

      container.appendChild(
        wrapper
      );
    }
  );
}
function renderBranchDeltaTags(
  container,
  branch
) {
  container.replaceChildren();

  const delta =
    branch.delta_from_base
    || {};

  const labels = {
    meanLightness: '明度',
    meanChroma: '色度',
    temperature: '冷暖',
    contrast: '對比',
    visualWeight: '重量',
    neutralRatio: '中性',
    darkRatio: '深色',
  };

  const meaningful =
    Object.entries(delta)
      .filter(
        ([, value]) =>
          Math.abs(
            Number(value)
          ) >= 0.01
      )
      .sort(
        (
          [, valueA],
          [, valueB]
        ) =>
          Math.abs(
            Number(valueB)
          )
          -
          Math.abs(
            Number(valueA)
          )
      )
      .slice(0, 4);

  /*
   * B 通常全部都是 0。
   */
  if (!meaningful.length) {
    const tag =
      document.createElement(
        'span'
      );

    tag.textContent =
      '維持 Base';

    container.appendChild(
      tag
    );

    return;
  }

  meaningful.forEach(
    ([key, rawValue]) => {
      const value =
        Number(rawValue);

      const sign =
        value > 0
          ? '+'
          : '';

      const tag =
        document.createElement(
          'span'
        );

      tag.textContent =
        `${labels[key] || key} ${sign}${Math.round(value * 100)}%`;

      container.appendChild(
        tag
      );
    }
  );
}
function renderToneDirections(directions) {
  directionGrid.replaceChildren();
  if (directions.length !== 3) {
    directionSection.hidden = true;
    return;
  }

  directionSection.hidden = false;
  const meta = state.analysisMeta;
  directionNote.textContent =
    `從 ${meta?.analyzedCount || state.photos.length} 張候選圖中保留 ${meta?.qualifiedCount || 0} 張高符合圖片，` +
    `再依完整色彩特徵分成三個方向。` +
    (meta?.lowSeparation ? '目前三群色調差距較細微。' : '三群具有明顯感知差異。');

  const fragment = document.createDocumentFragment();
  directions.forEach((direction) => {
    const node = directionTemplate.content.cloneNode(true);
    const card = node.querySelector('.direction-card');
    const code = node.querySelector('.direction-code');
    const score = node.querySelector('.direction-score');
    const name = node.querySelector('.direction-name');
    const description = node.querySelector('.direction-description');
    const palette = node.querySelector('.direction-palette');
    const tags = node.querySelector('.direction-tags');
    const accessibility = node.querySelector('.direction-accessibility');
    const metricsList = node.querySelector('.direction-metrics');
    const button = node.querySelector('.direction-button');
    const isSelected = state.selectedDirection === direction.code;

    card.classList.toggle('is-selected', isSelected);
    code.textContent = direction.code;
    score.textContent = `${direction.sampleCount} 張・符合 ${direction.matchScore}%`;
    name.textContent = direction.name;
    description.textContent = direction.description;

    direction.palette.forEach((color) => {
      const swatch = document.createElement('span');
      swatch.className = 'direction-swatch';
      swatch.style.backgroundColor = color.hex;
      swatch.title = `${color.hex}・約 ${Math.round(color.ratio * 100)}%`;
      palette.appendChild(swatch);
    });

    direction.tags.forEach((tagText) => {
      const tag = document.createElement('span');
      tag.textContent = tagText;
      tags.appendChild(tag);
    });

    accessibility.textContent = direction.accessibility.passesAA
      ? `最深／最淺色對比 ${direction.accessibility.ratio}:1，通過一般文字 AA`
      : `最深／最淺色對比 ${direction.accessibility.ratio}:1，套用文字時需另選高對比色`;
    accessibility.classList.toggle('is-pass', direction.accessibility.passesAA);
    accessibility.classList.toggle('is-warning', !direction.accessibility.passesAA);
    renderDirectionMetrics(metricsList, direction);

    button.textContent = isSelected ? '目前顯示此方向' : `查看 ${direction.code} 方向圖片`;
    button.setAttribute('aria-pressed', String(isSelected));
    button.addEventListener('click', () => {
      state.selectedDirection = direction.code;
      renderToneDirections(state.directions);
      renderVisiblePhotos();
      updateResultStatus();
      document.querySelector('.result-header')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    fragment.appendChild(node);
  });
  directionGrid.appendChild(fragment);
}

function renderDirectionMetrics(container, direction) {
  const metrics = direction.metrics;
  const entries = [
    ['明度', `${Math.round(metrics.meanLightness * 100)}%`],
    ['色度', metrics.meanChroma.toFixed(3)],
    ['冷暖', formatTemperature(metrics.temperature, metrics.neutralRatio)],
    ['對比', `${Math.round(metrics.contrast * 100)}%`],
    ['視覺重量', `${Math.round(metrics.visualWeight * 100)}%`],
    ['中性色比例', `${Math.round(metrics.neutralRatio * 100)}%`],
    ['深色比例', `${Math.round(metrics.darkRatio * 100)}%`],
    ['高彩度比例', `${Math.round(metrics.highChromaRatio * 100)}%`],
    ['色相集中度', `${Math.round(metrics.hueConcentration * 100)}%`],
    ['強調色比例', `${Math.round(metrics.accentRatio * 100)}%`],
  ];

  entries.forEach(([label, value]) => {
    const wrapper = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = value;
    wrapper.append(term, detail);
    container.appendChild(wrapper);
  });
}

function updateResultStatus() {
  statusMessage.classList.remove(
    'is-error'
  );

  const branch =
    state.branches[
      state.activeBranch
    ];

  const qualifiedCount =
    state.photos.filter(
      (photo) =>
        photo.score?.qualified
        !== false
    ).length;

  const excludedCount =
    Math.max(
      0,
      state.photos.length
      - qualifiedCount
    );

  statusMessage.textContent =
    `目前顯示 ${state.activeBranch}「${branch?.name || state.activeBranch}」方向的 ${qualifiedCount} 張高符合圖片；`
    +
    `另有 ${excludedCount} 張低符合候選未顯示。`;
}

function formatTargetValue(key, value) {
  if (key === 'temperature') {
    if (Math.abs(value) < 0.12) return '中性';
    return value > 0 ? `偏暖 ${Math.round(value * 100)}%` : `偏冷 ${Math.round(Math.abs(value) * 100)}%`;
  }
  if (key === 'meanChroma') return value.toFixed(3);
  return `${Math.round(value * 100)}%`;
}

function formatTemperature(value, neutralRatio) {
  if (neutralRatio >= 0.7 || Math.abs(value) < 0.16) return '中性';
  return value > 0 ? `偏暖 ${Math.round(value * 100)}%` : `偏冷 ${Math.round(Math.abs(value) * 100)}%`;
}

function setInterpretationLoading(isLoading) {
  searchButton.disabled = isLoading;
  searchButton.querySelector('span:first-child').textContent = isLoading ? '語意解析中…' : '解析描述';
}

function setLoading(isLoading, message = '') {
  state.loading = isLoading;
  confirmSearchButton.disabled = isLoading;
  loadMoreButton.disabled = isLoading;
  if (message) {
    statusMessage.classList.remove('is-error');
    statusMessage.textContent = message;
  }
}

function showError(message) {
  state.analysisVersion += 1;
  resultSection.hidden = false;
  directionSection.hidden = true;
  statusMessage.classList.add('is-error');
  statusMessage.textContent = message;
  loadMoreButton.hidden = true;
}

function resetAll() {
  window.clearTimeout(state.deriveTimer);
  state.query = '';
  state.interpretation = null;
  state.baseTarget = {};

state.branches = {
  A: null,
  B: null,
  C: null,
};

state.activeBranch = 'B';
  state.targetProfile = {};
  state.featureWeights = {};
  state.constraints = [];
  state.exclusionTerms = [];
  state.searchPlan = [];
  state.page = 1;
  state.totalPages = 1;
  state.photos = [];
  state.directions = [];
  state.selectedDirection = null;
  state.analysisMeta = null;
  state.scoreMap = new Map();
  state.photoOwnership = new Map();
  state.analysisVersion += 1;
  state.activeRequestId = ++state.requestSequence;
  window.ToneAnalyzer.clearCache();
  interpretationSection.hidden = true;
  resultSection.hidden = true;
  directionSection.hidden = true;
  conceptGroups.replaceChildren();
  photoGrid.replaceChildren();
  directionGrid.replaceChildren();
  statusMessage.textContent = '';
  searchSummary.textContent = '';
  textarea.value = '';
  characterCount.textContent = '0 / 300';
  textarea.focus();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
