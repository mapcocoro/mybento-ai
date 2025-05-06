/* ------------------------------------------------------------------
   My Bento AI — server.js  ★Basic (無料) / Pro (GPT) 両対応 完全版
   ──────────────────────────────────────────────
   ■ Node 18+   ■ package.json に  "type":"module"  を必ず追加
   ■ .env には  OPENAI_API_KEY=sk-...   を設定
------------------------------------------------------------------ */
import 'dotenv/config';
import express           from 'express';
import { readFileSync }  from 'node:fs';
import { OpenAI }        from 'openai';

const PORT    = process.env.PORT || 3000;
const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error('❌  OPENAI_API_KEY が .env にありません'); process.exit(1);
}

/* ---------- 無料版で使うローカルレシピ（増やすほど多様化） ---------- */
const recipes = JSON.parse(readFileSync('./recipes.json','utf-8')); // 例：1000 品

/* ---------- Pro 版で使う OpenAI クライアント ---------- */
const ai = new OpenAI({ apiKey: API_KEY });

const app = express();
app.use(express.json());
app.use(express.static('public'));

/* =======================================================
   ① 無料 BASIC 版  POST /api/plan-basic
   ======================================================= */
app.post('/api/plan-basic', (req, res)=>{
  const { days=5, servings=1, dislikes='' } = req.body;
  const dislikeArr = dislikes.split(',').map(t=>t.trim()).filter(Boolean);

  /* 1) 除外食材でレシピプールを絞る */
  const pool = recipes.filter(r =>
      dislikeArr.every(d => !r.ingredients.includes(d))
  );

  /* 2) days × 3 品をランダム抽出 */
  const weekdays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const plan = Array.from({length:days}, (_,i)=>{
    const items=[];
    while(items.length<3 && pool.length){
      const idx = Math.floor(Math.random()*pool.length);
      items.push(pool.splice(idx,1)[0]);
    }
    return { day:weekdays[i%7], items };
  });

  return res.json(plan);
});

/* =======================================================
   ② Pro 版  POST /api/plan-pro  （カロリー・在庫・除外対応）
   ======================================================= */
app.post('/api/plan-pro', async (req,res)=>{
  const {
    days=5, servings=1,
    targetCal=600,
    stock='',               // 冷蔵庫食材 "卵,牛乳"
    dislikes='',
    maxTime=20
  } = req.body;

  const stockArr   = stock.split(',').map(s=>s.trim()).filter(Boolean);
  const dislikeArr = dislikes.split(',').map(s=>s.trim()).filter(Boolean);

  const sysPrompt = `
You are a Japanese nutritionist and creative bento chef.
Return ONLY a valid JSON array (no code fences, no extra text).

Schema:
[{
  "day":"Mon",
  "items":[
    {"name":"…","time":15,"calories":350,
     "ingredients":["a","b"],"steps":["s1","s2"]}
  ]
}]

Constraints:
- ${days} days, each day = 1 main + 2 sides (3 dishes)
- Portion: ${servings} people
- Each dish ≤ ${maxTime} min
- Target calories per meal ≤ ${targetCal} kcal
- Must use only ingredients within: ${stockArr.length ? stockArr.join(', ') : 'ANY'}
- Exclude ingredients: ${dislikeArr.length ? dislikeArr.join(', ') : 'NONE'}
- No duplicate dishes across days
`;

  try{
    const completion = await ai.chat.completions.create({
      model:'gpt-3.5-turbo-0125',
      temperature:0.3,
      max_tokens:1500,
      messages:[
        {role:'system', content:sysPrompt},
        {role:'user',   content:'Plan please'}
      ]
    });

    /* ---- 出力をクリーニング ---- */
    let raw = completion.choices[0].message.content.trim()
               .replace(/```[\s\S]*?```/g, m => m.replace(/```json|```/g,'').trim());

    const first = raw.indexOf('['), last = raw.lastIndexOf(']');
    const jsonText = raw.slice(first, last+1);

    const plan = JSON.parse(jsonText);
    return res.json(plan);

  }catch(err){
    if (err.code === 'insufficient_quota'){
      return res.status(429).json({ error:'quota', message:'OpenAI 上限です'});
    }
    console.error('GPT Error', err);
    return res.status(500).json({ error:'server', detail:err.message });
  }
});

/* =======================================================
   ③ 共通：買い物リスト集計  POST /api/shopping
   ======================================================= */
app.post('/api/shopping',(req,res)=>{
  try{
    const plan = req.body;   // plan-basic / plan-pro どちらでもOK
    const tally={};
    plan.forEach(day =>
      day.items.forEach(dish =>
        dish.ingredients.forEach(ing=>{
          tally[ing] ??=0; tally[ing]+=1;
        })
      )
    );
    res.json(tally);
  }catch(e){
    res.status(400).json({error:'format', detail:e.message});
  }
});

/* ------------------------------------------------------- */
app.listen(PORT,()=>console.log(`✅ MyBento AI API listening → http://localhost:${PORT}`));
