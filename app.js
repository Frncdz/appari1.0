/* ============================================================
   APPARI — app.js  |  Vanilla JS, IndexedDB, PWA
   ============================================================ */
'use strict';

// ============================================================
//  DATABASE
// ============================================================
let db;
const DB_NAME    = 'appari_db';
const DB_VERSION = 1;

function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('movements')) {
        const s = d.createObjectStore('movements', { keyPath: 'id', autoIncrement: true });
        s.createIndex('date', 'date'); s.createIndex('type', 'type');
      }
      if (!d.objectStoreNames.contains('categories'))
        d.createObjectStore('categories', { keyPath: 'id', autoIncrement: true });
      if (!d.objectStoreNames.contains('settings'))
        d.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = e => { db = e.target.result; res(db); };
    req.onerror   = e => rej(e);
  });
}

const dbGet    = (store,key)   => new Promise((res,rej)=>{ const t=db.transaction(store,'readonly');  const r=t.objectStore(store).get(key);    r.onsuccess=()=>res(r.result); r.onerror=rej; });
const dbPut    = (store,value) => new Promise((res,rej)=>{ const t=db.transaction(store,'readwrite'); const r=t.objectStore(store).put(value);   r.onsuccess=()=>res(r.result); r.onerror=rej; });
const dbAdd    = (store,value) => new Promise((res,rej)=>{ const t=db.transaction(store,'readwrite'); const r=t.objectStore(store).add(value);   r.onsuccess=()=>res(r.result); r.onerror=rej; });
const dbDelete = (store,key)   => new Promise((res,rej)=>{ const t=db.transaction(store,'readwrite'); const r=t.objectStore(store).delete(key);  r.onsuccess=()=>res();         r.onerror=rej; });
const dbGetAll = (store)       => new Promise((res,rej)=>{ const t=db.transaction(store,'readonly');  const r=t.objectStore(store).getAll();     r.onsuccess=()=>res(r.result); r.onerror=rej; });

// ============================================================
//  CONSTANTS
// ============================================================
const DEFAULT_CATEGORIES = [
  {emoji:'🍔',name:'Comida'},{emoji:'🚗',name:'Transporte'},{emoji:'🏠',name:'Alquiler'},
  {emoji:'💊',name:'Salud'},{emoji:'🎬',name:'Ocio'},{emoji:'👗',name:'Ropa'},
  {emoji:'📱',name:'Tecnología'},{emoji:'📚',name:'Educación'},{emoji:'💡',name:'Servicios'},
  {emoji:'🛒',name:'Mercado'},{emoji:'🥩',name:'Carne'},{emoji:'⛽',name:'Gas/Combust.'},
  {emoji:'💼',name:'Trabajo'},{emoji:'💰',name:'Sueldo'},{emoji:'🎁',name:'Regalos'},{emoji:'🐾',name:'Mascotas'},
];
const EMOJI_OPTIONS=['🍔','🍕','🍜','☕','🥩','🍎','🛒','🚗','🚌','✈️','🏠','💡','💊','🏋️','🎬','🎮','📱','💻','👗','👟','📚','🎓','💼','💰','🏦','💳','🎁','🐾','⛽','🔧','🌿','🎵','🏖️','🎯','🌟','💎','🛍️','🎪','🚀','📦'];
const MONTH_NAMES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MONTH_SHORT=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const CHART_COLORS=['#FF6B2B','#1DB954','#007AFF','#FF9F0A','#8E44AD','#E3180A','#0097A7','#2ECC71','#FF375F','#F39C12','#6C3483','#1ABC9C'];

// ============================================================
//  STATE
// ============================================================
const APP={
  pin:null,name:'Usuario',balanceHidden:false,
  movements:[],categories:[],
  currentMovement:null,editingMovId:null,editingCatId:null,
  selectedType:'expense',selectedCategory:null,selectedEmoji:'📦',
  currentFilter:'all',reportMonth:null,
  expenseChart:null,barChart:null,
  pinState:'enter',pinFirst:'',
};

// ============================================================
//  UTILS
// ============================================================
const fmt   = n => 'S/ '+(n||0).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
const esc   = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const setEl = (id,text) => { const el=document.getElementById(id); if(el) el.textContent=text; };

function fmtDateLabel(dateStr){
  const d=new Date(dateStr+'T00:00:00'),today=new Date(); today.setHours(0,0,0,0);
  const diff=Math.round((today-d)/86400000);
  if(diff===0)return'Hoy'; if(diff===1)return'Ayer';
  return d.toLocaleDateString('es-PE',{weekday:'short',day:'numeric',month:'short'});
}
const getMonthKey   = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const parseMonthKey = k => { const[y,m]=k.split('-'); return new Date(+y,+m-1,1); };

