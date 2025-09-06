// --- Telegram identity (optional) ---
function getTGUser(){
  try{
    const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
    return u ? {id: String(u.id), name: u.username || 'гость'} : {id:'guest', name:'гость'};
  }catch{ return {id:'guest', name:'гость'} }
}
const TG = getTGUser();

// --- State ---
const state = {
  userId: TG.id,
  profile: { gender:'male', age:25, height:175, weight:70, goal:'maintain', location:'home' },
  foods: [],
  todayLog: [], // {name, grams, kcal, p, f, c, ts}
  history: {}, // dateISO -> array of entries
};

// --- Helpers ---
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
function fmt(n){return Math.round(n)}
function todayISO(){ return new Date().toISOString().slice(0,10) }
function save(){
  const key = `fitcoach_${state.userId}`;
  const payload = { profile: state.profile, history: state.history };
  localStorage.setItem(key, JSON.stringify(payload));
}
function load(){
  const key = `fitcoach_${state.userId}`;
  const raw = localStorage.getItem(key);
  if(raw){ try{ const d = JSON.parse(raw); state.profile = Object.assign(state.profile,d.profile||{}); state.history = d.history||{}; }catch{} }
}
function ensureToday(){ if(!state.history[todayISO()]) state.history[todayISO()] = []; state.todayLog = state.history[todayISO()]; }

// --- Foods DB ---
async function loadFoods(){
  try{
    const res = await fetch('data/foods.json', {cache:'no-store'});
    if(!res.ok) throw new Error('no foods file');
    state.foods = await res.json();
  }catch{
    // Fallback inline minimal set
    state.foods = window.__INLINE_FOODS__ || [
      {name:'Куриная грудка, варёная', kcal100:165, p:31, f:3.6, c:0},
      {name:'Гречка, сухая', kcal100:329, p:12.6, f:3.3, c:62},
      {name:'Рис, сухой', kcal100:344, p:6.7, f:0.7, c:78},
      {name:'Творог 5%', kcal100:145, p:17, f:5, c:2.8},
      {name:'Яйцо куриное', kcal100:143, p:12.6, f:10.6, c:0.7},
      {name:'Яблоко', kcal100:52, p:0.3, f:0.2, c:14},
      {name:'Банан', kcal100:96, p:1.2, f:0.3, c:21.8},
      {name:'Овсянка, сухая', kcal100:380, p:13, f:7, c:67},
      {name:'Лосось, запечённый', kcal100:208, p:22, f:13, c:0},
      {name:'Арахисовая паста', kcal100:588, p:25, f:50, c:20}
    ];
  }
}
function findFood(name){
  const n = name.trim().toLowerCase();
  return state.foods.find(f => f.name.toLowerCase() === n) || state.foods.find(f => f.name.toLowerCase().includes(n));
}
function kcalFor(food, grams){ return (food.kcal100 * grams)/100 }
function pfcFor(food, grams){ return {
  p: (food.p * grams)/100,
  f: (food.f * grams)/100,
  c: (food.c * grams)/100,
}}

// --- TDEE / BMR ---
function calcBMR({gender, age, height, weight}){
  // Mifflin–St Jeor, sedentary by default; activity can be added later
  return gender==='male' ? 10*weight + 6.25*height - 5*age + 5 : 10*weight + 6.25*height - 5*age - 161;
}
function applyGoal(bmr, goal){
  if(goal==='lose') return bmr * 0.85; // ~15% deficit
  if(goal==='gain') return bmr * 1.15; // ~15% surplus
  return bmr;
}

// --- UI INIT ---
async function init(){
  // TG UI polish
  try { window.Telegram?.WebApp?.expand(); } catch{}
  $('#userBadge').textContent = TG.name;

  load();
  await loadFoods();
  ensureToday();
  hydrateProfileForm();
  buildFoodDatalist();
  updateDashboard();
  buildLog();
  buildWorkouts();
  buildStats();
  bindTabs();
  bindForms();
}

function bindTabs(){
  $$('.tab-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      $$('.tab-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const id = btn.dataset.tab;
      $$('.tab-section').forEach(s=>s.classList.add('hidden'));
      $(id)?.classList.remove('hidden');
      window.scrollTo({top:0, behavior:'smooth'});
    })
  });
  // default
  document.querySelector('[data-tab="#tab-dashboard"]').classList.add('active');
}

