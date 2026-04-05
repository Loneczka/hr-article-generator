// === STATE ===
let currentArticle = null;
let selectedCategoryId = null;
let selectedCategoryName = '';

// === DOM ELEMENTS ===
const generateForm = document.getElementById('generateForm');
const generateBtn = document.getElementById('generateBtn');
const previewEmpty = document.getElementById('previewEmpty');
const previewContent = document.getElementById('previewContent');
const previewLoading = document.getElementById('previewLoading');
const cardActions = document.getElementById('cardActions');
const publishSection = document.getElementById('publishSection');
const publishBtn = document.getElementById('publishBtn');
const publishStatus = document.getElementById('publishStatus');
const categorySelect = document.getElementById('category');
const toast = document.getElementById('toast');

// === INIT ===
async function init() {
  await loadCategories();
  setupRadioCards();
}

// === LOAD CATEGORIES ===
async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const categories = await res.json();
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      categorySelect.appendChild(opt);
    });
  } catch (e) {
    console.error('Błąd ładowania kategorii:', e);
  }
}

// === RADIO CARD SELECTION ===
function setupRadioCards() {
  // Ton
  document.querySelectorAll('#toneGroup .radio-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('#toneGroup .radio-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      card.querySelector('input').checked = true;
    });
  });

  // Długość
  document.querySelectorAll('#lengthGroup .length-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('#lengthGroup .length-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      card.querySelector('input').checked = true;
    });
  });
}

// === GENERATE ARTICLE ===
generateForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const topic = document.getElementById('topic').value.trim();
  if (!topic) return;

  const tone = document.querySelector('input[name="tone"]:checked').value;
  const length = document.querySelector('input[name="length"]:checked').value;
  const keywords = document.getElementById('keywords').value.trim();
  const catOption = categorySelect.options[categorySelect.selectedIndex];

  selectedCategoryId = categorySelect.value || null;
  selectedCategoryName = categorySelect.value ? catOption.textContent : 'HR';

  // UI state — loading
  setGenerating(true);
  showPreviewLoading();

  const focusKeyphrase = document.getElementById('focusKeyphrase').value.trim();

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, tone, length, keywords, category: selectedCategoryName, focusKeyphrase }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Nieznany błąd');
    }

    currentArticle = data.article;
    displayArticle(data.article, selectedCategoryName, data.research, data.researched);
    showToast('Artykuł wygenerowany! ✦', 'success');
  } catch (err) {
    console.error(err);
    showPreviewEmpty();
    showToast('Błąd: ' + err.message, 'error');
  } finally {
    setGenerating(false);
  }
});

function setGenerating(loading) {
  generateBtn.disabled = loading;
  if (loading) {
    generateBtn.classList.add('loading');
    generateBtn.querySelector('.btn-text').textContent = 'Generuję';
  } else {
    generateBtn.classList.remove('loading');
    generateBtn.querySelector('.btn-text').textContent = 'Generuj artykuł';
  }
}