let _toast;
function showToast(msg){
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.add('show');
  clearTimeout(_toast); _toast=setTimeout(()=>el.classList.remove('show'),2800);
}

// ============================================================
//  SCREENS & TABS
// ============================================================
function showScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const el=document.getElementById('screen-'+id); if(el) el.classList.add('active');
}
function switchTab(tab){
  showScreen(tab);
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.querySelectorAll(`[data-tab="${tab}"]`).forEach(n=>n.classList.add('active'));
  if(tab==='reports')    renderReports();
  if(tab==='categories') renderCategoryList();
  if(tab==='settings'){  const el=document.getElementById('settings-name'); if(el) el.value=APP.name; }
}
window.switchTab=switchTab;

// ============================================================
//  PIN
// ============================================================
let pinBuf='', pinConfBuf='';

async function initPin(){
  const p=await dbGet('settings','pin');
  if(p){ APP.pin=p.value; APP.pinState='enter'; setEl('pin-label','Ingresa tu PIN'); setEl('pin-setup-info',''); }
  else { APP.pinState='setup'; setEl('pin-label','Crea tu PIN de 4 dígitos'); setEl('pin-setup-info','Elige un PIN que puedas recordar fácilmente'); }
}

document.getElementById('pin-grid').addEventListener('click',e=>{
  const btn=e.target.closest('.pin-btn'); if(!btn) return;
  if(btn.id==='pin-del'){
    if(APP.pinState==='confirm') pinConfBuf=pinConfBuf.slice(0,-1);
    else pinBuf=pinBuf.slice(0,-1);
    updateDots(); return;
  }
  const n=btn.dataset.n; if(n===undefined) return;
  if(APP.pinState==='confirm'){ if(pinConfBuf.length>=4)return; pinConfBuf+=n; }
  else { if(pinBuf.length>=4)return; pinBuf+=n; }
  updateDots();
  if(APP.pinState==='enter'   &&pinBuf.length===4)    checkPin();
  if(APP.pinState==='setup'   &&pinBuf.length===4)    goConfirm();
  if(APP.pinState==='confirm' &&pinConfBuf.length===4) confirmPin();
});

function updateDots(){
  const len=APP.pinState==='confirm'?pinConfBuf.length:pinBuf.length;
  document.querySelectorAll('.pin-dot').forEach((d,i)=>d.classList.toggle('filled',i<len));
}
async function checkPin(){
  if(pinBuf===APP.pin){ pinBuf=''; updateDots(); await loadApp(); showScreen('home'); }
  else{ setEl('pin-error','PIN incorrecto. Intenta de nuevo.'); pinBuf=''; updateDots(); setTimeout(()=>setEl('pin-error',''),2200); }
}
function goConfirm(){ APP.pinFirst=pinBuf; pinBuf=''; APP.pinState='confirm'; setEl('pin-label','Confirma tu PIN'); setEl('pin-setup-info','Vuelve a ingresar el mismo PIN'); updateDots(); }
async function confirmPin(){
  if(pinConfBuf===APP.pinFirst){
    await dbPut('settings',{key:'pin',value:pinConfBuf}); APP.pin=pinConfBuf;
    pinConfBuf=''; pinBuf=''; APP.pinState='enter';
    showToast('✅ PIN creado'); await loadApp(); showScreen('home');
  } else {
    setEl('pin-error','Los PINs no coinciden.'); pinConfBuf=''; APP.pinState='setup'; pinBuf='';
    setEl('pin-label','Crea tu PIN de 4 dígitos'); updateDots();
    setTimeout(()=>setEl('pin-error',''),2500);
  }
}
async function changePin(){
  const curr=document.getElementById('pin-current').value;
  const nw=document.getElementById('pin-new').value;
  const conf=document.getElementById('pin-confirm').value;
  if(curr!==APP.pin){showToast('❌ PIN actual incorrecto');return;}
  if(!/^\d{4}$/.test(nw)){showToast('❌ El PIN debe tener 4 dígitos');return;}
  if(nw!==conf){showToast('❌ Los PINs no coinciden');return;}
  await dbPut('settings',{key:'pin',value:nw}); APP.pin=nw;
  closeModal('modal-pin-change');
  ['pin-current','pin-new','pin-confirm'].forEach(id=>document.getElementById(id).value='');
  showToast('✅ PIN actualizado');
}
window.changePin=changePin;
window.openChangePinModal=()=>openModal('modal-pin-change');

