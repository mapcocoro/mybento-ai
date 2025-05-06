/* ------------------------------------------------------------
   My Bento AI – front-end (basic + pro)
   ------------------------------------------------------------ */
   const form   = document.getElementById('form');
   const out    = document.getElementById('output');
   const shop   = document.getElementById('shopping');
   const loader = document.getElementById('loader'); // ← 事前に <div id="loader" class="spinner hidden"> をHTMLに追加
   
   /* ---------- 汎用ユーティリティ ---------- */
   const q      = sel => document.querySelector(sel);
   const show   = el  => el.classList.remove('hidden');
   const hide   = el  => el.classList.add   ('hidden');
   
   /* ---------- メイン ---------- */
   form.addEventListener('submit', async e => {
     e.preventDefault();
     out.innerHTML  = '';   shop.innerHTML = '';
     show(loader);          // スピナー表示
   
     /* -------- 送信データ整形 -------- */
     const fd   = new FormData(form);
     const data = Object.fromEntries(fd.entries());
   
     // dislikes / stock はカンマ区切り → 配列
     data.dislikes = (data.dislikes || '')
                       .split(',').map(s=>s.trim()).filter(Boolean);
     data.stock    = (data.stock    || '')
                       .split(',').map(s=>s.trim()).filter(Boolean);
   
     // mode に応じてエンドポイントを変える
     const endpoint = data.mode === 'pro' ? '/api/plan-pro' : '/api/plan-basic';
   
     try {
       /* -------- 献立プラン取得 -------- */
       const resPlan = await fetch(endpoint,{
         method:'POST',
         headers:{'Content-Type':'application/json'},
         body:JSON.stringify(data)
       });
   
       if (resPlan.status === 429){
         throw new Error('OpenAI API の利用上限に達しました。しばらくして再度お試しください。');
       }
       if (!resPlan.ok){
         const er = await resPlan.json().catch(()=>({message:resPlan.statusText}));
         throw new Error(er.message || 'server error');
       }
   
       const plan = await resPlan.json();
       if (!Array.isArray(plan)) throw new Error('不正なデータ形式 (plan)');
   
       /* -------- 献立カード描画 -------- */
       out.innerHTML = plan.map(day => `
         <div class="card">
           <h2>${day.day}</h2>
           ${day.items.map(d => `
             <details class="item">
               <summary>
                 <span class="item-name">${d.name}</span>
                 <span class="item-time">⏱${d.time}分</span>
                 ${d.calories ? `<span class="item-cal">${d.calories}kcal</span>` : ''}
               </summary>
               <ol>${d.steps.map(s=>`<li>${s}</li>`).join('')}</ol>
             </details>
           `).join('')}
         </div>
       `).join('');
   
       /* -------- 買い物リスト -------- */
       const resShop = await fetch('/api/shopping',{
         method:'POST',
         headers:{'Content-Type':'application/json'},
         body:JSON.stringify(plan)
       });
       const list = await resShop.json();
       shop.innerHTML = `<h2>🛒 今週の買い物リスト</h2><ul>${
         Object.entries(list)
               .map(([k,v])=>`<li>${k} × ${v}</li>`)
               .join('')
       }</ul>`;
   
     } catch(err){
       out.innerHTML = `<p style="color:red">⚠️ ${err.message}</p>`;
     } finally{
       hide(loader);          // スピナー非表示
     }
   });
   
   