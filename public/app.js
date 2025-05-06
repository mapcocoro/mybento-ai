/* ------------------------------------------------------------------
   My Bento AI — server.js  (v2.0  Basic + Pro 両対応版)
   ────────────────────────────────────────────────────────────────
   必須環境 : Node 18+         package.json に  "type":"module" 追加
------------------------------------------------------------------ */
import 'dotenv/config';
import express           from 'express';
import { readFileSync }  from 'node:fs';
import { OpenAI }        from 'openai';

const PORT    = process.env.PORT || 3000;
const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error('❌  OPENAI_API_KEY が .env にありません');
  process.exit(1);
}

/* ───────── データ / ライブラリ初期化 ───────── */
const recipes = JSON.parse(readFileSync('./recipes.json', 'utf-8'));
const ai      = new OpenAI({ apiKey: API_KEY });
const app     = express();

app.use(express.json());
app.use(express.static('public'));

/* ================================================================
   1)  無料版   /api/plan-basic   （recipes.json だけで生成）
================================================================ */
app.post('/api/plan-basic', (req, res) => {
  const { days = 5, servings = 1, dislikes = [], maxTime = 20 } = req.body;

  // 使いやすい形にフィルタリング
  const pool = recipes.filter(r =>
      r.time <= maxTime &&
      !dislikes.some(d => r.ingredients.includes(d))
  );

  if (pool.length < 3) {
    return res.status(400).json({ error:'few_recipes', message:'条件に合うレシピが少なすぎます' });
  }

  // ランダム献立
  const weekdays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const plan = Array.from({length: days}).map((_, idx) => ({
    day   : weekdays[idx % 7],
    items : Array.from({length:3}).map(()=>pool[Math.floor(Math.random()*pool.length)])
                     .map(item => ({ ...item, servings }))   // 分量だけ上書き
  }));

  res.json(plan);
});

/* ================================================================
   2)  Pro 版   /api/plan-pro   （OpenAI でカロリー・在庫考慮）
================================================================ */
app.post('/api/plan-pro', async (req, res) => {
  const {
    servings = 1,
    days     = 5,
    dislikes = [],
    maxTime  = 20,
    targetCal= 600,
    stock    = []
  } = req.body;

  const sysPrompt = `
You are a JSON meal-planner engine.
Return ONLY valid JSON array (no fences, no text).

Schema:
[
  {
    "day":"Mon",
    "items":[
      {"name":"...","time":15,"calories":400,"ingredients":["a","b"],"steps":["s1","s2"]}
    ]
  }
]

Rules:
- 1 main + 2 sides = 3 dishes per day
- Portion : ${servings} people
- Each dish ≤ ${maxTime} min
- Exclude : ${dislikes.length ? dislikes.join(', ') : 'none'}
- Try to hit ${targetCal} kcal/day ±15 %
- Prefer ingredients in fridge : ${stock.length ? stock.join(', ') : 'none'}
- Generate ${days} distinct days
`;

  try {
    const completion = await ai.chat.completions.create({
      model       : 'gpt-3.5-turbo-0125',
      temperature : 0.2,
      max_tokens  : 1200,
      messages    : [
        { role:'system', content: sysPrompt },
        { role:'user',   content: JSON.stringify(recipes) }
      ]
    });

    /* ---------- 出力をクリーンアップ ---------- */
    let raw = completion.choices[0].message.content.trim();
    raw = raw.replace(/```[\s\S]*?```/g, m=>m.replace(/```json?|```/g,'').trim()); // ``` 消し
    const jsonText = raw.slice(raw.indexOf('['), raw.lastIndexOf(']')+1);
    const plan = JSON.parse(jsonText);
    return res.json(plan);

  } catch(err){
    if (err.code === 'insufficient_quota')
      return res.status(429).json({error:'quota',message:'OpenAI API クオータ超過'});
    console.error('GPT error', err);
    return res.status(500).json({error:'server',message:err.message});
  }
});

/* ================================================================
   3)  買い物リスト集計   /api/shopping   （共通）
================================================================ */
app.post('/api/shopping', (req, res) => {
  try {
    const tally = {};
    req.body.forEach(day =>
      day.items.forEach(d =>
        d.ingredients.forEach(i => {
          tally[i] ??= 0;
          tally[i] += 1;
        })
      )
    );
    res.json(tally);
  } catch(err){
    res.status(400).json({error:'format',message:err.message});
  }
});

/* ============================================================= */
app.listen(PORT, () =>
  console.log(`✅  My Bento AI API running → http://localhost:${PORT}`)
);
