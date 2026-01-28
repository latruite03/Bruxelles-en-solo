/* ============================================
   BRUXELLES SOLO — Premium App Logic
   ============================================ */

// Toast notification system
function showToast(message, type = 'success') {
  // Remove existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  // Auto-hide
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 2500);
}

// Load places from Supabase or fallback to JSON
async function loadPlaces() {
  // 1) Try Supabase (if configured)
  try {
    const cfg = window.__SUPABASE__;
    if (cfg?.url && cfg?.anonKey && window.supabase) {
      const client = window.supabase.createClient(cfg.url, cfg.anonKey);
      const { data, error } = await client
        .from('places')
        .select('id,name,category,area,address,transit,budget,duration_min,duration_max,time_of_day,rainy_ok,social_energy,solo_why,website')
        .limit(200);
      if (error) throw error;
      if (Array.isArray(data) && data.length) {
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
  } catch (e) {
    // Fall back to JSON
  }

  // 2) Fallback: local JSON
  const res = await fetch('./data/places.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load places');
  return res.json();
}

// Scoring algorithm
function scorePlace(place, prefs) {
  let s = 0;

  // time window
  const dur = place.duration || { min: 0, max: 999 };
  if (prefs.duration === 'quick') {
    if (dur.min <= 45) s += 3;
    if (dur.max <= 90) s += 1;
  }
  if (prefs.duration === 'oneTwo') {
    if (dur.min <= 90 && dur.max >= 60) s += 3;
  }
  if (prefs.duration === 'long') {
    if (dur.max >= 120) s += 2;
  }

  // moment
  if (prefs.moment && place.timeOfDay?.includes(prefs.moment)) s += 3;

  // rain
  if (prefs.rain === 'rain' && place.rainyOk) s += 3;
  if (prefs.rain === 'dry' && place.rainyOk === false) s += 2;
  if (prefs.rain === 'any') s += 1;

  // social energy
  const order = { zero: 3, low: 2, neutral: 1, high: 0 };
  const need = order[prefs.energy] ?? 0;
  const has = order[place.socialEnergy] ?? 0;
  if (has >= need) s += 3;

  // budget
  const b = place.budget;
  if (prefs.budget === 'any') s += 1;
  if (prefs.budget === 'low' && (b === '€' || b === '€€')) s += 2;
  if (prefs.budget === 'mid' && (b === '€€' || b === '€€€')) s += 2;

  // category preference (optional)
  if (prefs.category !== 'any' && place.category === prefs.category) s += 2;

  return s;
}

// Fisher-Yates shuffle
function pickN(arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

// Create element from HTML string
function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// Get category color class
function getCategoryClass(category) {
  const classes = {
    'cafe': 'chip--cafe',
    'restaurant': 'chip--cafe',
    'museum': 'chip--museum',
    'culture': 'chip--museum',
    'library': 'chip--museum'
  };
  return classes[category] || '';
}

// Render results with animations
function renderResults(container, results) {
  // Fade out existing content
  container.style.opacity = '0';
  container.style.transform = 'translateY(10px)';

  setTimeout(() => {
    container.innerHTML = '';

    if (results.length === 0) {
      container.appendChild(el(`
        <div class="box" style="text-align: center;">
          <p class="lead">Je n'ai rien de parfaitement align\u00e9 avec ces crit\u00e8res\u2026</p>
          <p class="muted">Essaie en \u00e9largissant : budget "peu importe" ou \u00e9nergie "neutre".</p>
        </div>
      `));
      container.style.opacity = '1';
      container.style.transform = 'translateY(0)';
      return;
    }

    const list = el('<div class="cards"></div>');

    results.forEach(p => {
      const website = p.links?.website
        ? `<a class="btn btn--ghost btn--sm" href="${p.links.website}" target="_blank" rel="noopener">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            Site
           </a>`
        : '';

      const transit = (p.transit || []).join(' \u00b7 ');
      const addr = p.address && p.address !== '(\u00e0 compl\u00e9ter)' ? `<div class="fine">${p.address}</div>` : '';
      const chipClass = getCategoryClass(p.category);

      list.appendChild(el(`
        <article class="cardx">
          <div class="cardx__top">
            <div>
              <h3 class="cardx__title">${p.name}</h3>
              <div class="cardx__meta">${p.area} \u00b7 ${p.budget} \u00b7 ${p.category}</div>
            </div>
            <div class="chip ${chipClass}">Solo-friendly</div>
          </div>
          <p class="cardx__desc">${p.soloWhy}</p>
          ${transit ? `<div class="cardx__meta">${transit}</div>` : ''}
          ${addr}
          <div class="cardx__actions">
            ${website}
            <button class="btn btn--solid btn--sm" data-copy="${encodeURIComponent(p.name + ' \u2014 ' + p.area)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copier
            </button>
          </div>
        </article>
      `));
    });

    container.appendChild(list);

    // Animate in
    container.style.opacity = '1';
    container.style.transform = 'translateY(0)';

    // Copy button handlers
    container.querySelectorAll('button[data-copy]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const txt = decodeURIComponent(btn.getAttribute('data-copy'));
        try {
          await navigator.clipboard.writeText(txt);
          btn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Copi\u00e9 !
          `;
          btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
          showToast('\u2713 Copi\u00e9 dans le presse-papiers', 'success');

          setTimeout(() => {
            btn.innerHTML = `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copier
            `;
            btn.style.background = '';
          }, 1500);
        } catch (e) {
          showToast('Erreur lors de la copie', 'error');
        }
      });
    });
  }, 200);
}

// Enhance select to premium pill buttons
function enhanceSelectToPills(select) {
  select.classList.add('select--hidden');

  const wrap = document.createElement('div');
  wrap.className = 'pills';
  wrap.setAttribute('role', 'group');
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
      buttons.forEach(x => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');

      // Add ripple effect
      b.style.transform = 'scale(0.95)';
      setTimeout(() => {
        b.style.transform = '';
      }, 100);

      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    buttons.push(b);
    wrap.appendChild(b);
  });

  select.insertAdjacentElement('afterend', wrap);
}

// Intersection Observer for scroll animations
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.section, .box, .card').forEach(el => {
    observer.observe(el);
  });
}

// Main app initialization
async function main() {
  const places = await loadPlaces();
  const form = document.querySelector('#soloForm');
  const out = document.querySelector('#soloResults');
  const reroll = document.querySelector('#soloReroll');

  // Add transition styles to results container
  out.style.transition = 'opacity 0.3s ease, transform 0.3s ease';

  // Turn selects into pills
  form.querySelectorAll('select.select').forEach(enhanceSelectToPills);

  // Initialize scroll animations
  initScrollAnimations();

  let last = [];

  function getPrefs() {
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

  function compute() {
    const prefs = getPrefs();
    const scored = places
      .map(p => ({ p, s: scorePlace(p, prefs) }))
      .sort((a, b) => b.s - a.s);

    const top = scored.filter(x => x.s > 0).slice(0, 10).map(x => x.p);
    last = pickN(top.length ? top : places, 3);
    renderResults(out, last);
  }

  // Event listeners
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    compute();
  });

  reroll.addEventListener('click', (e) => {
    e.preventDefault();
    // Add spin animation to button
    reroll.style.transform = 'rotate(360deg)';
    reroll.style.transition = 'transform 0.5s ease';
    setTimeout(() => {
      reroll.style.transform = '';
      reroll.style.transition = '';
    }, 500);
    compute();
  });

  // Recompute on any selection change
  form.addEventListener('change', () => compute());

  // Initial computation
  compute();

  // Add smooth scroll behavior for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

// Initialize app
main().catch(err => {
  const out = document.querySelector('#soloResults');
  if (out) {
    out.innerHTML = `
      <div class="box" style="text-align: center;">
        <p class="lead">Oups. L'outil n'a pas charg\u00e9.</p>
        <p class="muted">Recharge la page (et je corrige de mon c\u00f4t\u00e9).</p>
      </div>
    `;
  }
});
