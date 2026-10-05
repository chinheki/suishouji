import { periodStart, shiftPeriod } from './scatter.js?v=33';
import { renderScatter } from './scatter-ui.js?v=33';
import { openDatabase, recordOnce, normalizeName, exportBackup, validateBackup, importBackup } from './storage.js?v=33';
const demoMode = new URLSearchParams(location.search).get('demo') === '1';
const DB_NAME = demoMode ? 'suishouji-demo-v1' : 'suishouji';
const groups = ['conditions', 'results'];
const initialTags = [
  ['conditions', '吃了 GABA'], ['conditions', '运动了'],
  ['conditions', '喝了咖啡'], ['conditions', '晚睡了'],
  ['results', '睡得很好'], ['results', '睡得一般'],
  ['results', '头痛了'], ['results', '精神不错'],
];
let db, activeGroup, lastEvent, toastTimer;
const $ = (id) => document.getElementById(id);
const dialog = $('add-dialog');

function transaction(store, mode, operation) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = operation(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error || request.error);
    tx.onabort = () => reject(tx.error || new Error('保存中断'));
  });
}

function showError(message) { $('error').textContent = message; $('error').hidden = false; }
function clearError() { $('error').hidden = true; }

const iconNames={tortoise:'陆龟',cat:'猫',fish:'鱼',turtle:'水龟',face:'人类'};
let homeIcon='',selectedIcon='';
function iconImage(key){
  if(!iconNames[key])return null;
  const img=document.createElement('span');img.className='tag-icon';img.style.setProperty('--icon-url',`url("./icons/${key}.svg")`);img.setAttribute('role','img');img.setAttribute('aria-label',iconNames[key]);return img;
}
function prependIcon(node,key){const img=iconImage(key);if(img)node.prepend(img);}
function renderIconChoices(container,value,onSelect,filter=false){
  container.replaceChildren();
  for(const [key,name] of [['',filter?'全部':'无图标'],...Object.entries(iconNames),...(filter?[['none','未分类']]:[])]){
    const button=document.createElement('button');button.type='button';button.className='icon-choice';
    button.setAttribute('aria-label',name);button.setAttribute('aria-pressed',String(value===key));
    const img=iconImage(key);if(img)button.append(img);
    const text=document.createElement('span');text.textContent=name;button.append(text);
    button.addEventListener('click',()=>onSelect(key));container.append(button);
  }
}
function renderHomeIcons(){renderIconChoices($('home-icons'),homeIcon,key=>{homeIcon=key;renderHomeIcons();void renderTags().catch(()=>showError('标签读取失败，请重试。'));},true);}
function renderTagIcons(){renderIconChoices($('tag-icons'),selectedIcon,key=>{selectedIcon=key;renderTagIcons();});}
renderHomeIcons();
const homeExpanded = {conditions:false,results:false};
let homeRenderRevision=0;
const searchKey=text=>text.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,'');
function matchesHomeSearch(name,query){
  let at=0;for(const char of searchKey(name)){if(char===query[at])at++;}
  return at===query.length;
}
$('home-search').addEventListener('input',()=>void renderTags().catch(()=>showError('标签读取失败，请重试。')));
async function renderTags() {
  const revision=++homeRenderRevision;
  const tags = await transaction('tags', 'readonly', (store) => store.getAll());
  const events=await transaction('events','readonly',store=>store.getAll());
  if(revision!==homeRenderRevision)return;
  const lastUsed=new Map();
  for(const event of events){const time=Date.parse(event.occurredAt);if(time>(lastUsed.get(event.tagId)||0))lastUsed.set(event.tagId,time);}
  const query=searchKey($('home-search').value);
  for (const group of groups) {
    const container = $(group);
    container.replaceChildren();
    const matching=tags.filter(tag=>tag.group===group&&!tag.archived&&(!homeIcon||(homeIcon==='none'?!iconNames[tag.icon]:tag.icon===homeIcon))&&matchesHomeSearch(tag.name,query))
      .sort((a,b)=>(lastUsed.get(b.id)||0)-(lastUsed.get(a.id)||0)||(Date.parse(b.createdAt)||0)-(Date.parse(a.createdAt)||0)||(b.order||0)-(a.order||0)||a.id.localeCompare(b.id));
    const limit=group==='conditions'?10:5;
    const visible=query||homeExpanded[group]?matching:matching.slice(0,limit);
    visible.forEach((tag) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tag';
      button.textContent = tag.name; prependIcon(button,tag.icon);
      button.setAttribute('aria-label', `记录一次：${tag.name}`);
      button.addEventListener('click', () => recordEvent(tag, button));
      container.append(button);
    });
    if(!matching.length&&(query||homeIcon)){const empty=document.createElement('p');empty.className='empty';empty.textContent='没有匹配的标签';container.append(empty);}
    if(!query&&matching.length>limit){
      const toggle=document.createElement('button');toggle.type='button';toggle.className='tag home-expand';
      toggle.textContent=homeExpanded[group]?'收起':`展开其余 ${matching.length-limit} 个`;
      toggle.setAttribute('aria-expanded',String(homeExpanded[group]));
      toggle.addEventListener('click',()=>{homeExpanded[group]=!homeExpanded[group];void renderTags().catch(()=>showError('标签读取失败，请重试。'));});container.append(toggle);
    }
    const add = document.createElement('button');
    add.type = 'button'; add.className = 'tag add'; add.textContent = '＋ 标签';
    add.setAttribute('aria-label', `添加${group === 'conditions' ? '实验条件' : '实验结果'}标签`);
    add.addEventListener('click', () => openTagDialog(group));
    container.append(add); container.setAttribute('aria-busy', 'false');
  }
}

