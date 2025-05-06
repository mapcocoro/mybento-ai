/* ------------------------------------------------------------------
   My Bento AI — server.js  (stable no-error version)
   Node 18+   package.json に "type":"module" を必ず追加
------------------------------------------------------------------ */
import 'dotenv/config';
import express from 'express';
import { readFileSync } from 'node:fs';
import { OpenAI } from 'openai';

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error('❌  OPENAI_API_KEY が .env にありません');
  process.exit(1);
}

const recipes = JSON.parse(readFileSync('./recipes.json', 'utf-8'));
const ai = new OpenAI({ apiKey: API_KEY });

const app = express();
app.use(express.json());
app.use(express.static('public'));

/* ---------------------------------------------------------------
   ① 週間プラン生成  POST /api/plan
---------------------------------------------------------------- */
app.post('/api/plan', async (req, res) => {
  const { servings = 1, days = 5, dislikes = [], maxTime = 20 } = req.body;

  const sysPrompt = `
You are a JSON generator.  
Return ONLY a valid JSON array (no \` \`\`\` \` fences, no extra text).  
Schema:
[
  {
    "day":"Mon",
    "items":[
      {"name":"...","time":15,"ingredients":["a","b"],"steps":["s1","s2"]}
    ]
  }
]

Rules:
- 1 main + 2 sides (3 dishes/day)
- Portion: ${servings} people
- Each dish <= ${maxTime} minutes
- Exclude: ${dislikes.length ? dislikes.join(', ') : 'none'}
- Provide ${days} distinct days
`;

  try {
    /* ---- OpenAI 呼び出し ---- */
    const completion = await ai.chat.completions.create({
      model: 'gpt-3.5-turbo-0125',
      temperature: 0.2,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user',   content: JSON.stringify(recipes) }
      ]
    });

    /* ---- 出力をクリーニング ---- */
    let raw = completion.choices[0].message.content.trim();

    // ```json ... ``` ブロックを丸ごと除去
    raw = raw.replace(/```[\s\S]*?```/g, m =>
      m.replace(/```json|```/g, '').trim()
    );

    // まだ文章が残っていれば '[' 〜 ']' を抜き出す
    const first = raw.indexOf('[');
    const last  = raw.lastIndexOf(']');
    const jsonText = raw.slice(first, last + 1);

    console.log('▼ cleaned JSON head\n', jsonText.slice(0, 300));

    const plan = JSON.parse(jsonText);
    return res.json(plan);

  } catch (err) {
    // API クオータ不足など
    if (err.code === 'insufficient_quota') {
      return res.status(429).json({
        error: 'quota',
        message: 'OpenAI API の利用上限に達しました。'
      });
    }
    console.error('GPT 生成 / JSON 解析エラー', err);
    return res.status(500).json({
      error: 'server',
      message: 'Failed to generate plan',
      detail: err.message
    });
  }
});

/* ---------------------------------------------------------------
   ② 買い物リスト集計  POST /api/shopping
---------------------------------------------------------------- */
app.post('/api/shopping', (req, res) => {
  try {
    const plan = req.body;
    const tally = {};
    plan.forEach(day =>
      day.items.forEach(dish =>
        dish.ingredients.forEach(ing => {
          tally[ing] ??= 0;
          tally[ing] += 1;
        })
      )
    );
    return res.json(tally);
  } catch (err) {
    return res.status(400).json({ error: 'format', detail: err.message });
  }
});

/* --------------------------------------------------------------- */
app.listen(PORT, () =>
  console.log(`✅  My Bento AI API running → http://localhost:${PORT}`)
);
