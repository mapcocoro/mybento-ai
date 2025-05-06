const form = document.getElementById('form');
const out  = document.getElementById('output');
const shop = document.getElementById('shopping');

form.addEventListener('submit', async e => {
  e.preventDefault();
  out.textContent = '⏳ GPT が献立を考え中...';

  const data = Object.fromEntries(new FormData(form).entries());
  data.dislikes = data.dislikes.split(',').map(s => s.trim()).filter(Boolean);

  const plan = await fetch('/api/plan', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(data)
  }).then(r => r.json());

  out.innerHTML = plan.map(day => `
    <div class="card">
      <h2>${day.day}</h2>
      ${day.items.map(d => `
        <h3>${d.name}（${d.time}分）</h3>
        <details><summary>手順を見る</summary>
          <ol>${d.steps.map(s=>`<li>${s}</li>`).join('')}</ol>
        </details>
      `).join('')}
    </div>
  `).join('');

  const list = await fetch('/api/shopping', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(plan)
  }).then(r => r.json());

  shop.innerHTML = `<h2>🛒 今週の買い物リスト</h2><ul>${
    Object.entries(list).map(([k,v])=>`<li>${k} × ${v}</li>`).join('')
  }</ul>`;
});