function bindForms(){
  $('#profileForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    state.profile.gender = $('#gender').value;
    state.profile.age = +$('#age').value || state.profile.age;
    state.profile.height = +$('#height').value || state.profile.height;
    state.profile.weight = +$('#weight').value || state.profile.weight;
    state.profile.goal = $('#goal').value;
    state.profile.location = $('#location').value;
    save();
    updateDashboard();
    buildWorkouts();
    alert('Профиль сохранён');
  });
  $('#resetDayBtn').addEventListener('click', ()=>{
    state.history[todayISO()] = []; ensureToday(); save();
    updateDashboard(); buildLog(); buildStats();
  });

  $('#quickForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const name = $('#quickFood').value.trim();
    const grams = +$('#quickGrams').value;
    const food = findFood(name);
    if(!food) return $('#quickResult').textContent = 'Продукт не найден';
    if(!grams || grams<=0) return $('#quickResult').textContent = 'Укажите граммы';
    const kcal = kcalFor(food, grams);
    const {p,f,c} = pfcFor(food, grams);
    state.todayLog.push({name: food.name, grams, kcal, p, f, c, ts: Date.now()});
    save();
    $('#quickResult').textContent = `${fmt(kcal)} ккал добавлено`;
    $('#quickFood').value=''; $('#quickGrams').value='';
    updateDashboard(); buildLog(); buildStats();
  });

  $('#fitForm').addEventListener('submit',(e)=>{
    e.preventDefault();
    const name = $('#fitFood').value.trim();
    const leftInput = +$('#fitLeft').value;
    const food = findFood(name);
    if(!food) return $('#fitResult').textContent = 'Продукт не найден';
    const left = leftInput>0 ? leftInput : Math.max(0, getLeftKcal());
    const grams = left>0 ? Math.floor((left / food.kcal100) * 100) : 0;
    $('#fitResult').textContent = grams>0 ? `Можно около ${grams} г, чтобы не превысить лимит.` : 'Сегодня лимит уже исчерпан.';
  });

  $('#clearLogBtn').addEventListener('click',()=>{
    if(confirm('Очистить сегодняшний рацион?')){
      state.history[todayISO()] = []; ensureToday(); save(); updateDashboard(); buildLog(); buildStats();
    }
  });
}

function hydrateProfileForm(){
  $('#gender').value = state.profile.gender;
  $('#age').value = state.profile.age;
  $('#height').value = state.profile.height;
  $('#weight').value = state.profile.weight;
  $('#goal').value = state.profile.goal;
  $('#location').value = state.profile.location;
}

function buildFoodDatalist(){
  const dl = $('#foodsList'); dl.innerHTML = '';
  state.foods.forEach(f=>{
    const o = document.createElement('option');
    o.value = f.name; dl.appendChild(o);
  })
}

function sumToday(){
  return state.todayLog.reduce((acc,x)=>({
    kcal: acc.kcal + x.kcal,
    p: acc.p + x.p,
    f: acc.f + x.f,
    c: acc.c + x.c,
  }), {kcal:0,p:0,f:0,c:0});
}
function getLeftKcal(){
  const bmr = calcBMR(state.profile);
  const target = applyGoal(bmr, state.profile.goal);
  const eaten = sumToday().kcal;
  return Math.max(0, Math.round(target - eaten));
}

function updateDashboard(){
  const bmr = calcBMR(state.profile);
  const target = Math.round(applyGoal(bmr, state.profile.goal));
  const s = sumToday();
  $('#tdeeText').textContent = `${target} ккал`;
  const goalMap = {lose:'Дефицит ~15%', maintain:'Поддержание', gain:'Профицит ~15%'};
  $('#goalText').textContent = `${goalMap[state.profile.goal]} • ${state.profile.location==='gym'?'зал':'дом'}`;
  $('#eatenText').textContent = `${fmt(s.kcal)} ккал`;
  $('#pfcText').textContent = `${fmt(s.p)} / ${fmt(s.f)} / ${fmt(s.c)} г`;
  $('#leftText').textContent = `${Math.max(0, target - s.kcal)} ккал`;
}

function buildLog(){
  const ul = $('#logList'); ul.innerHTML = '';
  if(state.todayLog.length===0){ ul.innerHTML = '<li class="text-slate-400">Пока пусто</li>'; return; }
  state.todayLog.slice().reverse().forEach(entry=>{
    const li = document.createElement('li');
    li.className = 'flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-3 py-2';
    li.innerHTML = `<div>
      <div class="font-medium">${entry.name}</div>
      <div class="text-xs text-slate-400">${entry.grams} г • ${fmt(entry.kcal)} ккал • Б:${fmt(entry.p)} Ж:${fmt(entry.f)} У:${fmt(entry.c)}</div>
    </div>
    <button class="text-red-300 hover:text-red-200" title="Удалить"><i class="fa-solid fa-trash"></i></button>`;
    li.querySelector('button').addEventListener('click',()=>{
      const idx = state.todayLog.indexOf(entry);
      if(idx>-1) state.todayLog.splice(idx,1);
      save(); updateDashboard(); buildLog(); buildStats();
    });
    ul.appendChild(li);
  })
}

function buildStats(){
  const box = $('#statsBox');
  const days = Array.from({length:7}).map((_,i)=>{
    const d = new Date(); d.setDate(d.getDate()-i); return d.toISOString().slice(0,10);
  }).reverse();
  const rows = days.map(d=>{
    const arr = state.history[d]||[];
    const kcal = arr.reduce((s,x)=>s+x.kcal,0);
    return `<div class="flex items-center justify-between border-b border-white/10 py-1">
      <span class="text-slate-400">${d}</span>
      <span class="font-semibold">${fmt(kcal)} ккал</span>
    </div>`
  }).join('');
  box.innerHTML = rows;
}