// ============================================================
//  INIT / LOAD
// ============================================================
async function init(){
  await openDB();
  const nd=await dbGet('settings','name'); if(nd) APP.name=nd.value;
  await initPin();
  document.getElementById('loading').style.display='none';
  showScreen('pin');
}
async function loadApp(){
  APP.movements=await dbGetAll('movements');
  APP.categories=await dbGetAll('categories');
  if(!APP.categories.length){ for(const c of DEFAULT_CATEGORIES) await dbAdd('categories',c); APP.categories=await dbGetAll('categories'); }
  APP.reportMonth=getMonthKey(new Date());
  updateGreeting(); renderMovements(); updateBalance(); renderAnalysis();
}

// ============================================================
//  BALANCE & GREETING
// ============================================================
function toggleBalance(){ APP.balanceHidden=!APP.balanceHidden; updateBalance();
  const btn=document.getElementById('balance-eye-btn'); if(!btn)return;
  btn.innerHTML=APP.balanceHidden
    ?`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
    :`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
}
window.toggleBalance=toggleBalance;

function updateBalance(){
  const now=new Date();
  const movs=APP.movements.filter(m=>{const d=new Date(m.date);return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();});
  const inc=movs.filter(m=>m.type==='income').reduce((s,m)=>s+m.amount,0);
  const exp=movs.filter(m=>m.type==='expense').reduce((s,m)=>s+m.amount,0);
  const bal=inc-exp;
  setEl('balance-display',  APP.balanceHidden?'••••••':fmt(bal));
  setEl('total-income-header',  APP.balanceHidden?'••••':fmt(inc));
  setEl('total-expense-header', APP.balanceHidden?'••••':fmt(exp));
}
function updateGreeting(){
  const name=APP.name||'Usuario', h=new Date().getHours();
  const greet=h<12?'Buenos días':h<19?'Buenas tardes':'Buenas noches';
  setEl('header-name',name); setEl('greeting-sub',greet);
  const av=document.getElementById('header-avatar'); if(av) av.textContent=name.charAt(0).toUpperCase();
}

// ============================================================
//  MOVEMENTS RENDER
// ============================================================
function renderMovements(){
  const list=document.getElementById('movements-list'); if(!list)return;
  let items=[...APP.movements].sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(APP.currentFilter==='income')  items=items.filter(m=>m.type==='income');
  if(APP.currentFilter==='expense') items=items.filter(m=>m.type==='expense');
  if(!items.length){
    list.innerHTML=`<div class="empty-state"><div class="empty-icon">💸</div><p>Sin movimientos aún.<br>Toca <strong>+</strong> para agregar uno.</p></div>`;
    return;
  }
  const groups={};
  items.forEach(m=>{ if(!groups[m.date])groups[m.date]=[]; groups[m.date].push(m); });
  let html='';
  Object.entries(groups).forEach(([date,movs],gi)=>{
    html+=`<div class="date-group-label">${fmtDateLabel(date)}</div>`;
    movs.forEach((m,i)=>{
      const cat=APP.categories.find(c=>c.id===m.categoryId);
      const emoji=cat?cat.emoji:'💸', catName=cat?cat.name:'Sin categoría';
      const isInc=m.type==='income', sign=isInc?'+':'-';
      const delay=((gi*0.05)+(i*0.04)).toFixed(2);
      html+=`<div class="movement-item" onclick="openDetail(${m.id})" style="animation-delay:${delay}s;">
        <div class="movement-icon-wrap ${m.type}">${emoji}</div>
        <div class="movement-info">
          <div class="movement-desc">${esc(m.description)}</div>
          <div class="movement-meta">${esc(catName)}${m.note?' · '+esc(m.note.substring(0,30)):''}</div>
        </div>
        <div class="movement-amount ${m.type}">${sign}${fmt(m.amount)}</div>
      </div>`;
    });
  });
  list.innerHTML=html;
}

document.getElementById('filter-chips').addEventListener('click',e=>{
  const chip=e.target.closest('.filter-chip'); if(!chip)return;
  document.querySelectorAll('.filter-chip').forEach(c=>c.classList.remove('active'));
  chip.classList.add('active'); APP.currentFilter=chip.dataset.filter; renderMovements();
});

