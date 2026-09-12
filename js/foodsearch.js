// Food lookup against two free databases, straight from the browser.
//
// Both send `access-control-allow-origin: *`, so no proxy is needed — verified
// 2026-09-11. They cover different ground and the split matters:
//
//   USDA FoodData Central — whole foods. "chicken breast", "sweet potato".
//     Rate-limited to 10 requests/hour on DEMO_KEY. A free key lifts that:
//     https://fdc.nal.usda.gov/api-key-signup.html — drop it in below.
//   Open Food Facts — packaged goods by brand. Bigger catalogue, skews European.
//
// Barcode scanning is deliberately cut (settled 2026-09-11); OFF is used for
// name search only.

import { USDA_API_KEY } from './config.js';

const USDA = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const OFF  = 'https://world.openfoodfacts.org/cgi/search.pl';

// USDA returns Energy in kcal for most rows but kJ for some. Converting blind
// would triple the calories of anything already in kcal.
function energyKcal(nutrients){
  const e = nutrients.find(n => n.nutrientName === 'Energy' && /kcal/i.test(n.unitName || ''));
  if (e) return e.value;
  const kj = nutrients.find(n => n.nutrientName === 'Energy' && /kJ/i.test(n.unitName || ''));
  if (kj) return kj.value / 4.184;
  const any = nutrients.find(n => n.nutrientName === 'Energy');
  return any ? any.value : 0;
}
function nut(nutrients, name){
  const n = nutrients.find(x => x.nutrientName === name);
  return n ? n.value : 0;
}

async function searchUsda(q, signal){
  // dataType is a comma-separated list and USDA rejects percent-encoded commas
  // with a 400 — encodeURIComponent on the whole string is the obvious move and
  // the wrong one. Encode each type, join with literal commas.
  const types = ['Foundation', 'SR Legacy'].map(encodeURIComponent).join(',');
  const url = `${USDA}?api_key=${encodeURIComponent(USDA_API_KEY)}`
            + `&query=${encodeURIComponent(q)}&pageSize=12&dataType=${types}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(res.status === 429 || res.status === 403
    ? 'USDA rate limit reached — add a free API key in config.js'
    : `USDA ${res.status}`);
  const data = await res.json();
  return (data.foods || []).map(f => {
    const ns = f.foodNutrients || [];
    return {
      source: 'usda',
      sourceId: String(f.fdcId),
      name: f.description,
      brand: f.brandOwner || '',
      // USDA nutrient values are already per 100g for these data types.
      kcal100: Math.round(energyKcal(ns)),
      protein100: +nut(ns, 'Protein').toFixed(1),
      fat100: +nut(ns, 'Total lipid (fat)').toFixed(1),
      carb100: +nut(ns, 'Carbohydrate, by difference').toFixed(1),
      servingDesc: '100 g',
      servingGrams: 100
    };
  }).filter(f => f.kcal100 > 0);
}

// Open Food Facts drops connections intermittently — measured 2026-09-12, the
// same request succeeding and failing minutes apart regardless of fields or
// page size. It is a secondary source, so retry once quietly and let the
// caller carry on with USDA results either way.
async function fetchRetry(url, signal, tries = 2){
  let last;
  for (let i = 0; i < tries; i++){
    try {
      const res = await fetch(url, { signal });
      if (res.ok) return res;
      last = new Error(`${res.status}`);
    } catch(e){
      if (e.name === 'AbortError') throw e;
      last = e;
    }
    if (i < tries - 1) await new Promise(r => setTimeout(r, 400));
  }
  throw last;
}

async function searchOff(q, signal){
  const url = `${OFF}?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1`
            + `&page_size=12&fields=product_name,brands,nutriments,serving_size,serving_quantity,code`;
  let res;
  try { res = await fetchRetry(url, signal); }
  catch(e){
    if (e.name === 'AbortError') throw e;
    throw new Error('Open Food Facts did not respond — showing whole foods only');
  }
  const data = await res.json();
  return (data.products || []).map(p => {
    const n = p.nutriments || {};
    const kcal = n['energy-kcal_100g'];
    if (!kcal || !p.product_name) return null;
    return {
      source: 'off',
      sourceId: p.code ? String(p.code) : null,
      name: p.product_name,
      brand: (p.brands || '').split(',')[0].trim(),
      kcal100: Math.round(kcal),
      protein100: +(n.proteins_100g || 0).toFixed(1),
      fat100: +(n.fat_100g || 0).toFixed(1),
      carb100: +(n.carbohydrates_100g || 0).toFixed(1),
      servingDesc: p.serving_size || '100 g',
      servingGrams: Number(p.serving_quantity) || 100
    };
  }).filter(Boolean);
}

// Both are queried; whichever answers contributes. One being down or rate
// limited must not take the search with it, so failures are collected and
// reported rather than thrown.
export async function searchFoods(q, signal){
  const query = (q || '').trim();
  if (query.length < 2) return { results: [], notes: [] };

  const settled = await Promise.allSettled([
    searchUsda(query, signal),
    searchOff(query, signal)
  ]);

  const results = [];
  const notes = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') results.push(...r.value);
    else if (r.reason && r.reason.name !== 'AbortError') {
      notes.push(r.reason.message || (i === 0 ? 'USDA unavailable' : 'Open Food Facts unavailable'));
    }
  });

  // Whole foods first: a search for "chicken breast" should not open with a
  // packaged deli product.
  results.sort((a,b) => (a.source === 'usda' ? 0 : 1) - (b.source === 'usda' ? 0 : 1));
  return { results: results.slice(0, 20), notes };
}

// Portion maths in one place. `qty` is servings or grams depending on `unit`.
export function portionMacros(food, qty, unit){
  const grams = unit === 'g' ? Number(qty) : Number(qty) * (food.servingGrams || 100);
  const k = grams / 100;
  return {
    kcal:    Math.round((food.kcal100 || 0) * k),
    protein: +(((food.protein100 || 0) * k).toFixed(1)),
    fat:     +(((food.fat100 || 0) * k).toFixed(1)),
    carb:    +(((food.carb100 || 0) * k).toFixed(1))
  };
}
