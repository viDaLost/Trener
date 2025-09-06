'use strict';

// Telegram user
function getTG() {
  try {
    const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
    return u ? { id: String(u.id), name: u.username || 'гость' } : { id: 'guest', name: 'гость' };
  } catch { return { id: 'guest', name: 'гость' }; }
}
const TG = getTG();

// State
const state = {
  userId: TG.id,
  profile: { gender: 'male', age: 25, height: 175, weight: 70, goal: 'maintain', location: 'home' },
  history: {}
};

// Helpers
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const todayISO = () => new Date().toISOString().slice(0, 10);
const key = () => `fitcoach_${state.userId}`;
const save = () => localStorage.setItem(key(), JSON.stringify({ profile: state.profile, history: state.history }));
const load = () => {
  const raw = localStorage.getItem(key());
  if (raw) { try { const d = JSON.parse(raw); state.profile = Object.assign(state.profile, d.profile || {}); state.history = d.history || {}; } catch { } }
};
function ensureToday() { if (!state.history[todayISO()]) state.history[todayISO()] = []; }
function sumToday() {
  const arr = state.history[todayISO()] || [];
  return arr.reduce((a, x) => ({ k: a.k + x.k, p: a.p + x.p, f: a.f + x.f, c: a.c + x.c }), { k: 0, p: 0, f: 0, c: 0 });
}

// BMR
function bmr({ gender, age, height, weight }) { return gender === 'male' ? (10 * weight + 6.25 * height - 5 * age + 5) : (10 * weight + 6.25 * height - 5 * age - 161); }
function targetKcal() { const base = bmr(state.profile); const g = state.profile.goal; return Math.round(g === 'lose' ? base * 0.85 : g === 'gain' ? base * 1.15 : base); }

// Food API
async function fetchFoodByName(q) {
  const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
  url.searchParams.set('search_terms', q);
  url.searchParams.set('search_simple', '1');
  url.searchParams.set('json', '1');
  url.searchParams.set('page_size', '5');
  const res = await fetch(url);
  const data = await res.json();
  return (data.products || []).map(p => ({
    name: p.product_name || 'Продукт',
    kcal100: p.nutriments?.['energy-kcal_100g'] ?? null,
    p: p.nutriments?.proteins_100g ?? 0,
    f: p.nutriments?.fat_100g ?? 0,
    c: p.nutriments?.carbohydrates_100g ?? 0,
  })).filter(x => x.kcal100);
}

// Update UI
function updateTop() {
  const t = targetKcal();
  const s = sumToday();
  $('#tdeeText').textContent = `${t} ккал`;
  $('#eatenText').textContent = `${Math.round(s.k)} ккал`;
  $('#leftText').textContent = `${Math.max(0, t - Math.round(s.k))} ккал`;
  $('#pfcText').textContent = `${Math.round(s.p)} / ${Math.round(s.f)} / ${Math.round(s.c)} г`;
  $('#goalBadge').textContent = `${state.profile.goal} • ${state.profile.location}`;
}

function buildLog() {
  const ul = $('#logList');
  const arr = state.history[todayISO()] || [];
  ul.innerHTML = '';
  if (arr.length === 0) { ul.innerHTML = '<li class="text-slate-400">Пока пусто</li>'; return; }
  arr.slice().reverse().forEach(item => {
    const li = document.createElement('li');
    li.className = 'li';
    li.innerHTML = `<div><div class="font-medium">${item.name}</div><div class="text-xs text-slate-400">${item.g} г • ${Math.round(item.k)} ккал</div></div><button class="text-red-300">Удалить</button>`;
    li.querySelector('button').addEventListener('click', () => {
      const ix = arr.indexOf(item); if (ix > -1) arr.splice(ix, 1);
      save(); updateTop(); buildLog();
    });
    ul.appendChild(li);
  });
}

// Events
function bindTabs() {
  $$('.tab-btn').forEach(b => b.addEventListener('click', () => {
    $$('.tab-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    const tgt = b.dataset.target;
    $$('.screen').forEach(s => s.classList.add('hidden'));
    $(tgt).classList.remove('hidden');
  }));
}

function bindForms() {
  $('#profileForm').addEventListener('submit', e => {
    e.preventDefault();
    state.profile.gender = $('#gender').value;
    state.profile.age = +$('#age').value || state.profile.age;
    state.profile.height = +$('#height').value || state.profile.height;
    state.profile.weight = +$('#weight').value || state.profile.weight;
    state.profile.goal = $('#goal').value;
    state.profile.location = $('#location').value;
    save(); updateTop();
    alert('Профиль сохранён');
  });

  $('#resetDay').addEventListener('click', () => {
    state.history[todayISO()] = [];
    save(); updateTop(); buildLog();
  });

  $('#addFoodForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#foodName').value.trim();
    const g = +$('#foodGrams').value;
    if (!name || !g) return;
    const items = await fetchFoodByName(name);
    if (!items.length) return;
    const food = items[0];
    const k = (food.kcal100 * g) / 100;
    ensureToday();
    state.history[todayISO()].push({ name: food.name, g, k, p: (food.p * g) / 100, f: (food.f * g) / 100, c: (food.c * g) / 100 });
    save();
    updateTop(); buildLog();
    $('#addFoodMsg').textContent = `Добавлено ~${Math.round(k)} ккал (${food.name})`;
  });
}

// Init
function init() {
  $('#userBadge').textContent = TG.name;
  load(); ensureToday(); updateTop(); buildLog();
  bindTabs(); bindForms();
}
window.addEventListener('DOMContentLoaded', init);
