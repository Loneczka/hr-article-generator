require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// === KATEGORIE WORDPRESS ===
const CATEGORIES = [
  { id: 1, name: 'Analityka HR', slug: 'analityka-hr' },
  { id: 3, name: 'Case studies i inspiracje', slug: 'case-studies-i-inspiracje' },
  { id: 4, name: 'HR', slug: 'hr' },
  { id: 5, name: 'Motywacja i zaangażowanie', slug: 'motywacja-i-zaangazowanie' },
  { id: 6, name: 'Poradniki i wskazówki', slug: 'poradniki-i-wskazowki' },
  { id: 7, name: 'Prawo pracy i regulacje', slug: 'prawo-pracy-i-regulacje' },
  { id: 8, name: 'Rekrutacja i Onboarding', slug: 'rekrutacja-i-onboarding' },
  { id: 9, name: 'Rozwój i szkolenia', slug: 'rozwoj-i-szkolenia' },
  { id: 10, name: 'Technologie w HR', slug: 'technologie-w-hr' },
  { id: 11, name: 'Trendy i przyszłość HR', slug: 'trendy-i-przyszlosc-hr' },
];

// === GET CATEGORIES ===
app.get('/api/categories', (req, res) => {
  res.json(CATEGORIES);
});

// === WEB RESEARCH ===
async function doWebResearch(topic, keywords) {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !cx) return null;

  const query = encodeURIComponent(`${topic} HR ${keywords || ''} polska`);
  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${query}&num=5&lr=lang_pl&hl=pl`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.items || data.items.length === 0) return null;

    // Zbierz snippety z wyników wyszukiwania
    const results = data.items.map((item, i) => ({
      position: i + 1,
      title: item.title,
      snippet: item.snippet,
      url: item.link,
    }));

    return results;
  } catch (err) {
    console.error('Błąd wyszukiwania:', err.message);
    return null;
  }
}

// === POBIERZ ISTNIEJĄCE POSTY Z BLOGA (do linkowania wewnętrznego) ===
async function fetchExistingPosts() {
  const wpUrl = (process.env.WORDPRESS_URL || "").replace("hrly.pl", "hrly.pl/wp").replace("/wp/wp", "/wp");
  const username = process.env.WORDPRESS_USERNAME;
  const appPassword = process.env.WORDPRESS_APP_PASSWORD;
  const credentials = Buffer.from(`${username}:${appPassword}`).toString('base64');

  try {
    const res = await fetch(
      `${wpUrl}/wp-json/wp/v2/posts?per_page=20&status=publish&_fields=id,title,link`,
      { headers: { 'Authorization': `Basic ${credentials}` } }
    );
    if (!res.ok) return [];
    const posts = await res.json();
    return posts.map(p => ({ title: p.title.rendered, url: p.link }));
  } catch (e) {
    console.error('Błąd pobierania postów:', e.message);
    return [];
  }
}

// === GENERATE ARTICLE ===
app.post('/api/generate', async (req, res) => {
  const { topic, tone, length, keywords, category, focusKeyphrase } = req.body;

  if (!topic) {
    return res.status(400).json({ error: 'Temat artykułu jest wymagany.' });
  }

  const wordCounts = { short: 500, medium: 1000, long: 1500 };
  const targetWords = wordCounts[length] || 1000;

  const toneMap = {
    professional: 'profesjonalny, merytoryczny, biznesowy',
    friendly: 'przyjazny, przystępny, angażujący',
    expert: 'ekspercki, analityczny, oparty na danych i badaniach',
  };
  const toneDesc = toneMap[tone] || toneMap.professional;

  // === RESEARCH W SIECI ===
  console.log(`🔍 Wyszukuję informacje o: "${topic}"...`);
  const [searchResults, existingPosts] = await Promise.all([
    doWebResearch(topic, keywords),
    fetchExistingPosts(),
  ]);

  let researchContext = '';
  let searchSummary = [];

  if (searchResults && searchResults.length > 0) {
    console.log(`✅ Znaleziono ${searchResults.length} wyników`);
    searchSummary = searchResults.map(r => ({ title: r.title, url: r.url }));

    researchContext = `
### AKTUALNY RESEARCH Z INTERNETU (użyj tych informacji w artykule):
${searchResults.map(r =>
  `[${r.position}] "${r.title}"
  Treść: ${r.snippet}
  Źródło: ${r.url}`
).join('\n\n')}

Na podstawie powyższego researchu stwórz artykuł, który:
- Uwzględnia aktualne trendy i dane z polskiego internetu
- Jest bardziej szczegółowy i wartościowy niż konkurencja
- Cytuje lub parafrazuje relevantne informacje z researchu
`;
  } else {
    console.log('⚠️ Brak wyników wyszukiwania, generuję bez researchu');
  }

  const mainKeyphrase = focusKeyphrase || (keywords ? keywords.split(',')[0].trim() : topic);

  const prompt = `Jesteś ekspertem HR, copywriterem i specjalistą SEO (Yoast SEO). Napisz artykuł blogowy na temat: "${topic}".

