export const DAY_MS = 24 * 60 * 60 * 1000;
export const normalizeName = (name) => name.trim().replace(/\s+/g, ' ');
export const validCycleDays = (days) => Number.isInteger(days) && days >= 1 && days <= 36500;

export function openDatabase(name = 'suishouji', initialTags = [], onBlocked = () => {}) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('tags')) {
        const tags = database.createObjectStore('tags', { keyPath: 'id' });
        tags.createIndex('group_name', ['group', 'name'], { unique: true });
        const now = new Date().toISOString();
        initialTags.forEach(([group, name], order) => tags.add({ id: crypto.randomUUID(), group, name, order, createdAt: now }));
      }
      const events = database.objectStoreNames.contains('events')
        ? request.transaction.objectStore('events')
        : database.createObjectStore('events', { keyPath: 'id' });
      if (!events.indexNames.contains('tagId')) events.createIndex('tagId', 'tagId');
      if (!events.indexNames.contains('occurredAt')) events.createIndex('occurredAt', 'occurredAt');
      if (!events.indexNames.contains('tag_time')) events.createIndex('tag_time', ['tagId', 'occurredAt']);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = onBlocked;
  });
}

export const COOLDOWN_MS = 3000;
export function backfillTime(date, time, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !['10:00','18:00','23:00'].includes(time)) throw new Error('请选择日期和固定时段');
  const value = new Date(date + 'T' + time + ':00');
  const [y,m,d] = date.split('-').map(Number);
  if (!Number.isFinite(value.getTime()) || value.getFullYear() !== y || value.getMonth() !== m-1 || value.getDate() !== d) throw new Error('日期无效');
  if (value.getTime() > now) throw new Error('不能补记未来的时间，请选择已过去的时段');
  return value;
}

// Check recent submissions and insert atomically, including across tabs.
// Cooldown uses save time, never the historical occurrence time.
export function recordOnce(database, event, now = Date.now()) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(['tags', 'events'], 'readwrite');
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('保存中断'));
    const tagRequest = tx.objectStore('tags').get(event.tagId);
    tagRequest.onsuccess = () => {
      const tag = tagRequest.result;
      if (!tag || tag.archived) { result = { status: 'unavailable' }; return; }
      const occurred = Date.parse(event.occurredAt);
      if (!Number.isFinite(occurred) || occurred > now) { result = {status:'invalid', message:'记录时间无效或晚于现在'}; return; }
      if (tag.valueType === 'number' && (typeof event.value !== 'number' || !Number.isFinite(event.value))) {
        result = {status:'invalid', message:'请输入有效数字'}; return;
      }
      if ((event.valueType !== undefined && event.valueType !== (tag.valueType || 'event')) || (tag.valueType === 'number' && event.unit !== undefined && event.unit !== (tag.unit || ''))) {
        result = {status:'invalid', message:'标签类型或单位已变化，请关闭后刷新页面再记录'}; return;
      }
      const events = tx.objectStore('events');
      const request = events.index('tagId').getAll(tag.id);
      request.onsuccess = () => {
        const latest = request.result.reduce((max,e) => Math.max(max, Number.isFinite(e.recordedAt) ? e.recordedAt : 0), 0);
        if (latest && now < latest + COOLDOWN_MS) { result = {status:'cooldown', until:latest + COOLDOWN_MS}; return; }
        const saved = {...event, tagName:tag.name, group:tag.group, cycleDays:null, recordedAt:now,
          valueType:tag.valueType === 'number' ? 'number' : 'event', unit:tag.valueType === 'number' ? (tag.unit || '') : ''};
        if (saved.valueType !== 'number') delete saved.value;
        events.add(saved);
        result = {status:'saved', event:saved, until:now + COOLDOWN_MS};
      };
    };
  });
}

export function exportBackup(database) {
  return new Promise((resolve,reject)=>{
    const tx=database.transaction(['tags','events'],'readonly');
    const tags=tx.objectStore('tags').getAll(),events=tx.objectStore('events').getAll();
    tx.oncomplete=()=>resolve({format:'suishouji-backup',version:1,exportedAt:new Date().toISOString(),source:database.name==='suishouji-demo-v1'?'demo':'personal',tags:tags.result,events:events.result});
    tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('备份读取中断'));
  });
}

export function validateBackup(data) {
  if (!data || data.format !== 'suishouji-backup' || data.version !== 1 || !Array.isArray(data.tags) || !Array.isArray(data.events)) throw new Error('不是支持的随手记备份文件');
  const ids=new Set(),names=new Set(),eventIds=new Set();
  for(const tag of data.tags){
    if(!tag || typeof tag.id!=='string'||!tag.id||typeof tag.name!=='string'||!normalizeName(tag.name)||!['conditions','results'].includes(tag.group)||ids.has(tag.id))throw new Error('备份标签数据无效');
    if(tag.valueType !== undefined && !['event','number'].includes(tag.valueType) || tag.unit !== undefined && typeof tag.unit !== 'string')throw new Error('备份标签数值类型无效');
    const key=JSON.stringify([tag.group,normalizeName(tag.name)]);if(names.has(key))throw new Error('备份中存在重复标签名称');names.add(key);ids.add(tag.id);
  }
  for(const event of data.events){
    if(!event||typeof event.id!=='string'||!event.id||eventIds.has(event.id)||!ids.has(event.tagId)||typeof event.occurredAt!=='string'||!Number.isFinite(Date.parse(event.occurredAt)))throw new Error('备份记录数据无效');
    if(event.valueType === 'number' && (typeof event.value !== 'number'||!Number.isFinite(event.value)) || event.value !== undefined && (typeof event.value !== 'number'||!Number.isFinite(event.value)))throw new Error('备份数值记录无效');
    eventIds.add(event.id);
  }
  return data;
}
export function importBackup(database,raw) {
  const data=validateBackup(raw);
  if(data.source==='demo' && database.name==='suishouji')throw new Error('模拟备份不能导入真实记录');
  return new Promise((resolve,reject)=>{
    const tx=database.transaction(['tags','events'],'readwrite');
    tx.oncomplete=()=>resolve({tags:data.tags.length,events:data.events.length});
    tx.onabort=()=>reject(tx.error||new Error('导入失败，原数据未修改'));tx.onerror=()=>{};
    const tags=tx.objectStore('tags'),events=tx.objectStore('events');
    try{
      tags.clear();events.clear();
      for(const tag of data.tags)tags.add({...tag,name:normalizeName(tag.name)});
      for(const event of data.events)events.add(event);
    }catch(error){tx.abort();reject(error);}
  });
}
