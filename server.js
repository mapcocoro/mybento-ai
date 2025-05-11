// server.js
//import 'dotenv/config';
import express from 'express';
//import { readdirSync, readFileSync } from 'node:fs';
//import { OpenAI } from 'openai';

//const PORT    = process.env.PORT || 3000;
//const API_KEY = process.env.OPENAI_API_KEY;
//if (!API_KEY) {
  //console.error('❌ OPENAI_API_KEY is missing');
  //process.exit(1);
//}

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ── レシピロード ──
const recipesDir = './recipes';
const recipes = readdirSync(recipesDir)
  .filter(f => f.endsWith('.json'))
  .flatMap(f => JSON.parse(readFileSync(`${recipesDir}/${f}`, 'utf8')));
console.log(`🍱 Loaded ${recipes.length} recipes`);

// ── ヘルパー ──
const weekdays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const pickOne  = arr => arr.splice(Math.floor(Math.random() * arr.length), 1)[0];

// ── BASIC プラン (無料) ──
app.post('/api/plan-basic', (req, res) => {
  try {
    const { days = 5, dislikes = [], stock = [] } = req.body;

    // 整形
    const dislikeArr = Array.isArray(dislikes)
      ? dislikes
      : String(dislikes).split(',').map(s => s.trim()).filter(Boolean);
    const stockArr = Array.isArray(stock)
      ? stock
      : String(stock).split(',').map(s => s.trim()).filter(Boolean);

    // 除外フィルタ
    let pool = recipes.filter(r =>
      dislikeArr.every(d => !r.ingredients.some(ing => ing.includes(d)))
    );

    // main/side 分割コピー
    const mains = pool.filter(r => r.category === 'main').slice();
    const sides = pool.filter(r => r.category === 'side').slice();

    // stock 優先 pool
    const stockPool = pool.filter(r =>
      stockArr.some(s =>
        // 「鶏肉」→「鶏肉」「鶏」でヒットさせる
        [s, ...( /肉$/.test(s) ? [s.replace(/肉$/, '')] : [] )]
          .some(term => r.ingredients.some(ing => ing.includes(term)))
      )
    ).slice();

    const getStockRecipe = () => {
      if (stockPool.length === 0) return null;
      return pickOne(stockPool);
    };

    // プラン生成
    const plan = Array.from({ length: days }, (_, i) => {
      const items = [];
      // 1) stock 優先ピック
      const stockItem = getStockRecipe();
      if (stockItem) {
        items.push(stockItem);
        // 重複排除
        const targetArr = stockItem.category === 'main' ? mains : sides;
        const idx = targetArr.findIndex(r => r.name === stockItem.name);
        if (idx >= 0) targetArr.splice(idx, 1);
      }
      // 2) main 必要なら
      if (!stockItem || stockItem.category === 'side') {
        if (mains.length) items.push(pickOne(mains));
      }
      // 3) side が合計2品になるまで
      while (items.filter(r => r.category === 'side').length < 2) {
        if (!sides.length) break;
        items.push(pickOne(sides));
      }
      return { day: weekdays[i % 7], items };
    });

    res.json(plan);

  } catch (err) {
    console.error('❌ plan-basic error:', err);
    res.status(500).json({ error:'server', detail: err.message });
  }
});

// ── Pro プラン (AI) ──
const ai = new OpenAI({ apiKey: API_KEY });

app.post('/api/plan-pro', async (req, res) => {
  try {
    const {
      days = 5,
      servings = 1,
      targetCal = 600,
      maxTime = 20,
      dislikes = [],
      stock = []
    } = req.body;

    const dislikeArr = Array.isArray(dislikes)
      ? dislikes
      : String(dislikes).split(',').map(s => s.trim()).filter(Boolean);
    const stockArr = Array.isArray(stock)
      ? stock
      : String(stock).split(',').map(s => s.trim()).filter(Boolean);

    const sysPrompt = `
You are a Japanese nutritionist and creative bento chef.
Generate exactly ${days} days of bento (1 main + 2 sides each day, no soups) in pure JSON:

[
  {
    "day": "Mon",
    "items": [
      {
        "name": "鶏の照り焼き",
        "category": "main",
        "time": 15,
        "calories": 300,
        "ingredients": ["鶏もも肉 100g", "..."],
        "steps": ["...", "..."]
      },
      { /* side1 */ },
      { /* side2 */ }
    ]
  },
  /* ... */
]

Constraints:
- Portion: ${servings}
- Max per dish: ${maxTime} min
- Max per meal: ${targetCal} kcal
- Exclude ingredients: ${dislikeArr.join('、') || 'none'}
- Prioritize using stock: ${stockArr.join('、') || 'none'}
- No duplicate menus, no soups.
Return pure JSON array only.
    `;

    const completion = await ai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      temperature: 0.4,
      max_tokens: 1500,
      messages: [
        { role:'system', content: sysPrompt },
        { role:'user',   content: '弁当プランを作成してください。' }
      ]
    });

    let raw = completion.choices[0].message.content
      .replace(/```[\s\S]*?```/g, '')
      .trim();
    raw = raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1);
    raw = raw.replace(/,\s*(\]|\})/g, '$1');
    const plan = JSON.parse(raw);

    res.json(plan);

  } catch (err) {
    console.error('❌ plan-pro error:', err);
    const code = err.code === 'insufficient_quota' ? 429 : 500;
    res.status(code).json({ error:'server', detail: err.message });
  }
});

// ── 買い物リスト集計 ──
app.post('/api/shopping', (req, res) => {
  try {
    const tally = {};
    req.body.forEach(day => {
      day.items.forEach(dish => {
        dish.ingredients.forEach(ing => {
          // 「醤油 小さじ1」→「醤油」
          const name = ing.split(/\s+/)[0];
          tally[name] = (tally[name] || 0) + 1;
        });
      });
    });
    res.json(tally);
  } catch (e) {
    res.status(400).json({ error:'format', detail: e.message });
  }
});

// ── サーバ起動 ──
app.listen(PORT, () => {
  console.log(`✅ My Bento AI API listening on http://localhost:${PORT}`);
});
// server.js の最後あたりに ↓ を追加してください



 // ── レシピを返す──
app.get('/api/recipe', (req, res) => {
  const name = req.query.name;
  if (!name) {
    return res.status(400).json({ error: 'missing_name' });
  }
  const recipe = recipes.find(r => r.name === name);
  if (!recipe) {
    return res.status(404).json({ error: 'not_found' });
  }
  res.json(recipe);
});
