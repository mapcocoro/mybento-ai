/* public/app.js */

const form    = document.getElementById('form');
const out     = document.getElementById('output');
const shop    = document.getElementById('shopping');
const loader  = document.getElementById('loader');
const favArea = document.getElementById('favorites');
const favList = document.getElementById('fav-list');

const q    = sel => document.querySelector(sel);
const show = el  => el.classList.remove('hidden');
const hide = el  => el.classList.add('hidden');

// ── お気に入り管理 ──
const getFavs  = () => JSON.parse(localStorage.getItem('bentoFavs') || '[]');
const saveFavs = favs => localStorage.setItem('bentoFavs', JSON.stringify(favs));

function renderFavs() {
  const favs = getFavs();
  if (favs.length === 0) {
    hide(favArea);
    favList.innerHTML = '';
  } else {
    show(favArea);
    favList.innerHTML = favs.map(name => `
      <li>
        <span class="fav-name">${name}</span>
        <button class="bookmark-btn favorited" data-name="${name}">×</button>
      </li>
    `).join('');
  }
}

/**
 * お気に入りを追加／削除
 * ・プラン内の星ボタンも一斉に色切り替え
 * ・一覧を再描画
 */
function toggleFav(name) {
  const favs = getFavs();
  const updated = favs.includes(name)
    ? favs.filter(n => n !== name)
    : [...favs, name];
  saveFavs(updated);

  // プラン内のボタンも切り替え
  document.querySelectorAll(`.bookmark-btn[data-name="${name}"]`)
    .forEach(btn => btn.classList.toggle('favorited'));

  // 一覧を再描画
  renderFavs();
}

// 初回レンダー
renderFavs();

// ── 献立プラン描画ヘルパー ──
function renderPlan(plan) {
  out.innerHTML = plan.map(day => `
    <div class="card">
      <h2>${day.day}</h2>
      ${day.items.map(d => {
        const isFav = getFavs().includes(d.name);
        return `
        <details>
          <summary>
            <button
              class="bookmark-btn ${isFav ? 'favorited':''}"
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

// ── イベント委譲：プラン内の星ボタン ──
out.addEventListener('click', e => {
  if (e.target.matches('.bookmark-btn')) {
    toggleFav(e.target.dataset.name);
  }
});

// ── お気に入り一覧での操作 ──
favList.addEventListener('click', async e => {
  // ① 削除ボタン（×）の場合
  if (e.target.matches('.bookmark-btn')) {
    toggleFav(e.target.dataset.name);
    return;
  }
  // ② 名前クリックで詳細表示
  if (e.target.matches('.fav-name')) {
    const name = e.target.textContent;
    try {
      show(loader);
      const res = await fetch(`/api/recipe?name=${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error(await res.text());
      const recipe = await res.json();
      out.innerHTML = `
        <details open class="card">
          <summary><strong>${recipe.name}</strong></summary>
          <p>カテゴリ: ${recipe.category}</p>
          ${recipe.time   ? `<p>所要時間: ${recipe.time}分</p>`    : ''}
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
      `;
    } catch(err) {
      out.innerHTML = `<p style="color:red">⚠️ ${err.message}</p>`;
    } finally {
      hide(loader);
    }
  }
});

// ── フォーム送信時の処理 ──
form.addEventListener('submit', async e => {
  e.preventDefault();
  // 入力値取得・整形
  const data = Object.fromEntries(new FormData(form).entries());
  data.days     = Number(data.days) || 5;
  data.dislikes = data.dislikes
    ? data.dislikes.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  data.stock    = data.stock
    ? data.stock.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  // 画面クリア + ローダー
  out.innerHTML = '';
  shop.innerHTML = '';
  show(loader);

  try {
    // 1) 献立プラン取得
    const res = await fetch('/api/plan-basic', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(await res.text());
    const plan = await res.json();

    // 2) 除外＆在庫優先フィルタ
    let displayPlan = plan.filter(day =>
      day.items.every(item =>
        data.dislikes.every(d =>
          !item.ingredients.some(ing => ing.includes(d))
        )
      )
    );
    if (data.stock.length) {
      displayPlan = displayPlan.filter(day =>
        day.items.some(item =>
          item.ingredients.some(ing =>
            data.stock.some(s => {
              const terms = [s];
              if (/肉$/.test(s)) terms.push(s.replace(/肉$/,''));
              return terms.some(term => ing.includes(term));
            })
          )
        )
      );
    }

    // 3) 献立表示 or 警告
    if (!displayPlan.length) {
      out.innerHTML = `<p>⚠️ 条件に合うメニューが見つかりませんでした。</p>`;
    } else {
      renderPlan(displayPlan);
    }

    // ── ここから買い物リスト復活部分 ──
    const shopRes = await fetch('/api/shopping', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(plan)
    });
    if (!shopRes.ok) throw new Error(await shopRes.text());
    const list = await shopRes.json();

    // 食材 / 調味料 に分類
    const seasoningKeywords = [ /* … */ ];
    const entries = Object.entries(list);
    const seasoningItems = [], foodItems = [];
    for (const [item, qty] of entries) {
      if (seasoningKeywords.some(kw => item.includes(kw))) {
        seasoningItems.push([item, qty]);
      } else {
        foodItems.push([item, qty]);
      }
    }

    // 描画
    shop.innerHTML = `
      <h2>🛒 今週の買い物リスト
        <button id="copyBtn">📋 コピー</button>
      </h2>
      <h3>食材</h3>
      <ul>
        ${foodItems.map(([it, q]) => `
          <li>
            <label>
              <input type="checkbox" class="chk" value="${it} × ${q}">
              ${it} × ${q}
            </label>
          </li>
        `).join('')}
      </ul>
      <h3>調味料</h3>
      <ul>
        ${seasoningItems.map(([it, q]) => `
          <li>
            <label>
              <input type="checkbox" class="chk" value="${it} × ${q}">
              ${it} × ${q}
            </label>
          </li>
        `).join('')}
      </ul>
    `;
    document.querySelector('#copyBtn').addEventListener('click', async () => {
      const lines = [...document.querySelectorAll('.chk:checked')].map(c=>c.value);
      if (!lines.length) return alert('✔ を付けてください');
      await navigator.clipboard.writeText(lines.join('\n'));
      alert('コピーしました');
    });
    // ── ここまで購買リスト復活部分 ──

  } catch(err) {
    out.innerHTML = `<p style="color:red">⚠️ ${err.message}</p>`;
  } finally {
    hide(loader);
  }
});