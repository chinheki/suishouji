export function periodStart(value, unit, boundaryHour = 0) {
  const d = new Date(value); d.setHours(d.getHours() - boundaryHour);
  d.setHours(0, 0, 0, 0);
  if (unit === 'week') d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  if (unit === 'month') d.setDate(1);
  d.setHours(boundaryHour); return d.getTime();
}
export function shiftPeriod(value, unit, delta) {
  const d = new Date(value);
  if (unit === 'month') d.setMonth(d.getMonth() + delta);
  else d.setDate(d.getDate() + delta * (unit === 'week' ? 7 : 1));
  return d.getTime();
}
export function clockValue(value, boundaryHour) {
  const d = new Date(value);
  const hour = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  return hour < boundaryHour ? hour + 24 : hour;
}
export function buildScatter({ events, condition, result, start, end, unit, lag, boundaryHour, binary = false, now = Date.now() }) {
  const points = [];
  const rows = events.map(e => ({ ...e, time: Date.parse(e.occurredAt) })).filter(e => Number.isFinite(e.time));
  let skipped = 0;
  for (let begin = periodStart(start, unit, boundaryHour); begin < end; begin = shiftPeriod(begin, unit, 1)) {
    const finish = shiftPeriod(begin, unit, 1);
    if (begin < start || finish > end || finish > now) { skipped++; continue; }
    const observed = rows.filter(e => e.time >= begin && e.time < finish);
    if (!observed.length) { skipped++; continue; }
    const ys = observed.filter(e => e.tagId === result.id && (binary || (e.timestampEnabled ?? false) === Boolean(result.timestampEnabled)));
    if (!binary && result.timestampEnabled && !ys.length) { skipped++; continue; }
    const xStart = shiftPeriod(begin, unit, -lag), xEnd = shiftPeriod(finish, unit, -lag);
    if (xEnd > now) { skipped++; continue; }
    const xWindow = rows.filter(e => e.time >= xStart && e.time < xEnd);
    if (!xWindow.length) { skipped++; continue; }
    const xs = xWindow.filter(e => e.tagId === condition.id && (binary || (e.timestampEnabled ?? false) === Boolean(condition.timestampEnabled)));
    if (!binary && condition.timestampEnabled && !xs.length) { skipped++; continue; }
    const x = !binary && condition.timestampEnabled ? xs.reduce((sum,e)=>sum+clockValue(e.occurredAt,boundaryHour),0)/xs.length : Number(xs.length>0);
    const y = !binary && result.timestampEnabled ? ys.reduce((sum,e) => sum + clockValue(e.occurredAt,boundaryHour),0) / ys.length : Number(ys.length > 0);
    points.push({ x, y, start: begin, end: finish, xStart, xEnd, resultCount: ys.length });
  }
  return { points, skipped };
}
export function formatClock(hour) {
  const minutes = Math.round(hour * 60), h = Math.floor(minutes / 60);
  return `${h >= 24 ? '次日 ' : ''}${String(h % 24).padStart(2,'0')}:${String(minutes % 60).padStart(2,'0')}`;
}

export function quadrantGroups(points) {
  return [[0,1],[1,1],[0,0],[1,0]].map(([x,y]) => ({
    x, y, points: points.filter(point => Number(point.x > 0) === x && Number(point.y > 0) === y),
  }));
}

export function timeBands(points, events, conditionId) {
  const groups=Array.from({length:6},(_,i)=>({label:`${String(i*4).padStart(2,'0')}:00–${String((i+1)*4).padStart(2,'0')}:00`,points:[],yes:0}));
  const records=events.filter(e=>e.tagId===conditionId).map(e=>({time:Date.parse(e.occurredAt),hour:new Date(e.occurredAt).getHours()})).filter(e=>Number.isFinite(e.time));
  for(const point of points) {
    const bins=new Set(records.filter(e=>e.time>=point.xStart&&e.time<point.xEnd).map(e=>Math.floor(e.hour/4)));
    for(const bin of bins){groups[bin].points.push(point);groups[bin].yes+=Number(point.y>0);}
  }
  return groups;
}

export function minutePoints(points,events,conditionId){
  const records=events.filter(e=>e.tagId===conditionId).map(event=>({event,time:Date.parse(event.occurredAt)})).filter(e=>Number.isFinite(e.time));
  return points.flatMap(period=>records.filter(r=>r.time>=period.xStart&&r.time<period.xEnd).map(({event,time})=>{const date=new Date(time);return {event,period,minute:date.getHours()*60+date.getMinutes(),outcome:Number(period.y>0)};}));
}
