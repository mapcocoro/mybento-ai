/* ------------------------------------------------------------
   My Bento AI – front-end (basic + pro)
------------------------------------------------------------ */
const form   = document.getElementById('form');
const out    = document.getElementById('output');
const shop   = document.getElementById('shopping');
const loader = document.getElementById('loader');   // ← index.html に <div id="loader" …>

/* ---------- util ---------- */
const show = el => el.classList.remove('hidden');
const hide = el => el.classList.add('hidden');

/* ---------- main ---------- */
form.addEventListener('submit', async e => {
  e.preventDefault();
  out.innerHTML  = '';   shop.innerHTML = '';
  show(loader);

  const fd   = new FormData(form);
  const data = Object.fromEntries(fd.entries());

  // 文字列→配列
  data.dislikes = (data.dislikes ?? '')
                   .split(',').map(s=>s.trim()).filter(Boolean);
  data.stock    = (data.stock ?? '')
                   .split(',').map(s=>s.trim()).filter(Boolean);

  // basic / pro で API を切り替え
  const endpoint = data.mode === 'pro' ? '/api/plan-pro' : '/api/plan-basic';

  try {
    /* ---- プラン取得 ---- */
    const res = await fetch(endpoint,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(data)
    });
    if (!res.ok) throw new Error(await res.text());
    const plan = await res.json();

    /* ---- 表示 ---- */
    out.innerHTML = plan.map(day => `
      <div class="card">
        <h2>${day.day}</h2>
        ${day.items.map(d => `
          <details>
            <summary>${d.name} (${d.time}分${d.calories?' / '+d.calories+'kcal':''})</summary>
            <ol>${d.steps.map(s=>`<li>${s}</li>`).join('')}</ol>
          </details>
        `).join('')}
      </div>
    `).join('');

    /* ---- 買い物リスト ---- */
    const list = await (await fetch('/api/shopping',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(plan)
    })).json();

    shop.innerHTML = `<h2>🛒 買い物リスト</h2><ul>${
      Object.entries(list).map(([k,v])=>`<li>${k} × ${v}</li>`).join('')
    }</ul>`;

  } catch(err){
    out.innerHTML = `<p style="color:red">⚠️ ${err.message}</p>`;
  } finally{
    hide(loader);
  }
});