let editingTag = null;
function openTagDialog(group, tag = null) {
  editingTag = tag; activeGroup = group; selectedIcon=iconNames[tag?.icon]?tag.icon:'';renderTagIcons();
  $('dialog-title').textContent = `${tag ? '修改' : '添加'}${group === 'conditions' ? '实验条件' : '实验结果'}`;
  $('add-submit').textContent = tag ? '保存修改' : '添加标签';
  $('tag-name').value = tag?.name || ''; $('form-error').textContent = '';
  $('tag-name').placeholder = group === 'conditions' ? '例如：喝了茶' : '例如：心情很好';
  $('add-submit').disabled = true;
  dialog.showModal(); $('tag-name').focus(); void validateTagForm();
}

async function requestPersistence() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch { /* Persistence is optional; records remain in IndexedDB. */ }
}
let persistenceRequested = false;
async function recordEvent(tag, button) {
  // Capture the tap time, rather than the time the database finishes writing.
  const event = { id: crypto.randomUUID(), tagId: tag.id, tagName: tag.name, group: tag.group,
    occurredAt: new Date().toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    utcOffsetMinutes: -new Date().getTimezoneOffset() };
  button.disabled = true;
  try {
    const outcome = await recordOnce(db, event);
    if (outcome.status !== 'saved') {
      showError('这个标签已删除，请刷新首页。');
      return;
    }
    clearError(); lastEvent = event;
    button.classList.add('recorded');
    setTimeout(() => button.classList.remove('recorded'), 650);
    const time = new Date(event.occurredAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    $('toast-text').textContent = `已记录 ${tag.name} · ${time}`;
    $('undo').hidden = false; $('toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6500);
    if(currentPage==='home')void renderTags().catch(()=>{});
    if (!persistenceRequested) { persistenceRequested = true; void requestPersistence(); }
  } catch { showError('这次没有保存成功，请再点一次。若本机空间已满，请先释放空间。'); }
  finally { button.disabled = false; }
}

$('undo').addEventListener('click', async () => {
  if (!lastEvent) return;
  const target = lastEvent;
  $('undo').disabled = true;
  try {
    await transaction('events', 'readwrite', (store) => store.delete(target.id));
    if (lastEvent?.id === target.id) {
      lastEvent = null; $('toast-text').textContent = `已撤销 ${target.tagName}`; $('undo').hidden = true;
      clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2200);
    }
    clearError();
    if (currentPage === 'home') await renderTags();
    if (currentPage === 'stats') await renderStats();
  } catch { showError('撤销没有成功，请重试。'); }
  finally { $('undo').disabled = false; }
});
$('close-dialog').addEventListener('click', () => dialog.close());
let formRevision = 0;
let formSaving = false;
async function validateTagForm() {
  const revision = ++formRevision;
  $('add-submit').disabled = true;
  const name = normalizeName($('tag-name').value);
  $('form-error').textContent = '';
  if (!name || formSaving) return false;
  try {
    const existing = await transaction('tags', 'readonly', (store) => store.index('group_name').get([activeGroup, name]));
    if (revision !== formRevision) return false;
    if (existing && existing.id !== editingTag?.id) {
      $('form-error').textContent = existing.archived ? '这个标签已存在，可在设置中恢复。' : '这一组已经有这个标签了。';
      return false;
    }
    $('add-submit').disabled = false; return true;
  } catch { if (revision === formRevision) $('form-error').textContent = '暂时无法检查名称，请重新输入后重试。'; return false; }
}
$('tag-name').addEventListener('input', () => void validateTagForm());
$('add-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (formSaving || !await validateTagForm()) return;
  const name = normalizeName($('tag-name').value);
  formSaving = true; $('add-submit').disabled = true;
  try {
    const updated = {
      ...(editingTag || { id: crypto.randomUUID(), group: activeGroup, order: Date.now(), createdAt: new Date().toISOString() }),
      name, icon:selectedIcon,
      updatedAt: new Date().toISOString(),
    };
    await transaction('tags', 'readwrite', (store) => editingTag ? store.put(updated) : store.add(updated));
    if (currentPage === 'settings') await renderSettings();
    await renderTags(); dialog.close(); clearError();
  } catch (error) {
    if (error?.name === 'ConstraintError') {
      formSaving = false; await validateTagForm();
    } else {
      $('form-error').textContent = '标签没有保存成功，请重试。';
      $('add-submit').disabled = false;
    }
  } finally { formSaving = false; }
});