// ============================================================
//  ADD / EDIT MODAL
// ============================================================
function openAddModal(t){
  APP.editingMovId=null; APP.selectedType=t||'expense'; APP.selectedCategory=null;
  setEl('modal-add-title','Nuevo Movimiento');
  ['form-amount','form-desc','form-note'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('form-date').value=new Date().toISOString().split('T')[0];
  selectType(APP.selectedType); renderModalCategories(); openModal('modal-add');
}
window.openAddModal=openAddModal;

function openEditModal(m){
  APP.editingMovId=m.id; APP.selectedType=m.type; APP.selectedCategory=m.categoryId||null;
  setEl('modal-add-title','Editar Movimiento');
  document.getElementById('form-amount').value=m.amount;
  document.getElementById('form-desc').value=m.description;
  document.getElementById('form-note').value=m.note||'';
  document.getElementById('form-date').value=m.date;
  selectType(m.type); renderModalCategories(); openModal('modal-add');
}

function selectType(type){
  APP.selectedType=type;
  document.getElementById('type-income').className ='type-btn'+(type==='income' ?' selected-income':'');
  document.getElementById('type-expense').className='type-btn'+(type==='expense'?' selected-expense':'');
}
window.selectType=selectType;

function renderModalCategories(){
  const g=document.getElementById('modal-categories'); if(!g)return;
  g.innerHTML=APP.categories.map(c=>`
    <div class="cat-item ${APP.selectedCategory===c.id?'selected':''}" onclick="selectCat(${c.id})">
      <span class="cat-emoji">${c.emoji}</span>
      <span class="cat-name">${esc(c.name)}</span>
    </div>`).join('');
}
function selectCat(id){ APP.selectedCategory=APP.selectedCategory===id?null:id; renderModalCategories(); }
window.selectCat=selectCat;

async function saveMovement(){
  const amount=parseFloat(document.getElementById('form-amount').value);
  const desc=document.getElementById('form-desc').value.trim();
  const date=document.getElementById('form-date').value;
  const note=document.getElementById('form-note').value.trim();
  if(!amount||amount<=0){showToast('⚠️ Ingresa un monto válido');return;}
  if(!desc){showToast('⚠️ Agrega una descripción');return;}
  if(!date){showToast('⚠️ Selecciona una fecha');return;}
  const mov={type:APP.selectedType,amount,description:desc,date,note,categoryId:APP.selectedCategory};
  if(APP.editingMovId){
    mov.id=APP.editingMovId; await dbPut('movements',mov);
    APP.movements=APP.movements.map(m=>m.id===mov.id?{...m,...mov}:m);
    showToast('✅ Movimiento actualizado');
  } else {
    const id=await dbAdd('movements',mov); mov.id=id; APP.movements.push(mov);
    showToast(APP.selectedType==='income'?'✅ Ingreso registrado':'✅ Gasto registrado');
  }
  closeModal('modal-add'); renderMovements(); updateBalance(); renderAnalysis();
}
window.saveMovement=saveMovement;

// ============================================================
//  DETAIL
// ============================================================
function openDetail(id){
  const m=APP.movements.find(x=>x.id===id); if(!m)return;
  APP.currentMovement=m;
  const cat=APP.categories.find(c=>c.id===m.categoryId);
  setEl('detail-emoji',cat?cat.emoji:'💸');
  const amEl=document.getElementById('detail-amount');
  if(amEl){amEl.textContent=(m.type==='income'?'+':'-')+fmt(m.amount); amEl.className='detail-modal-amount '+m.type;}
  setEl('detail-desc',m.description);
  setEl('detail-cat',cat?`${cat.emoji} ${cat.name}`:'Sin categoría');
  setEl('detail-date',fmtDateLabel(m.date));
  setEl('detail-note',m.note||'—');
  const badge=document.getElementById('detail-type-badge');
  if(badge){const iInc=m.type==='income'; badge.innerHTML=`<span class="badge ${iInc?'green':'red'}">${iInc?'📈 Ingreso':'📉 Gasto'}</span>`;}
  openModal('modal-detail');
}
window.openDetail=openDetail;
window.editCurrentDetail=()=>{ closeModal('modal-detail'); setTimeout(()=>openEditModal(APP.currentMovement),120); };
window.deleteCurrentDetail=async()=>{
  if(!APP.currentMovement)return;
  await dbDelete('movements',APP.currentMovement.id);
  APP.movements=APP.movements.filter(m=>m.id!==APP.currentMovement.id);
  APP.currentMovement=null; closeModal('modal-detail');
  renderMovements(); updateBalance(); renderAnalysis(); showToast('🗑️ Movimiento eliminado');
};

// ============================================================
//  ANALYSIS
// ============================================================
function renderAnalysis(){
  const now=new Date(),cY=now.getFullYear(),cM=now.getMonth();
  const prevD=new Date(cY,cM-1,1),pY=prevD.getFullYear(),pM=prevD.getMonth();
  const currExp=APP.movements.filter(m=>m.type==='expense'&&new Date(m.date).getFullYear()===cY&&new Date(m.date).getMonth()===cM).reduce((s,m)=>s+m.amount,0);
  const prevExp=APP.movements.filter(m=>m.type==='expense'&&new Date(m.date).getFullYear()===pY&&new Date(m.date).getMonth()===pM).reduce((s,m)=>s+m.amount,0);
  const tEl=document.getElementById('analysis-text'),sEl=document.getElementById('analysis-sub'),eEl=document.getElementById('analysis-emoji'),bEl=document.getElementById('analysis-bar');
  if(!tEl)return;
  if(!prevExp&&!currExp){tEl.innerHTML='Sin datos aún para este mes';sEl.textContent='Agrega tus primeros movimientos';eEl.textContent='📊';bEl.style.width='0%';bEl.classList.remove('over');return;}
  if(!prevExp){tEl.innerHTML=`Este mes llevas <span class="bad">${fmt(currExp)}</span> en gastos`;sEl.textContent=`Sin datos de ${MONTH_NAMES[pM]} para comparar`;eEl.textContent='📊';bEl.style.width='60%';bEl.classList.remove('over');return;}
  const diff=((currExp-prevExp)/prevExp)*100,abs=Math.abs(diff).toFixed(1);
  if(diff<0){tEl.innerHTML=`Gastaste <span class="good">${abs}% menos</span> que ${MONTH_NAMES[pM]}`;sEl.textContent=`${fmt(prevExp)} → ${fmt(currExp)} este mes`;eEl.textContent='🎉';bEl.style.width=Math.min(100,(currExp/prevExp)*100)+'%';bEl.classList.remove('over');}
  else if(diff===0){tEl.innerHTML=`Gastas <span class="neutral">igual</span> que ${MONTH_NAMES[pM]}`;sEl.textContent=`${fmt(currExp)} este mes`;eEl.textContent='📊';bEl.style.width='100%';bEl.classList.remove('over');}
  else{tEl.innerHTML=`Gastaste <span class="bad">${abs}% más</span> que ${MONTH_NAMES[pM]}`;sEl.textContent=`${fmt(prevExp)} → ${fmt(currExp)} este mes`;eEl.textContent='⚠️';bEl.style.width='100%';bEl.classList.add('over');}
}

// ============================================================
//  REPORTS
// ============================================================
function getMonths(){ const k=new Set([getMonthKey(new Date())]); APP.movements.forEach(m=>k.add(m.date.substring(0,7))); return Array.from(k).sort().reverse(); }
function renderReports(){
  const months=getMonths();
  if(!APP.reportMonth||!months.includes(APP.reportMonth)) APP.reportMonth=months[0]||getMonthKey(new Date());
  const tabsEl=document.getElementById('month-tabs');
  if(tabsEl) tabsEl.innerHTML=months.map(m=>{const d=parseMonthKey(m);return`<div class="month-tab ${m===APP.reportMonth?'active':''}" onclick="selectReportMonth('${m}')">${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}</div>`;}).join('');
  const movs=APP.movements.filter(m=>m.date.startsWith(APP.reportMonth));
  const inc=movs.filter(m=>m.type==='income').reduce((s,m)=>s+m.amount,0);
  const exp=movs.filter(m=>m.type==='expense').reduce((s,m)=>s+m.amount,0);
  const bal=inc-exp;
  setEl('rep-income',fmt(inc));setEl('rep-expense',fmt(exp));setEl('rep-balance',fmt(bal));setEl('rep-count',movs.length);
  const bEl=document.getElementById('rep-balance'); if(bEl) bEl.className='summary-tile-val '+(bal>=0?'green':'red');
  renderCharts();
}
function selectReportMonth(m){ APP.reportMonth=m; renderReports(); }
window.selectReportMonth=selectReportMonth;

function renderCharts(){ renderExpenseChart(); renderBarChart(); }

function renderExpenseChart(){
  const canvas=document.getElementById('expenseChart'); if(!canvas)return;
  if(APP.expenseChart){APP.expenseChart.destroy();APP.expenseChart=null;}
  const movs=APP.movements.filter(m=>m.type==='expense'&&m.date.startsWith(APP.reportMonth));
  const totals={};
  movs.forEach(m=>{ const cat=APP.categories.find(c=>c.id===m.categoryId); const name=cat?`${cat.emoji} ${cat.name}`:'💸 Otros'; totals[name]=(totals[name]||0)+m.amount; });
  const labels=Object.keys(totals),data=Object.values(totals);
  const legendEl=document.getElementById('chart-legend');
  if(legendEl) legendEl.innerHTML=labels.length?labels.map((l,i)=>`<div class="legend-item"><div class="legend-dot" style="background:${CHART_COLORS[i%CHART_COLORS.length]};"></div>${l}</div>`).join(''):'<div style="font-size:12px;color:var(--text-muted);">Sin gastos este mes</div>';
  APP.expenseChart=new Chart(canvas.getContext('2d'),{type:'doughnut',data:{labels,datasets:[{data:data.length?data:[1],backgroundColor:data.length?CHART_COLORS.slice(0,labels.length):['#E8E8ED'],borderWidth:0,hoverOffset:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>` ${fmt(ctx.raw)}`}}},cutout:'62%'}});
}
function renderBarChart(){
  const canvas=document.getElementById('barChart'); if(!canvas)return;
  if(APP.barChart){APP.barChart.destroy();APP.barChart=null;}
  const months=getMonths().slice(0,6).reverse();
  const labels=months.map(m=>{const d=parseMonthKey(m);return MONTH_SHORT[d.getMonth()];});
  const incomes=months.map(m=>APP.movements.filter(mv=>mv.type==='income'&&mv.date.startsWith(m)).reduce((s,mv)=>s+mv.amount,0));
  const expenses=months.map(m=>APP.movements.filter(mv=>mv.type==='expense'&&mv.date.startsWith(m)).reduce((s,mv)=>s+mv.amount,0));
  APP.barChart=new Chart(canvas.getContext('2d'),{type:'bar',data:{labels,datasets:[{label:'Ingresos',data:incomes,backgroundColor:'rgba(29,185,84,0.85)',borderRadius:8,borderSkipped:false},{label:'Gastos',data:expenses,backgroundColor:'rgba(227,24,10,0.75)',borderRadius:8,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{font:{family:'Outfit',size:11,weight:'700'},usePointStyle:true,pointStyleWidth:8}},tooltip:{callbacks:{label:ctx=>` ${fmt(ctx.raw)}`}}},scales:{x:{grid:{display:false},ticks:{font:{family:'Outfit',weight:'600'}}},y:{grid:{color:'#F0F0F5'},ticks:{callback:v=>'S/'+v,font:{family:'Outfit',weight:'600'}}}}}});
}

