// server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, readFileSync } from 'fs';

//
// ── ESM 環境で __dirname を使えるように ────────────────────────────────
//
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

//
// ── アプリ／ミドルウェア設定 ───────────────────────────────────────────
//
const PORT = process.env.PORT || 3000;
const app  = express();

// JSON ボディをパース
app.use(express.json());

// public フォルダ配信（CSS/HTML/クライアント JS）
app.use(express.static(path.join(__dirname, 'public')));

//
// ── レシピ読み込み ────────────────────────────────────────────────────
const recipesDir = path.join(__dirname, 'recipes');
const recipes = readdirSync(recipesDir)
  .filter(f => f.endsWith('.json'))
  .flatMap(f => JSON.parse(readFileSync(path.join(recipesDir, f), 'utf8')));
console.log(`🍱 Loaded ${recipes.length} recipes`);

//
// ── BASIC プラン生成 ───────────────────────────────────────────────────
const weekdays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const pickOne  = arr => arr.splice(Math.floor(Math.random()*arr.length),1)[0];

app.post('/api/plan-basic', (req, res) => {
  try {
    const { days = 5, dislikes = [], stock = [] } = req.body;

    const dislikeArr = Array.isArray(dislikes)
      ? dislikes
      : String(dislikes).split(',').map(s=>s.trim()).filter(Boolean);
    const stockArr = Array.isArray(stock)
      ? stock
      : String(stock).split(',').map(s=>s.trim()).filter(Boolean);

    // 除外フィルタ
    let pool = recipes.filter(r =>
      dislikeArr.every(d => !r.ingredients.some(ing => ing.includes(d)))
    );

    // main/side をコピー
    const mains = pool.filter(r=>r.category==='main').slice();
    const sides = pool.filter(r=>r.category==='side').slice();

    // 在庫優先プール
    const stockPool = pool.filter(r =>
      stockArr.some(s => {
        const terms = [s];
        if (/肉$/.test(s)) terms.push(s.replace(/肉$/,''));
        return terms.some(t => r.ingredients.some(ing=>ing.includes(t)));
      })
    ).slice();

    const getStock = () => stockPool.length ? pickOne(stockPool) : null;

    // プラン生成
    const plan = Array.from({ length: days }, (_, i) => {
      const items = [];
      const stockItem = getStock();
      if (stockItem) {
        items.push(stockItem);
        // 重複除去
        const tgt = stockItem.category==='main' ? mains : sides;
        const idx = tgt.findIndex(r=>r.name===stockItem.name);
        if (idx>=0) tgt.splice(idx,1);
      }
      // main 必要なら
      if (!stockItem || stockItem.category==='side') {
        if (mains.length) items.push(pickOne(mains));
      }
      // side を合計 2 品まで
      while (items.filter(r=>r.category==='side').length < 2) {
        if (!sides.length) break;
        items.push(pickOne(sides));
      }
      return { day: weekdays[i % 7], items };
    });

    res.json(plan);

  } catch(err) {
    console.error('❌ plan-basic error:', err);
    res.status(500).json({ error:'server', detail: err.message });
  }
});

//
// ── 買い物リスト集計 ─────────────────────────────────────────────────
app.post('/api/shopping', (req, res) => {
  try {
    const tally = {};
    req.body.forEach(day => {
      day.items.forEach(dish => {
        dish.ingredients.forEach(ing => {
          const name = ing.split(/\s+/)[0];
          tally[name] = (tally[name] || 0) + 1;
        });
      });
    });
    res.json(tally);
  } catch(err) {
    console.error('❌ shopping error:', err);
    res.status(400).json({ error:'format', detail: err.message });
  }
});

//
// ── 単一レシピ取得（お気に入り詳細用） ─────────────────────────────────
app.get('/api/recipe', (req, res) => {
  const name = req.query.name;
  if (!name) {
    return res.status(400).json({ error:'missing_name' });
  }
  const recipe = recipes.find(r => r.name === name);
  if (!recipe) {
    return res.status(404).json({ error:'not_found' });
  }
  res.json(recipe);
});

//
// ── サーバ起動 ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Bento API listening on http://localhost:${PORT}`);
});