FRAZA KLUCZOWA (FOCUS KEYPHRASE): "${mainKeyphrase}"
MUSISZ ją użyć:
- Na POCZĄTKU tytułu SEO (pierwsze słowa tytułu)
- W PIERWSZYM zdaniu wstępu artykułu
- W co najmniej 2 nagłówkach H2
- W treści artykułu (gęstość 1-2%)
- W meta description
- W slug URL

WYMAGANIA:
- Język: polski
- Ton: ${toneDesc}
- Długość: około ${targetWords} słów (WAŻNE: nie skracaj)
- Kategoria: ${category || 'HR'}
${keywords ? `Dodatkowe słowa kluczowe: ${keywords}` : ''}

${researchContext}

=== ZASADY CZYTELNOŚCI (Yoast — OBOWIĄZKOWE) ===
1. KRÓTKIE ZDANIA: Maksymalnie 85% zdań powinno mieć PONIŻEJ 20 słów. Pisz zwięzłe, konkretne zdania. Dziel długie zdania na krótsze.
2. SŁOWA PRZEJŚCIA (transition words): Co najmniej 30% zdań MUSI zawierać słowa przejścia. Używaj obficie tych polskich słów przejścia:
   - Dodawanie: ponadto, dodatkowo, co więcej, oprócz tego, również, także, poza tym
   - Przeciwstawienie: jednakże, jednak, natomiast, z drugiej strony, mimo to, niemniej, chociaż
   - Przyczyna/skutek: dlatego, w rezultacie, w konsekwencji, w efekcie, z tego powodu, dzięki temu
   - Przykład: na przykład, między innymi, w szczególności, mianowicie
   - Podsumowanie: przede wszystkim, podsumowując, w związku z tym, ogólnie rzecz biorąc, warto podkreślić
   - Kolejność: po pierwsze, po drugie, następnie, w pierwszej kolejności, kolejnym krokiem
3. AKAPITY: Krótkie akapity (max 3-4 zdania). Każdy akapit zaczynaj od słowa przejścia gdy to możliwe.
4. PODTYTUŁY: Używaj nagłówków H2 i H3 co 100-150 słów.

=== STRUKTURA ARTYKUŁU ===
1. Wstęp (2-3 krótkie zdania) — PIERWSZE zdanie MUSI zawierać frazę kluczową "${mainKeyphrase}"
2. Minimum 5 sekcji z nagłówkami H2 (2+ nagłówki zawierają frazę kluczową)
3. Konkretne fakty, przykłady, praktyczne wskazówki
4. Listy punktowane (ul/li) — przynajmniej 2
5. LINKI ZEWNĘTRZNE: 2-3 linki do autorytatywnych źródeł (np. Harvard Business Review, Deloitte, SHRM, PIP, Kodeks Pracy) w formacie <a href="URL" target="_blank" rel="noopener">tekst</a>
6. LINKI WEWNĘTRZNE: Dodaj 2-3 linki do ISTNIEJĄCYCH artykułów na blogu hrly.pl. UWAGA: hrly.pl to aplikacja do badania zaangażowania i satysfakcji pracowników — NIE linkuj do strony głównej hrly.pl, bo nie ma tam treści edukacyjnych. Linkuj TYLKO do artykułów blogowych poniżej:
${existingPosts.length > 0 ? existingPosts.map(p => `   - <a href="${p.url}">${p.title}</a>`).join('\n') : '   - <a href="https://hrly.pl/blog/">Blog HR hrly.pl</a>'}
   Wybierz 2-3 artykuły najbardziej powiązane tematycznie z aktualnym tematem. Jeśli żaden nie pasuje, linkuj do https://hrly.pl/blog/
7. Podsumowanie z CTA (np. "Sprawdź jak hrly.pl pomaga badać zaangażowanie pracowników")

=== ZASADY SEO (Yoast — zielone światło) ===
- Tytuł SEO (seo_title): ZACZYNA SIĘ od "${mainKeyphrase}", max 55 znaków
- Meta description: 150-155 znaków, zawiera "${mainKeyphrase}", zachęca do kliknięcia
- Slug: krótki, zawiera frazę kluczową transliterowaną (bez polskich znaków), małe litery z myślnikami
- Pierwszych 100 słów artykułu MUSI zawierać "${mainKeyphrase}"
- Gęstość frazy: 1-2%