// ============================================================
//  PDF EXPORT
// ============================================================
async function exportPDF(){
  showToast('📄 Generando PDF…');
  try{
    const{jsPDF}=window.jspdf; const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'}); const W=210;
    doc.setFillColor(17,17,17); doc.rect(0,0,W,46,'F');
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(30); doc.text('Appari',20,22);
    doc.setFontSize(9);doc.setFont('helvetica','normal');doc.setTextColor(140,140,145);doc.text('Tus finanzas, en tus manos y bajo tu control',20,30);
    doc.setTextColor(255,255,255);doc.setFontSize(11);
    const d=parseMonthKey(APP.reportMonth||getMonthKey(new Date()));
    doc.text(`Reporte: ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,20,40);
    doc.text(`Generado: ${new Date().toLocaleDateString('es-PE')}`,W-68,40);
    const movs=APP.movements.filter(mv=>mv.date.startsWith(APP.reportMonth||getMonthKey(new Date())));
    const inc=movs.filter(mv=>mv.type==='income').reduce((s,mv)=>s+mv.amount,0);
    const exp=movs.filter(mv=>mv.type==='expense').reduce((s,mv)=>s+mv.amount,0);
    const bal=inc-exp;
    let y=56;
    const cards=[{l:'INGRESOS',v:fmt(inc),rgb:[29,185,84]},{l:'GASTOS',v:fmt(exp),rgb:[227,24,10]},{l:'BALANCE',v:fmt(bal),rgb:bal>=0?[29,185,84]:[227,24,10]},{l:'MOVIMIENTOS',v:String(movs.length),rgb:[255,107,43]}];
    const cw=(W-40-9)/4;
    cards.forEach((c,i)=>{const x=20+i*(cw+3);doc.setFillColor(242,242,247);doc.roundedRect(x,y,cw,25,3,3,'F');doc.setFontSize(7);doc.setFont('helvetica','bold');doc.setTextColor(110,110,115);doc.text(c.l,x+4,y+8);doc.setFontSize(11);doc.setTextColor(...c.rgb);doc.text(c.v,x+4,y+19);});
    y+=35;
    doc.setTextColor(17,17,17);doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text('Distribución de Gastos',20,y);y+=7;
    const catT={};
    movs.filter(mv=>mv.type==='expense').forEach(m=>{const cat=APP.categories.find(c=>c.id===m.categoryId);const name=cat?cat.name:'Otros';catT[name]=(catT[name]||0)+m.amount;});
    const sorted=Object.entries(catT).sort((a,b)=>b[1]-a[1]);
    const PC=[[255,107,43],[29,185,84],[0,102,204],[255,159,10],[142,68,173],[227,24,10]];
    sorted.forEach(([name,amount],i)=>{
      if(y>255)return;
      const pct=exp>0?((amount/exp)*100).toFixed(1):'0.0',bw=exp>0?Math.max(2,(amount/exp)*120):0,col=PC[i%PC.length];
      doc.setFillColor(...col);doc.roundedRect(20,y,bw,7,2,2,'F');doc.setFillColor(225,225,230);doc.roundedRect(20+bw,y,120-bw,7,2,2,'F');
      doc.setTextColor(17,17,17);doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.text(name,145,y+5.5);
      doc.setFont('helvetica','bold');doc.setTextColor(...col);doc.text(fmt(amount),174,y+5.5);
      doc.setFont('helvetica','normal');doc.setTextColor(110,110,115);doc.text(`${pct}%`,196,y+5.5);y+=12;
    });
    if(!sorted.length){doc.setTextColor(110,110,115);doc.setFontSize(10);doc.text('Sin gastos registrados',20,y);y+=12;}
    y+=8;if(y>230){doc.addPage();y=20;}
    doc.setTextColor(17,17,17);doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text('Detalle de Movimientos',20,y);y+=6;
    doc.setFillColor(17,17,17);doc.rect(20,y,W-40,9,'F');doc.setTextColor(255,255,255);doc.setFontSize(8);
    doc.text('Fecha',23,y+6);doc.text('Descripción',48,y+6);doc.text('Categoría',105,y+6);doc.text('Tipo',150,y+6);doc.text('Monto',174,y+6);y+=9;
    [...movs].sort((a,b)=>new Date(b.date)-new Date(a.date)).forEach((m,i)=>{
      if(y>277){doc.addPage();y=20;}
      const cat=APP.categories.find(c=>c.id===m.categoryId);
      if(i%2===0){doc.setFillColor(247,247,250);doc.rect(20,y,W-40,8,'F');}
      doc.setTextColor(17,17,17);doc.setFont('helvetica','normal');doc.setFontSize(8);
      doc.text(m.date,23,y+5.5);doc.text(m.description.substring(0,26),48,y+5.5);doc.text(cat?cat.name.substring(0,16):'Otros',105,y+5.5);
      const iInc=m.type==='income';doc.setTextColor(iInc?29:227,iInc?185:24,iInc?84:10);doc.text(iInc?'Ingreso':'Gasto',150,y+5.5);
      doc.text((iInc?'+':'-')+fmt(m.amount),171,y+5.5);y+=8;
    });
    const PH=297;doc.setFillColor(242,242,247);doc.rect(0,PH-18,W,18,'F');
    doc.setTextColor(150,150,155);doc.setFont('helvetica','normal');doc.setFontSize(8);
    doc.text('Appari · Tus finanzas, en tus manos y bajo tu control',20,PH-8);doc.text('Página 1',W-32,PH-8);
    doc.save(`Appari_${APP.reportMonth||getMonthKey(new Date())}.pdf`);
    showToast('✅ PDF exportado');
  }catch(err){console.error(err);showToast('❌ Error al generar PDF');}
}
window.exportPDF=exportPDF;

// ============================================================
//  CATEGORIES CRUD
// ============================================================
function renderCategoryList(){
  const list=document.getElementById('cat-list');if(!list)return;
  let html=`<button class="add-cat-btn" onclick="openAddCategoryModal()"><span style="font-size:20px;">＋</span> Nueva categoría</button>`;
  APP.categories.forEach((c,i)=>{
    const count=APP.movements.filter(m=>m.categoryId===c.id).length;
    html+=`<div class="cat-list-item" style="animation-delay:${i*0.04}s;"><div class="cat-list-emoji">${c.emoji}</div><div class="cat-list-info"><div class="cat-list-name">${esc(c.name)}</div><div class="cat-list-count">${count} movimiento${count!==1?'s':''}</div></div><div class="cat-list-actions"><button class="cat-action-btn edit" onclick="openEditCategoryModal(${c.id})">✏️</button><button class="cat-action-btn del" onclick="deleteCategory(${c.id})">🗑️</button></div></div>`;
  });
  list.innerHTML=html;
}
function openAddCategoryModal(){APP.editingCatId=null;APP.selectedEmoji='📦';setEl('modal-cat-title','Nueva Categoría');document.getElementById('form-cat-name').value='';renderEmojiPicker();openModal('modal-category');}
window.openAddCategoryModal=openAddCategoryModal;
function openEditCategoryModal(id){const cat=APP.categories.find(c=>c.id===id);if(!cat)return;APP.editingCatId=id;APP.selectedEmoji=cat.emoji;setEl('modal-cat-title','Editar Categoría');document.getElementById('form-cat-name').value=cat.name;renderEmojiPicker();openModal('modal-category');}
window.openEditCategoryModal=openEditCategoryModal;
function renderEmojiPicker(){const p=document.getElementById('emoji-picker');if(!p)return;p.innerHTML=EMOJI_OPTIONS.map(e=>`<div class="emoji-option ${e===APP.selectedEmoji?'selected':''}" onclick="selectEmoji('${e}')">${e}</div>`).join('');}
function selectEmoji(e){APP.selectedEmoji=e;renderEmojiPicker();}
window.selectEmoji=selectEmoji;
async function saveCategory(){
  const name=document.getElementById('form-cat-name').value.trim();if(!name){showToast('⚠️ Escribe un nombre');return;}
  if(APP.editingCatId){const cat={id:APP.editingCatId,emoji:APP.selectedEmoji,name};await dbPut('categories',cat);APP.categories=APP.categories.map(c=>c.id===APP.editingCatId?cat:c);showToast('✅ Categoría actualizada');}
  else{const id=await dbAdd('categories',{emoji:APP.selectedEmoji,name});APP.categories.push({id,emoji:APP.selectedEmoji,name});showToast('✅ Categoría creada');}
  closeModal('modal-category');renderCategoryList();
}
window.saveCategory=saveCategory;
async function deleteCategory(id){
  const count=APP.movements.filter(m=>m.categoryId===id).length;
  if(count>0&&!confirm(`Esta categoría tiene ${count} movimiento(s). ¿Eliminarla?`))return;
  await dbDelete('categories',id);APP.categories=APP.categories.filter(c=>c.id!==id);
  APP.movements=APP.movements.map(m=>m.categoryId===id?{...m,categoryId:null}:m);
  renderCategoryList();showToast('🗑️ Categoría eliminada');
}
window.deleteCategory=deleteCategory;

// ============================================================
//  SETTINGS
// ============================================================
async function updateName(v){APP.name=v||'Usuario';await dbPut('settings',{key:'name',value:APP.name});updateGreeting();}
window.updateName=updateName;
async function confirmClearData(){
  if(!confirm('⚠️ ¿Borrar TODOS los datos? Esta acción no se puede deshacer.'))return;
  const t=db.transaction(['movements','categories'],'readwrite');
  t.objectStore('movements').clear();t.objectStore('categories').clear();
  t.oncomplete=()=>{APP.movements=[];APP.categories=[];renderMovements();updateBalance();renderAnalysis();showToast('🗑️ Datos borrados');};
}
window.confirmClearData=confirmClearData;

// ============================================================
//  MODAL HELPERS
// ============================================================
function openModal(id){const el=document.getElementById(id);if(el){el.classList.add('open');document.body.style.overflow='hidden';}}
function closeModal(id){const el=document.getElementById(id);if(el){el.classList.remove('open');document.body.style.overflow='';}}
window.closeModal=closeModal;
document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)closeModal(o.id);}));

// ============================================================
//  SERVICE WORKER
// ============================================================
if('serviceWorker'in navigator){
  const sw=`const C='appari-v3',A=['/'];self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(A)));self.skipWaiting();});self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))));self.clients.claim();});self.addEventListener('fetch',e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).catch(()=>caches.match('/'))));});`;
  navigator.serviceWorker.register(URL.createObjectURL(new Blob([sw],{type:'application/javascript'}))).catch(()=>{});
}

// ============================================================
//  BOOT
// ============================================================
document.addEventListener('DOMContentLoaded',init);
