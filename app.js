async function loadPlaces(){
  // 1) Try Supabase (if configured)
  try{
    const cfg = window.__SUPABASE__;
    if(cfg?.url && cfg?.anonKey && window.supabase){
      const client = window.supabase.createClient(cfg.url, cfg.anonKey);
      const { data, error } = await client
        .from('places')
        .select('id,name,category,area,address,transit,budget,duration_min,duration_max,time_of_day,rainy_ok,social_energy,solo_why,website')
        .limit(200);
      if(error) throw error;
      if(Array.isArray(data) && data.length){
        return data.map(row => ({
          id: row.id,
          name: row.name,
          category: row.category,
          area: row.area,
          address: row.address,
          transit: row.transit || [],
          budget: row.budget,
          duration: { min: row.duration_min ?? 0, max: row.duration_max ?? 999 },
          timeOfDay: row.time_of_day || [],
          rainyOk: !!row.rainy_ok,
          socialEnergy: row.social_energy,
          soloWhy: row.solo_why,
          links: row.website ? { website: row.website } : {}
        }));
      }
    }
  }catch(e){
    // Fall back to JSON
  }

  // 2) Fallback: local JSON
  const res = await fetch('./data/places.json', {cache:'no-store'});
  if(!res.ok) throw new Error('Failed to load places');
  return res.json();
}

function scorePlace(place, prefs){
  let s = 0;

  // time window
  const dur = place.duration || {min:0,max:999};
  if(prefs.duration === 'quick'){
    if(dur.min <= 45) s += 3;
    if(dur.max <= 90) s += 1;
  }
  if(prefs.duration === 'oneTwo'){
    if(dur.min <= 90 && dur.max >= 60) s += 3;
  }
  if(prefs.duration === 'long'){
    if(dur.max >= 120) s += 2;
  }

  // moment
  if(prefs.moment && place.timeOfDay?.includes(prefs.moment)) s += 3;

  // rain
  if(prefs.rain === 'rain' && place.rainyOk) s += 3;
  if(prefs.rain === 'dry' && place.rainyOk === false) s += 2;
  if(prefs.rain === 'any') s += 1;

  // social energy
  const order = {zero:3, low:2, neutral:1, high:0};
  const need = order[prefs.energy] ?? 0;
  const has = order[place.socialEnergy] ?? 0;
  if(has >= need) s += 3;

  // budget
  const b = place.budget;
  if(prefs.budget === 'any') s += 1;
  if(prefs.budget === 'low' && (b === '€' || b === '€€')) s += 2;
  if(prefs.budget === 'mid' && (b === '€€' || b === '€€€')) s += 2;

  // category preference (optional)
  if(prefs.category !== 'any' && place.category === prefs.category) s += 2;

  return s;
}

function pickN(arr, n){
  const copy = [...arr];
  // Fisher-Yates shuffle
  for(let i=copy.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0,n);
}

function el(html){
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function renderResults(container, results){
  container.innerHTML = '';
  if(results.length === 0){
    container.appendChild(el(`<div class="box"><p class="lead">Je n’ai rien de parfaitement aligné avec ces critères… (et ce n’est pas grave).</p><p class="muted">Essaie en élargissant : budget “peu importe” ou énergie “neutre”.</p></div>`));
    return;
  }

  const list = el('<div class="cards"></div>');
  results.forEach(p => {
    const website = p.links?.website ? `<a class="btn btn--ghost btn--sm" href="${p.links.website}" target="_blank" rel="noopener">Site</a>` : '';
    const transit = (p.transit||[]).join(' · ');
    const addr = p.address && p.address !== '(à compléter)' ? `<div class="fine">${p.address}</div>` : '';
    list.appendChild(el(`
      <article class="cardx">
        <div class="cardx__top">
          <div>
            <h3 class="cardx__title">${p.name}</h3>
            <div class="cardx__meta">${p.area} · ${p.budget} · ${p.category}</div>
          </div>
          <div class="chip">Solo-friendly</div>
        </div>
        <p class="cardx__desc">${p.soloWhy}</p>
        <div class="cardx__meta">${transit || ''}</div>
        ${addr}
        <div class="cardx__actions">
          ${website}
          <button class="btn btn--solid btn--sm" data-copy="${encodeURIComponent(p.name + ' — ' + p.area)}">Copier</button>
        </div>
      </article>
    `));
  });

  container.appendChild(list);

  container.querySelectorAll('button[data-copy]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const txt = decodeURIComponent(btn.getAttribute('data-copy'));
      try{
        await navigator.clipboard.writeText(txt);
        btn.textContent = 'Copié';
        setTimeout(()=>btn.textContent='Copier', 900);
      }catch(e){
        // noop
      }
    });
  });
}

function enhanceSelectToPills(select){
  // Hide select but keep it for FormData
  select.classList.add('select--hidden');

  const wrap = document.createElement('div');
  wrap.className = 'pills';
  wrap.setAttribute('role','group');
  wrap.setAttribute('aria-label', select.name);

  const buttons = [];

  [...select.options].forEach(opt => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pill';
    b.textContent = opt.textContent;
    b.setAttribute('aria-pressed', opt.selected ? 'true' : 'false');

    b.addEventListener('click', () => {
      select.value = opt.value;
      buttons.forEach(x => x.setAttribute('aria-pressed','false'));
      b.setAttribute('aria-pressed','true');
      select.dispatchEvent(new Event('change', {bubbles:true}));
    });

    buttons.push(b);
    wrap.appendChild(b);
  });

  select.insertAdjacentElement('afterend', wrap);
}

async function main(){
  const places = await loadPlaces();
  const form = document.querySelector('#soloForm');
  const out = document.querySelector('#soloResults');
  const reroll = document.querySelector('#soloReroll');

  // Turn selects into pills (premium feel)
  form.querySelectorAll('select.select').forEach(enhanceSelectToPills);

  let last = [];

  function getPrefs(){
    const fd = new FormData(form);
    return {
      duration: fd.get('duration'),
      moment: fd.get('moment'),
      energy: fd.get('energy'),
      rain: fd.get('rain'),
      budget: fd.get('budget'),
      category: fd.get('category')
    };
  }

  function compute(){
    const prefs = getPrefs();
    const scored = places
      .map(p => ({p, s: scorePlace(p, prefs)}))
      .sort((a,b) => b.s - a.s);

    const top = scored.filter(x => x.s > 0).slice(0, 10).map(x => x.p);
    last = pickN(top.length ? top : places, 3);
    renderResults(out, last);
  }

  form.addEventListener('submit', (e)=>{ e.preventDefault(); compute(); });
  reroll.addEventListener('click', (e)=>{ e.preventDefault(); compute(); });

  // recompute on any selection change
  form.addEventListener('change', () => compute());

  // initial
  compute();
}

main().catch(err => {
  const out = document.querySelector('#soloResults');
  if(out) out.innerHTML = `<div class="box"><p class="lead">Oups. L’outil n’a pas chargé.</p><p class="muted">Recharge la page (et je corrige de mon côté).</p></div>`;
});