// --- Workout recommendations ---
const WORKOUTS = {
  home: {
    lose: [
      {title:'Кардио + корпус', items:[
        {name:'Берпи', reps:'3×12', video:'https://www.youtube.com/watch?v=TU8QYVW0gDU'},
        {name:'Планка', reps:'3×40 сек', video:'https://www.youtube.com/watch?v=pSHjTRCQxIw'},
        {name:'Скручивания', reps:'3×20', video:'https://www.youtube.com/watch?v=wkD8rjkodUI'}
      ]},
      {title:'Ноги + ягодицы', items:[
        {name:'Приседания', reps:'4×15', video:'https://www.youtube.com/watch?v=aclHkVaku9U'},
        {name:'Выпады', reps:'3×12/нога', video:'https://www.youtube.com/watch?v=QOVaHwm-Q6U'}
      ]}
    ],
    maintain: [
      {title:'Фуллбоди', items:[
        {name:'Отжимания', reps:'4×12', video:'https://www.youtube.com/watch?v=_l3ySVKYVJ8'},
        {name:'Тяга в наклоне (с резиной)', reps:'4×12', video:'https://www.youtube.com/watch?v=vT2GjY_Umpw'},
        {name:'Приседания', reps:'4×15', video:'https://www.youtube.com/watch?v=aclHkVaku9U'}
      ]}
    ],
    gain: [
      {title:'Фуллбоди прогрессия', items:[
        {name:'Отжимания с отягощ.', reps:'5×8–12', video:'https://www.youtube.com/watch?v=_l3ySVKYVJ8'},
        {name:'Резиновая тяга шир.', reps:'5×10–12', video:'https://www.youtube.com/watch?v=vT2GjY_Umpw'},
        {name:'Приседания плие', reps:'5×12–15', video:'https://www.youtube.com/watch?v=3GpK4D8LQ6U'}
      ]}
    ]
  },
  gym: {
    lose: [
      {title:'Кардио + пресс', items:[
        {name:'Беговая дорожка', reps:'20–30 мин', video:'https://www.youtube.com/watch?v=QdQ1YxU1Zt0'},
        {name:'Скручивания на полу', reps:'4×20', video:'https://www.youtube.com/watch?v=wkD8rjkodUI'}
      ]}
    ],
    maintain: [
      {title:'Верх/Низ — День Верх', items:[
        {name:'Жим лёжа', reps:'4×6–10', video:'https://www.youtube.com/watch?v=rT7DgCr-3pg'},
        {name:'Тяга верхнего блока', reps:'4×8–12', video:'https://www.youtube.com/watch?v=CAwf7n6Luuc'},
        {name:'Жим гантелей сидя', reps:'3×8–12', video:'https://www.youtube.com/watch?v=B-aVuyhvLHU'}
      ]},
      {title:'Верх/Низ — День Низ', items:[
        {name:'Приседания со штангой', reps:'4×6–10', video:'https://www.youtube.com/watch?v=aclHkVaku9U'},
        {name:'Становая тяга', reps:'3×5–8', video:'https://www.youtube.com/watch?v=op9kVnSso6Q'}
      ]}
    ],
    gain: [
      {title:'Гипертрофия — Фуллбоди', items:[
        {name:'Жим гантелей лёжа', reps:'4×8–12', video:'https://www.youtube.com/watch?v=VmB1G1K7v94'},
        {name:'Тяга штанги в наклоне', reps:'4×8–12', video:'https://www.youtube.com/watch?v=vT2GjY_Umpw'},
        {name:'Жим ногами', reps:'4×10–15', video:'https://www.youtube.com/watch?v=IZxyjW7MPJQ'}
      ]}
    ]
  }
};

function buildWorkouts(){
  const box = $('#workoutPlan'); box.innerHTML = '';
  const loc = state.profile.location; const goal = state.profile.goal;
  const blocks = WORKOUTS[loc][goal];
  blocks.forEach(b=>{
    const card = document.createElement('div');
    card.className = 'glass p-4';
    card.innerHTML = `<div class="flex items-center justify-between mb-2">
      <h4 class="font-semibold">${b.title}</h4>
      <span class="badge">${loc==='gym'?'зал':'дом'} • ${goal}</span>
    </div>
    <ul class="space-y-2">${b.items.map(it=>`<li class="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2">
      <div>
        <div class=\"font-medium\">${it.name}</div>
        <div class=\"text-xs text-slate-400\">${it.reps}</div>
      </div>
      <a class=\"text-cyan-300 hover:text-cyan-200\" target=\"_blank\" rel=\"noopener\" href=\"${it.video}\">Видео</a>
    </li>`).join('')}</ul>`;
    box.appendChild(card);
  })
}