try {
  db = await openDatabase(DB_NAME, demoMode ? [] : initialTags, () => showError('请关闭其他打开的随手记页面，再刷新重试。'));
  if (demoMode) {
    const { seedDemo } = await import('./demo.js?v=33');
    await seedDemo(db);
    $('demo-banner').hidden = false;
    $('storage-status').textContent = '模拟数据 · 独立保存在本机';
  }
  db.onversionchange = () => { db.close(); showError('应用已更新，请刷新后继续记录。'); };
  await renderTags();
} catch { showError('无法打开本机数据库，请使用正常浏览模式，检查浏览器是否允许网站存储后刷新。'); }
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', {updateViaCache:'none'}).catch(() => {});

let currentPage = 'home';
const selectedConditions = new Set();
let selectedResult = null;
let allTime = false;
let statsGeneration = 0;
$('chart-month').value = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

async function showPage(page) {
  currentPage = page;
  document.querySelector('.app').scrollTo({ top: 0, behavior: 'instant' });
  for (const name of ['home', 'stats', 'settings', 'records']) $('page-' + name).hidden = name !== page;
  document.querySelectorAll('[data-page]').forEach((button) => {
    if (button.dataset.page === (page === 'records' ? 'stats' : page)) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  try {
    if (page === 'home') await renderTags();
    if (page === 'settings') await renderSettings();
    if (page === 'stats') await renderStats();
    if (page === 'records') await renderRecords();
  } catch { showError('读取记录失败，请刷新后重试。'); }
}
document.querySelectorAll('[data-page]').forEach((button) => button.addEventListener('click', () => showPage(button.dataset.page)));

let recordLimit=50, recordGeneration=0;
async function renderRecords() {
  const generation=++recordGeneration;
  const [events,tags]=await Promise.all([transaction('events','readonly',s=>s.getAll()),transaction('tags','readonly',s=>s.getAll())]);
  if(generation!==recordGeneration)return;
  const map=new Map(tags.map(t=>[t.id,t]));
  const query=$('records-search').value.trim().toLocaleLowerCase(),group=$('records-group').value;
  const from=$('records-from').value,to=$('records-to').value;
  const start=from?new Date(from+'T00:00:00').getTime():-Infinity;
  const finish=to?new Date(to+'T00:00:00'):null;if(finish)finish.setDate(finish.getDate()+1);
  const container=$('records-list');container.replaceChildren();
  if(from&&to&&from>to){$('records-summary').textContent='开始日期不能晚于结束日期。';$('records-more').hidden=true;return;}
  const rows=events.filter(e=>{
    const tag=map.get(e.tagId),name=e.tagName||tag?.name||'未知标签',time=Date.parse(e.occurredAt);
    return Number.isFinite(time)&&time>=start&&time<(finish?finish.getTime():Infinity)&&(!group||(e.group||tag?.group)===group)&&(!query||[name,tag?.name||''].some(n=>n.toLocaleLowerCase().includes(query)));
  }).sort((a,b)=>Date.parse(b.occurredAt)-Date.parse(a.occurredAt)||String(b.id).localeCompare(String(a.id)));
  $('records-summary').textContent=`共 ${rows.length} 条记录 · 已显示 ${Math.min(recordLimit,rows.length)} 条`;
  for(const event of rows.slice(0,recordLimit)){
    const tag=map.get(event.tagId),name=event.tagName||tag?.name||'未知标签';
    const card=document.createElement('details');card.className='record-card';
    const summary=document.createElement('summary'),title=document.createElement('strong'),time=document.createElement('time');
    title.textContent=name;time.dateTime=event.occurredAt;time.textContent=new Date(event.occurredAt).toLocaleString('zh-CN',{hour12:false});summary.append(title,time);
    const info=document.createElement('p');info.textContent=`${(event.group||tag?.group)==='conditions'?'实验条件':'实验结果'} · ${event.cycleDays?'记录时周期：'+event.cycleDays+' 天':'记录时未设周期'}${tag?.archived?' · 标签已删除':''}${tag&&tag.name!==name?' · 当前名称：'+tag.name:''}`;
    card.append(summary,info);container.append(card);
  }
  if(!rows.length)container.append(empty('没有符合筛选条件的记录。'));
  $('records-more').hidden=rows.length<=recordLimit;
}
$('view-records').addEventListener('click',()=>{recordLimit=50;void showPage('records');});
$('records-back').addEventListener('click',()=>void showPage('stats'));
for(const id of ['records-search','records-group','records-from','records-to']) $(id).addEventListener(id==='records-search'?'input':'change',()=>{recordLimit=50;void renderRecords().catch(()=>showError('记录读取失败，请重试。'));});
$('records-reset').addEventListener('click',()=>{for(const id of ['records-search','records-group','records-from','records-to'])$(id).value='';recordLimit=50;void renderRecords().catch(()=>showError('记录读取失败，请重试。'));});
$('records-more').addEventListener('click',()=>{recordLimit+=50;void renderRecords().catch(()=>showError('记录读取失败，请重试。'));});

async function renderSettings() {
  const tags = await transaction('tags', 'readonly', (store) => store.getAll());
  tags.sort((a, b) => a.order - b.order);
  const row = (tag) => {
    const element = document.createElement('div'); element.className = 'manage-row';
    const label = document.createElement('button'); label.type = 'button'; label.className = 'edit-tag';
    label.setAttribute('aria-label', `修改标签：${tag.name}`);
    label.addEventListener('click', () => openTagDialog(tag.group, tag));
    label.textContent = tag.name; prependIcon(label,tag.icon);
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = tag.archived ? '恢复' : '删除';
    button.className = tag.archived ? 'restore' : '';
    button.setAttribute('aria-label', `${tag.archived ? '恢复' : '删除'}${tag.group === 'conditions' ? '条件' : '结果'}标签：${tag.name}`);
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        if(!tag.archived){
          const used=await transaction('events','readonly',store=>store.index('tagId').count(tag.id));
          if(used&&!confirm(`“${tag.name}”已有 ${used} 条记录。删除只会隐藏标签，历史记录保留。确定删除？`)){button.disabled=false;return;}
        }
        // Archive only the tag; event rows and their tag IDs remain unchanged.
        await transaction('tags', 'readwrite', (store) => store.put({ ...tag, archived: !tag.archived }));
        await renderSettings(); await renderTags(); clearError();
      } catch { showError('标签没有更新成功，请重试。'); button.disabled = false; }
    });
    element.append(label, button); return element;
  };
  for (const group of groups) {
    const container = $('manage-' + group); container.replaceChildren();
    tags.filter((tag) => tag.group === group && !tag.archived).forEach((tag) => container.append(row(tag)));
    if (!container.children.length) container.append(empty('还没有标签'));
  }
  const archived = tags.filter((tag) => tag.archived);
  $('archived-count').textContent = `（${archived.length}）`;
  $('archived-tags').replaceChildren(...archived.map(row));
  $('archived-section').hidden = !archived.length;
}
function empty(text) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = text; return p; }