Odpowiedz WYŁĄCZNIE czystym JSON (bez markdown):
{
  "title": "Tytuł artykułu (wyświetlany na stronie)",
  "seo_title": "${mainKeyphrase} - kontekst | hrly.pl (max 55 znaków, ZACZYNA SIĘ od frazy)",
  "meta_description": "Meta opis z frazą kluczową (150-155 znaków)",
  "slug": "fraza-kluczowa-transliterowana",
  "focus_keyphrase": "${mainKeyphrase}",
  "content": "Treść HTML z <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <a>. BEZ <h1>. KRÓTKIE ZDANIA. DUŻO SŁÓW PRZEJŚCIA.",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "seo_score_tips": ["wskazówka 1", "wskazówka 2"]
}`;

  // Próbuj kolejne modele — fallback jeśli limit wyczerpany
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro'];
  let lastError = null;

  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
      });

      console.log(`✍️ Generuję artykuł (${targetWords} słów) modelem ${modelName}...`);
      const result = await model.generateContent(prompt);
      const text = result.response.text();

      // Wyczyść markdown
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const article = JSON.parse(cleaned);

      console.log(`✅ Artykuł wygenerowany modelem ${modelName}: "${article.title}"`);

      return res.json({
        success: true,
        article,
        research: searchSummary,
        researched: searchSummary.length > 0,
        model_used: modelName,
      });
    } catch (err) {
      lastError = err;
      const is429 = err.status === 429 || (err.message && err.message.includes('429'));
      if (is429) {
        console.log(`⚠️ Model ${modelName} — limit wyczerpany, próbuję następny...`);
        continue;
      }
      // Inny błąd — nie próbuj dalej
      console.error(`Błąd generowania (${modelName}):`, err.message);
      break;
    }
  }

  console.error('Błąd generowania — wszystkie modele wyczerpane:', lastError?.message);
  res.status(500).json({
    error: 'Limit API wyczerpany dla wszystkich modeli. Sprawdź czy klucz API ma włączony Gemini API w Google Cloud Console (console.cloud.google.com → APIs & Services → Enable "Generative Language API").',
  });
});

// === PUBLISH TO WORDPRESS ===
app.post('/api/publish', async (req, res) => {
  const { title, content, meta_description, tags, category_id, status, slug, seo_title, focus_keyphrase } = req.body;

  const wpUrl = (process.env.WORDPRESS_URL || "").replace("hrly.pl", "hrly.pl/wp").replace("/wp/wp", "/wp");
  const username = process.env.WORDPRESS_USERNAME;
  const appPassword = process.env.WORDPRESS_APP_PASSWORD;
  const credentials = Buffer.from(`${username}:${appPassword}`).toString('base64');

  try {
    // Utwórz tagi
    let tagIds = [];
    for (const tagName of (tags || [])) {
      try {
        const tagRes = await fetch(`${wpUrl}/wp-json/wp/v2/tags`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: tagName }),
        });
        if (tagRes.ok) {
          const tagData = await tagRes.json();
          tagIds.push(tagData.id);
        } else {
          const searchRes = await fetch(`${wpUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(tagName)}`, {
            headers: { 'Authorization': `Basic ${credentials}` },
          });
          if (searchRes.ok) {
            const found = await searchRes.json();
            if (found.length > 0) tagIds.push(found[0].id);
          }
        }
      } catch (e) { /* ignoruj */ }
    }

    // Opublikuj post z polami Yoast SEO
    const postData = {
      title,
      content,
      status: status || 'draft',
      slug: slug || '',
      excerpt: meta_description || '',
      comment_status: 'closed',
      ping_status: 'closed',
      categories: category_id ? [parseInt(category_id)] : [],
      tags: tagIds,
      meta: {
        _yoast_wpseo_focuskw: focus_keyphrase || '',
        _yoast_wpseo_metadesc: meta_description || '',
        _yoast_wpseo_title: seo_title || title || '',
      },
    };

    const postRes = await fetch(`${wpUrl}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(postData),
    });

    const postResult = await postRes.json();

    if (!postRes.ok) throw new Error(postResult.message || 'Błąd WordPress API');

    console.log(`✅ Opublikowano szkic: "${title}" (ID: ${postResult.id})`);

    res.json({
      success: true,
      post_id: postResult.id,
      edit_url: `${wpUrl}/wp-admin/post.php?post=${postResult.id}&action=edit`,
      preview_url: postResult.link,
    });
  } catch (err) {
    console.error('Błąd publikacji:', err);
    res.status(500).json({ error: 'Błąd podczas publikacji: ' + err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 HR Article Generator działa na http://localhost:${PORT}`);
  console.log(`🔍 Research w sieci: ${process.env.GOOGLE_SEARCH_API_KEY ? '✅ aktywny' : '❌ brak klucza'}\n`);
});
