// Phase 4 content: weekly focus, quote of the day, tips library, news feed.
//
// None of it is authored in the app. Local scheduled tasks gather and write it
// through tools/content_publish.py; this module only selects from what loaded.
// state.content / state.news are null when their table could not be read.

import { state } from './state.js';

export const TIP_CATEGORIES = ['Footwork', 'Defence', 'Offence', 'Conditioning', 'Recovery', 'Fuel & Weight'];

// Database value → chip label, in display order.
export const NEWS_CATEGORIES = [['pro', 'Pro'], ['amateur', 'Amateur'], ['science', 'Science'], ['austin', 'Local']];

export function newsCategoryLabel(key){
  const hit = NEWS_CATEGORIES.find(([k]) => k === key);
  return hit ? hit[1] : key;
}

// ISO 8601 week — the year is the Thursday's, so 29 Dec can belong to week 1.
export function isoWeekOf(iso){
  const d = new Date(iso + 'T00:00:00');
  const thursday = new Date(d.valueOf());
  thursday.setDate(d.getDate() - (d.getDay() + 6) % 7 + 3);
  const jan4 = new Date(thursday.getFullYear(), 0, 4);
  return { year: thursday.getFullYear(), week: 1 + Math.round((thursday - jan4) / (7 * 86400000)) };
}

function rows(kind){
  return (state.content || []).filter(c => c.kind === kind && c.active);
}

export function focusFor(iso){
  const { year, week } = isoWeekOf(iso);
  return rows('focus').find(f => f.year === year && f.week === week) || null;
}

// One quote per day, stable through the day, rotating across every stored quote.
export function quoteOfDay(iso){
  const quotes = rows('quote').sort((a, b) => a.id - b.id);
  if (!quotes.length) return null;
  const seed = Number(iso.slice(0,4)) * 372 + Number(iso.slice(5,7)) * 31 + Number(iso.slice(8,10));
  return quotes[seed % quotes.length];
}

export function tips(category){
  return rows('tip')
    .filter(t => !category || t.category === category)
    .sort((a, b) => TIP_CATEGORIES.indexOf(a.category) - TIP_CATEGORIES.indexOf(b.category) || b.id - a.id);
}

export function newsStories(category){
  return (state.news || []).filter(n => !category || n.category === category);
}