async function renderStats() {
  const generation = ++statsGeneration;
  const [tags, events] = await Promise.all([
    transaction('tags', 'readonly', (store) => store.getAll()),
    transaction('events', 'readonly', (store) => store.getAll()),
  ]);
  if (generation !== statsGeneration) return;
  tags.sort((a, b) => a.order - b.order);
  // Archived labels remain available for historical analysis.
  for (const group of groups) {
    const container = $('filter-' + group); container.replaceChildren();
    tags.filter((tag) => tag.group === group).forEach((tag) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'tag';
      button.textContent = tag.name + (tag.archived ? ' · 已删除' : ''); prependIcon(button,tag.icon);
      button.setAttribute('aria-pressed', String(group === 'conditions' ? selectedConditions.has(tag.id) : selectedResult === tag.id));
      button.addEventListener('click', () => {
        if (group === 'conditions') {
          if (selectedConditions.has(tag.id)) selectedConditions.delete(tag.id); else selectedConditions.add(tag.id);
        } else selectedResult = tag.id;
        void renderStats().catch(() => showError('统计读取失败，请重试。'));
      });
      container.append(button);
    });
    if (!container.children.length) container.append(empty('还没有标签'));
  }
  const chart = $('dot-chart'); chart.replaceChildren();
  renderScatter(tags, events, selectedConditions, null, NaN, NaN);
  $('point-detail').textContent = '点选圆点，查看具体时间。';
  if (!selectedConditions.size || !selectedResult) {
    chart.append(empty('选几个条件标签，再选一个结果，就能看发生时间。')); return;
  }
  const chosen = tags.filter((tag) => selectedConditions.has(tag.id) && tag.group === 'conditions');
  const result = tags.find((tag) => tag.id === selectedResult);
  if (result) chosen.push(result);
  const selectedIds = new Set(chosen.map((tag) => tag.id));
  const valid = events.filter((event) => selectedIds.has(event.tagId) && Number.isFinite(Date.parse(event.occurredAt)));
  let start, end;
  if (allTime) {
    if (!valid.length) { chart.append(empty('这些标签还没有记录，点过之后就会出现在这里。')); return; }
    const times = valid.map((event) => Date.parse(event.occurredAt));
    const min = times.reduce((a,b) => Math.min(a,b), Infinity), max = times.reduce((a,b) => Math.max(a,b), -Infinity);
    const first = new Date(min), last = new Date(max);
    start = new Date(first.getFullYear(), first.getMonth(), first.getDate()).getTime();
    end = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1).getTime();
  } else {
    const [year, month] = $('chart-month').value.split('-').map(Number);
    if (!year || !month) { chart.append(empty('请选择月份')); return; }
    start = new Date(year, month - 1, 1).getTime(); end = new Date(year, month, 1).getTime();
  }
  const inRange = valid.filter((event) => Date.parse(event.occurredAt) >= start && Date.parse(event.occurredAt) < end);
  if (!inRange.length) chart.append(empty('这个时间范围还没有记录。'));
  const unit=$('timeline-unit').value;
  const lag=Number($('offset-direction').value)*Number($('offset-count').value);
  const offsetLabel=lag?`${lag>0?'前':'后'} ${Math.abs(lag)} ${ {day:'天',week:'周',month:'个月'}[unit]}`:'同一周期';
  $('offset-help').textContent=`结果保持原日期，条件取自${offsetLabel}；所有统计图共用周期和偏移。`;

  const periods=[];
  for(let t=periodStart(start,unit,0);t<end;t=shiftPeriod(t,unit,1)) periods.push(t);
  const NS='http://www.w3.org/2000/svg';
  const make=(name,attrs={},text)=>{const node=document.createElementNS(NS,name);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);if(text!==undefined)node.textContent=text;return node;};
  const left=110, step=40, width=Math.max(chart.clientWidth,left+periods.length*step+15), height=chosen.length*54+48;
  const svg=make('svg',{viewBox:`0 0 ${width} ${height}`,width,height,role:'group','aria-label':'按周期纵向对齐的标签记录'});
  svg.classList.add('aligned-timeline');
  const columns=periods.map((begin,i)=>{
    const finish=shiftPeriod(begin,unit,1);
    const conditionStart=shiftPeriod(begin,unit,-lag), conditionEnd=shiftPeriod(finish,unit,-lag);
    const records=valid.filter(e=>{
      const time=Date.parse(e.occurredAt);
      return e.tagId===result?.id ? time>=Math.max(begin,start)&&time<Math.min(finish,end) : time>=conditionStart&&time<conditionEnd;
    });
    const x=left+i*step+step/2;
    const hasResult=records.some(e=>e.tagId===result?.id);
    const band=make('rect',{x:x-15,y:5,width:30,height:height-35,rx:7,class:hasResult?'timeline-band result-period':'timeline-band'});svg.append(band);
    svg.append(make('line',{x1:x,x2:x,y1:18,y2:height-36,class:'timeline-guide'}));
    const label=new Date(begin).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'});
    svg.append(make('text',{x,y:height-8,'text-anchor':'middle',class:'timeline-date'},label));
    return {begin,finish,conditionStart,conditionEnd,records,x,band,label};
  });
  const active=make('line',{y1:12,y2:height-35,class:'timeline-active',visibility:'hidden'});svg.append(active);
  const dots=[];
  for(const [row,tag] of chosen.entries()) {
    const y=28+row*54;
    svg.append(make('text',{x:2,y:y+4,class:'timeline-name'},tag.name.length>10?tag.name.slice(0,9)+'…':tag.name));
    for(const [index,col] of columns.entries()) {
      const records=col.records.filter(e=>e.tagId===tag.id);
      const label=`${tag.name} · ${col.label}起的本${{day:'日',week:'周',month:'月'}[unit]} · ${records.length} 次`;
      const dot=make('circle',{cx:col.x,cy:y,r:records.length?7:3,class:`timeline-dot ${records.length?'recorded':'unrecorded'} ${tag.group==='results'?'outcome':''}`,tabindex:0,role:'button','aria-label':label});
      dot.append(make('title',{},label));
      const inspect=()=>{
        active.setAttribute('x1',col.x);active.setAttribute('x2',col.x);active.setAttribute('visibility','visible');
        dots.forEach(d=>d.node.classList.toggle('selected',d.index===index));
        const summaries=chosen.map(t=>{const es=col.records.filter(e=>e.tagId===t.id);return `${t.name}：${es.length?es.length+' 次':'未记录'}`;});
        const times=records.map(e=>new Date(e.occurredAt).toLocaleString('zh-CN',{hour12:false}));
        $('point-detail').textContent=`条件取自${offsetLabel}（${new Date(col.conditionStart).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})}起）；结果 ${col.label} — ${new Date(Math.min(col.finish,end)-1).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})}；${summaries.join('；')}。${times.length?tag.name+'时间：'+times.join('、'):''}`;
      };
      dot.addEventListener('click',inspect);dot.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();inspect();}});
      svg.append(dot);dots.push({node:dot,index});
      if(records.length>1)svg.append(make('text',{x:col.x,y:y+3,'text-anchor':'middle',class:'timeline-count','aria-hidden':'true'},records.length));
    }
  }
  chart.append(svg);
  $('point-detail').textContent='淡紫色列表示结果有记录的周期。点任意圆点，沿竖线查看该周期的全部标签；小灰点表示未记录。';
  renderScatter(tags, events, selectedConditions, result, start, end);
}
$('timeline-unit').addEventListener('change',()=>{
  void renderStats().catch(()=>showError('统计读取失败，请重试。'));
});
for(const id of ['offset-direction','offset-count']) $(id).addEventListener('change',()=>{
  const input=$('offset-count'); input.value=String(Math.min(365,Math.max(1,Math.round(Number(input.value)||1))));
  input.disabled=$('offset-direction').value==='0';
  void renderStats().catch(()=>showError('统计读取失败，请重试。'));
});
$('chart-month').addEventListener('change', () => { allTime = false; $('all-time').setAttribute('aria-pressed','false'); void renderStats().catch(() => showError('统计读取失败，请重试。')); });
$('all-time').addEventListener('click', () => { allTime = !allTime; $('all-time').setAttribute('aria-pressed',String(allTime)); void renderStats().catch(() => showError('统计读取失败，请重试。')); });
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); if (currentPage === 'stats') resizeTimer = setTimeout(() => void renderStats().catch(() => {}), 150); });

