// public/app.js
const form             = document.getElementById('form');
const outputSection    = document.getElementById('output');
const favoritesSection = document.getElementById('favorites');
const favList          = document.getElementById('fav-list');
const favDetailDiv     = document.getElementById('fav-detail');
const shoppingSection  = document.getElementById('shopping');
const shoppingListDiv  = document.getElementById('shopping-list');
const loader           = document.getElementById('loader');

// タブ切り替え
const tabs     = document.querySelectorAll('nav.tabs button');
const sections = {
  'view-plan': document.getElementById('view-plan'),
  'favorites': favoritesSection,
  'shopping':  shoppingSection
};
tabs.forEach(btn => {
  btn.addEventListener('click', () => {
    // ボタンの active 切り替え
    tabs.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // 全セクションを隠す→対象だけ表示
    Object.values(sections).forEach(sec => sec.classList.add('hidden'));
    sections[btn.dataset.target].classList.remove('hidden');
  });
});

// ヘルパー
const show = el => el.classList.remove('hidden');
const hide = el => el.classList.add('hidden');

// ── お気に入り管理 ─────────────────────────
const getFavs  = () => JSON.parse(localStorage.getItem('bentoFavs') || '[]');
const saveFavs = favs => localStorage.setItem('bentoFavs', JSON.stringify(favs));

function renderFavs() {
  const favs = getFavs();
  if (favs.length === 0) {
    hide(favoritesSection);
    favList.innerHTML = '';
  } else {
    show(favoritesSection);
    favList.innerHTML = favs.map(name => `
      <li>
        <span class="fav-name">${name}</span>
        <button class="bookmark-btn favorited" data-name="${name}">×</button>
      </li>
    `).join('');
  }
}

// お気に入り追加・削除 & 星ボタン更新
function toggleFav(name) {
  const favs = getFavs();
  const updated = favs.includes(name)
    ? favs.filter(n => n !== name)
    : [...favs, name];
  saveFavs(updated);
  // プラン内・一覧内の★ボタン切り替え
  document.querySelectorAll(`.bookmark-btn[data-name="${name}"]`)
    .forEach(btn => btn.classList.toggle('favorited'));
  renderFavs();
}

// 初回
renderFavs();

// ── 献立プラン描画 ─────────────────────────
function renderPlan(plan) {
  outputSection.innerHTML = plan.map(day => `
    <div class="card">
      <h2>${day.day}</h2>
      ${day.items.map(d => {
        const isFav = getFavs().includes(d.name);
        return `
        <details>
          <summary>
            <button
              class="bookmark-btn ${isFav ? 'favorited' : ''}"
              data-name="${d.name}"
              aria-label="お気に入り登録">
              ${isFav ? '★' : '☆'}
            </button>
            ${d.name}（${d.time}分 / ${d.calories}kcal）
          </summary>
          <h3>材料</h3>
          <ul class="ings">
            ${d.ingredients.map(i => `<li>${i}</li>`).join('')}
          </ul>
          <h3>手順</h3>
          <ol class="steps">
            ${d.steps.map(s => `<li>${s}</li>`).join('')}
          </ol>
        </details>
      `}).join('')}
    </div>
  `).join('');
}

// プラン内の★クリックでお気に入り切替
outputSection.addEventListener('click', e => {
  if (e.target.matches('.bookmark-btn')) {
    toggleFav(e.target.dataset.name);
  }
});

