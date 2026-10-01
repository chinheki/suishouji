import { demoData } from './demo-data.js';
function randomizeTime(event) {
  if (event.demoTimeVersion === 2) return event;
  let hash=2166136261;
  for (const ch of String(event.id)) hash=Math.imul(hash ^ ch.charCodeAt(0),16777619)>>>0;
  const date=new Date(event.occurredAt);
  date.setHours(hash%24,(hash>>>8)%60,(hash>>>16)%60,0);
  return {...event,occurredAt:date.toISOString(),demoTimeVersion:2};
}
// A separate database keeps all demo interactions away from real records.
export function seedDemo(database) {
  if (database.name !== 'suishouji-demo-v1') throw new Error('模拟数据只能写入模拟数据库');
  return new Promise((resolve, reject) => {
    const tx = database.transaction(['tags', 'events'], 'readwrite');
    tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);
    const tags = tx.objectStore('tags');
    const request = tags.count();
    request.onsuccess = () => {
      if (request.result) {
        const events=tx.objectStore('events'), cursor=events.openCursor();
        cursor.onsuccess=()=>{
          const row=cursor.result;if(!row)return;
          if(String(row.value.id).startsWith('demo-') && row.value.demoTimeVersion!==2)row.update(randomizeTime(row.value));
          row.continue();
        };
        return;
      }
      demoData.tags.forEach(tag => tags.add(tag));
      demoData.events.forEach(event => tx.objectStore('events').add(randomizeTime(event)));
    };
  });
}