if (demoMode && db) {
  selectedConditions.add('demo-gaba'); selectedConditions.add('demo-exercise'); selectedConditions.add('demo-coffee');
  selectedResult = 'demo-good';
  $('chart-month').value = '2026-09';
  await showPage('stats');
}

for (const id of ['scatter-condition','time-condition']) $(id).addEventListener('change', () => void renderStats().catch(() => showError('统计读取失败，请重试。')));

let backupURL=null,backupFile=null;
$('export-backup').addEventListener('click',async()=>{
  const button=$('export-backup');button.disabled=true;
  $('backup-status').textContent='正在读取备份…';$('backup-share').hidden=true;$('backup-download').hidden=true;
  try{
    const backup=await exportBackup(db);
    const filename=`suishouji-${backup.source}-${backup.exportedAt.replace(/[:.]/g,'-')}.json`;
    backupFile=new File([JSON.stringify(backup,null,2)],filename,{type:'application/json'});
    if(backupURL)URL.revokeObjectURL(backupURL);backupURL=URL.createObjectURL(backupFile);
    const link=$('backup-download');link.href=backupURL;link.download=filename;link.hidden=false;
    $('backup-share').hidden=!(navigator.canShare?.({files:[backupFile]}));
    $('backup-status').textContent=`备份已生成：${backup.tags.length} 个标签、${backup.events.length} 条记录${backup.source==='demo'?'（模拟数据）':''}。请点击保存文件；生成不等于已保存。`;
  }catch{$('backup-status').textContent='备份生成失败，请重试。';}
  finally{button.disabled=false;}
});
$('backup-share').addEventListener('click',async()=>{
  if(!backupFile)return;
  try{await navigator.share({files:[backupFile],title:'随手记备份'});}
  catch(error){if(error.name!=='AbortError')$('backup-status').textContent='分享未完成，请使用“保存备份文件”。';}
});