// === DISPLAY ARTICLE ===
function displayArticle(article, categoryName, research, researched) {
  document.getElementById('articleTitle').textContent = article.title || '';
  document.getElementById('articleSeoTitle').textContent = article.seo_title || article.title || '';
  document.getElementById('articleMeta').textContent = article.meta_description || '';
  document.getElementById('articleSlug').textContent = article.slug || '';
  document.getElementById('articleKeyphrase').textContent = article.focus_keyphrase || '';
  document.getElementById('articleContent').innerHTML = article.content || '';

  // Tags
  const tagsEl = document.getElementById('articleTags');
  tagsEl.innerHTML = '';
  (article.tags || []).forEach(tag => {
    const span = document.createElement('span');
    span.className = 'tag';
    span.textContent = tag;
    tagsEl.appendChild(span);
  });

  // Meta
  document.getElementById('metaCategory').textContent = categoryName || 'HR';
  const wordCount = (article.content || '').replace(/<[^>]*>/g, '').trim().split(/\s+/).length;
  document.getElementById('metaWords').textContent = `~${wordCount} słów`;

  // Research badge
  const researchBadge = document.getElementById('researchBadge');
  const researchSources = document.getElementById('researchSources');
  if (researched && research && research.length > 0) {
    researchBadge.style.display = 'flex';
    researchSources.innerHTML = research.map((r, i) =>
      `<div class="source-item">
        <span class="source-num">${i + 1}</span>
        <span class="source-title">${r.title}</span>
        <a href="${r.url}" target="_blank" class="source-url">${new URL(r.url).hostname}</a>
      </div>`
    ).join('');
  } else {
    researchBadge.style.display = 'none';
  }

  // SEO Tips
  const seoTips = document.getElementById('seoTips');
  const seoTipsList = document.getElementById('seoTipsList');
  if (article.seo_score_tips && article.seo_score_tips.length > 0) {
    seoTipsList.innerHTML = article.seo_score_tips.map(tip => `<li>${tip}</li>`).join('');
    seoTips.style.display = 'block';
  } else {
    seoTips.style.display = 'none';
  }

  previewLoading.style.display = 'none';
  previewEmpty.style.display = 'none';
  previewContent.style.display = 'block';
  cardActions.style.display = 'flex';
  publishSection.style.display = 'block';
  publishStatus.innerHTML = '';
  publishStatus.className = 'publish-status';
}

// Toggle sources
document.getElementById('toggleSources').addEventListener('click', () => {
  const sources = document.getElementById('researchSources');
  const btn = document.getElementById('toggleSources');
  const visible = sources.style.display !== 'none';
  sources.style.display = visible ? 'none' : 'block';
  btn.textContent = visible ? 'Pokaż źródła ▾' : 'Ukryj źródła ▴';
});

function showPreviewLoading() {
  previewEmpty.style.display = 'none';
  previewContent.style.display = 'none';
  previewLoading.style.display = 'flex';
  cardActions.style.display = 'none';
  publishSection.style.display = 'none';
}

function showPreviewEmpty() {
  previewEmpty.style.display = 'flex';
  previewContent.style.display = 'none';
  previewLoading.style.display = 'none';
}

// === COPY BUTTON ===
document.getElementById('copyBtn').addEventListener('click', () => {
  const title = document.getElementById('articleTitle').textContent;
  const content = document.getElementById('articleContent').innerHTML;
  const text = `${title}\n\n${content.replace(/<[^>]*>/g, '')}`;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Skopiowano do schowka!', 'info');
  });
});

// === PUBLISH ===
publishBtn.addEventListener('click', async () => {
  if (!currentArticle) return;

  // Pobierz aktualną (być może edytowaną) treść
  const title = document.getElementById('articleTitle').textContent.trim();
  const content = document.getElementById('articleContent').innerHTML.trim();
  const meta_description = document.getElementById('articleMeta').textContent.trim();
  const seo_title = document.getElementById('articleSeoTitle').textContent.trim();
  const slug = document.getElementById('articleSlug').textContent.trim();
  const focus_keyphrase = document.getElementById('articleKeyphrase').textContent.trim();

  publishBtn.disabled = true;
  publishBtn.querySelector('.btn-text').textContent = 'Publikuję…';
  publishStatus.innerHTML = '';
  publishStatus.className = 'publish-status';

  try {
    const res = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        content,
        meta_description,
        seo_title,
        slug,
        focus_keyphrase,
        tags: currentArticle.tags || [],
        category_id: selectedCategoryId,
        status: 'draft',
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Błąd WordPress API');
    }

    publishStatus.innerHTML = `✅ Opublikowano jako szkic! <a href="${data.edit_url}" target="_blank" rel="noopener">Edytuj w WordPress →</a>`;
    publishStatus.className = 'publish-status success';
    showToast('Artykuł opublikowany jako szkic! 🎉', 'success');
  } catch (err) {
    publishStatus.innerHTML = `❌ ${err.message}`;
    publishStatus.className = 'publish-status error';
    showToast('Błąd publikacji: ' + err.message, 'error');
  } finally {
    publishBtn.disabled = false;
    publishBtn.querySelector('.btn-text').textContent = 'Opublikuj jako szkic';
  }
});

// === TOAST ===
let toastTimer;
function showToast(message, type = 'info') {
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

// === START ===
init();