// ── お気に入り一覧操作 ─────────────────────────
favList.addEventListener('click', async e => {
  // × ボタンなら削除
  if (e.target.matches('.bookmark-btn')) {
    toggleFav(e.target.dataset.name);
    return;
  }
  // 名前クリックならレシピ詳細取得
  if (e.target.matches('.fav-name')) {
    const name = e.target.textContent;
    try {
      show(loader);
      const res = await fetch(`/api/recipe?name=${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error(await res.text());
      const recipe = await res.json();

      favDetailDiv.innerHTML = `
        <div class="card">
          <details open>
            <summary><strong>${recipe.name}</strong></summary>
            <p>カテゴリ: ${recipe.category}</p>
            ${recipe.time    ? `<p>所要時間: ${recipe.time}分</p>`    : ''}
            ${recipe.calories? `<p>カロリー: ${recipe.calories}kcal</p>`: ''}
            <h3>材料</h3>
            <ul class="ings">
              ${recipe.ingredients.map(i=>`<li>${i}</li>`).join('')}
            </ul>
            <h3>手順</h3>
            <ol class="steps">
              ${recipe.steps.map(s=>`<li>${s}</li>`).join('')}
            </ol>
          </details>
        </div>
      `;
      // お気に入りタブを開く
      document.querySelector('button[data-target="favorites"]').click();
    } catch(err) {
      favDetailDiv.innerHTML =
        `<p style="color:red">⚠️ ${err.message}</p>`;
    } finally {
      hide(loader);
    }
  }
});

// ── 買い物リスト描画 ─────────────────────────
function renderShopping(list) {
  const seasoningKeywords = [
    '醤油','みりん','砂糖','塩','酢', 
    'ごま油','オリーブ油','酒','みそ', '黒こしょう',
    'ほんだし','顆粒','カレー粉', '一味唐辛子','バター',
    'サラダ油','揚げ油', '味噌','粉チーズ','豆板醤','ケチャップ',
     'マヨネーズ','レモン汁','だし','おろしにんにく', 
     'にんにくみじん','鶏ガラスープの素','生姜汁', 
     '生姜スライス','おろし生姜','生姜千切り', '中濃ソース',
     'オイスターソース','コンソメ', 'わさび','西京味噌' 
  ];
  const entries = Object.entries(list);
  const foods = [], seasonings = [];
  for (const [item, qty] of entries) {
    if (seasoningKeywords.some(kw => item.includes(kw))) {
      seasonings.push([item,qty]);
    } else {
      foods.push([item,qty]);
    }
  }
  // チェックボックス付きリスト
  shoppingListDiv.innerHTML = `
    <h3>食材</h3>
    <ul>
      ${foods.map(([it,q])=>`
        <li>
          <label>
            <input type="checkbox" class="chk" value="${it} × ${q}">
            ${it} × ${q}
          </label>
        </li>`).join('')}
    </ul>
    <h3>調味料</h3>
    <ul>
      ${seasonings.map(([it,q])=>`
        <li>
          <label>
            <input type="checkbox" class="chk" value="${it} × ${q}">
            ${it} × ${q}
          </label>
        </li>`).join('')}
    </ul>
  `;
}

// コピー機能
shoppingSection.querySelector('#copyBtn')
  .addEventListener('click', async () => {
    const lines = [...shoppingListDiv.querySelectorAll('.chk:checked')]
      .map(c => c.value);
    if (!lines.length) return alert('✔︎ を付けてください');
    await navigator.clipboard.writeText(lines.join('\n'));
    alert('コピーしました');
  });

// ── フォーム送信 ─────────────────────────
form.addEventListener('submit', async e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  data.days     = Number(data.days) || 5;
  data.dislikes = data.dislikes
    ? data.dislikes.split(',').map(s=>s.trim()).filter(Boolean)
    : [];
  data.stock    = data.stock
    ? data.stock.split(',').map(s=>s.trim()).filter(Boolean)
    : [];

  show(loader);
  try {
    // (1) 献立プラン取得
    const planRes = await fetch('/api/plan-basic', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(data)
    });
    if (!planRes.ok) throw new Error(await planRes.text());
    const plan = await planRes.json();
    renderPlan(plan);

    // (2) 買い物リスト取得
    const shopRes = await fetch('/api/shopping', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(plan)
    });
    if (!shopRes.ok) throw new Error(await shopRes.text());
    const shopList = await shopRes.json();
    renderShopping(shopList);

    // 「献立プラン」タブに留まる
    document.querySelector('button[data-target="view-plan"]').click();
  } catch(err) {
    outputSection.innerHTML =
      `<p style="color:red">⚠️ ${err.message}</p>`;
  } finally {
    hide(loader);
  }
});