const APP_VERSION='33';
let availableVersion=null;
$('check-update').addEventListener('click',async()=>{
  const button=$('check-update');button.disabled=true;$('apply-update').hidden=true;
  $('update-status').textContent='正在检查…';
  try{
    const url=new URL('./index.html',location.href);url.searchParams.set('check',Date.now());
    const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error('network');
    const html=await response.text();
    const match=html.match(/src=["']\.\/app\.js\?v=(\d+)["']/);
    if(!match)throw Error('version');
    availableVersion=match[1];
    if(Number(availableVersion)>Number(APP_VERSION)){
      $('update-status').textContent=`发现 v${availableVersion}，当前 v${APP_VERSION}。点击更新并重启。`;
      $('apply-update').hidden=false;
    }else $('update-status').textContent=`当前已是最新版本 v${APP_VERSION}。`;
  }catch{$('update-status').textContent='暂时无法检查更新，请联网后重试。';}
  finally{button.disabled=false;}
});
$('apply-update').addEventListener('click',async()=>{
  $('apply-update').disabled=true;$('update-status').textContent='正在更新，即将重新打开…';
  try{
    const registration=await navigator.serviceWorker?.getRegistration();
    if(registration)await registration.update();
    const url=new URL(location.href);url.searchParams.set('v',availableVersion);url.searchParams.set('refresh',Date.now());
    location.replace(url.href);
  }catch{$('apply-update').disabled=false;$('update-status').textContent='更新未完成，请联网后重试。';}
});

let pendingBackup=null;
$('import-file').addEventListener('change',async()=>{
  pendingBackup=null;$('import-confirm').hidden=true;
  const file=$('import-file').files[0];if(!file)return;
  try{
    if(file.size>50*1024*1024)throw Error('备份超过 50MB，暂不支持');
    const data=validateBackup(JSON.parse(await file.text()));
    if(data.source==='demo'&&!demoMode)throw Error('模拟备份不能导入真实记录');
    pendingBackup=data;$('import-status').textContent=`读取到 ${data.tags.length} 个标签、${data.events.length} 条记录。将全部覆盖当前标签和记录（包括空备份）。此操作不能撤销，请确认已保存当前备份。`;
    $('import-confirm').hidden=false;
  }catch(error){$('import-status').textContent=error instanceof SyntaxError?'文件不是有效的 JSON 备份':error.message;}
});
$('import-confirm').addEventListener('click',async()=>{
  if(!pendingBackup)return;
  $('import-confirm').disabled=true;$('import-file').disabled=true;
  try{
    const result=await importBackup(db,pendingBackup);pendingBackup=null;
    $('import-status').textContent=`覆盖完成：${result.tags} 个标签、${result.events} 条记录。`;
    $('import-confirm').hidden=true;$('import-file').value='';lastEvent=null;$('toast').hidden=true;selectedConditions.clear();selectedResult=null;await renderSettings();
  }catch(error){$('import-status').textContent=error.message||'导入失败，原数据未修改。';}
  finally{$('import-confirm').disabled=false;$('import-file').disabled=false;}
});

// Content owns scrolling; the navigation is a separate, non-scrolling grid row.
const scrollArea=document.querySelector('.app');
let pickerPosition=null,pickerRestoreTimer=null;
function rememberPickerPosition(){pickerPosition={x:scrollArea.scrollLeft,y:scrollArea.scrollTop,page:currentPage};}
function restorePickerPosition(){
  if(!pickerPosition)return;
  const position=pickerPosition;pickerPosition=null;
  $('import-file').blur();
  const restore=()=>{
    if(currentPage!==position.page)return;
    const max=Math.max(0,scrollArea.scrollHeight-scrollArea.clientHeight);
    window.scrollTo(0,0);
    scrollArea.scrollTo({left:position.x,top:Math.min(position.y,max),behavior:'instant'});
  };
  requestAnimationFrame(()=>requestAnimationFrame(restore));
  clearTimeout(pickerRestoreTimer);pickerRestoreTimer=setTimeout(restore,200);
}
$('import-file').addEventListener('pointerdown',rememberPickerPosition);
$('import-file').addEventListener('click',()=>{if(!pickerPosition)rememberPickerPosition();});
$('import-file').addEventListener('change',restorePickerPosition);
$('import-file').addEventListener('cancel',restorePickerPosition);
window.addEventListener('focus',()=>{if(pickerPosition)setTimeout(restorePickerPosition,100);});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&pickerPosition)setTimeout(restorePickerPosition,100);});
window.addEventListener('touchstart',()=>clearTimeout(pickerRestoreTimer),{passive:true});
