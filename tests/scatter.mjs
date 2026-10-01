import fs from 'node:fs';
import assert from 'node:assert/strict';
const {buildScatter,formatClock,quadrantGroups,timeBands,minutePoints}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(new URL('../scatter.js',import.meta.url))).toString('base64'));
const condition={id:'coffee'},result={id:'sleep',timestampEnabled:true};
const make=(tagId,time,timestampEnabled=false)=>({tagId,occurredAt:time,timestampEnabled});
const opts={condition,result,start:Date.parse('2026-09-01T00:00:00+09:00'),end:Date.parse('2026-09-04T00:00:00+09:00'),unit:'day',lag:0,boundaryHour:12,now:Date.parse('2026-10-01T00:00:00+09:00')};
const events=[make('coffee','2026-09-01T15:00:00+09:00'),make('sleep','2026-09-01T23:00:00+09:00',true),make('sleep','2026-09-02T01:00:00+09:00',true)];
const a=buildScatter({...opts,events});
assert.equal(a.points.length,1);assert.equal(a.points[0].x,1);assert.equal(a.points[0].y,24);assert.equal(formatClock(24),'次日 00:00');
const lagged=buildScatter({...opts,lag:1,events:[...events,make('sleep','2026-09-02T23:30:00+09:00',true)]});
assert.equal(lagged.points.length,1);assert.equal(lagged.points[0].x,1);assert.equal(lagged.points[0].y,23.5);
const count=buildScatter({...opts,result:{id:'good'},boundaryHour:0,events:[make('coffee','2026-09-01T15:00:00+09:00'),make('good','2026-09-02T10:00:00+09:00')]});
assert.deepEqual(count.points.map(p=>[p.x,p.y]),[[1,0],[0,1]]);
assert.equal(buildScatter({...opts,unit:'month',events}).points.length,0);
console.log('PASS: midnight averaging, repeated events, previous period pairing, count zeros, blank/partial periods');

const binary=buildScatter({...opts,result:{id:'good'},boundaryHour:0,events:[make('coffee','2026-09-01T15:00:00+09:00'),make('good','2026-09-02T10:00:00+09:00'),make('good','2026-09-02T12:00:00+09:00')]});
assert.deepEqual(binary.points.map(p=>p.y),[0,1]);
assert.equal(binary.points[1].resultCount,2);
assert.equal(binary.points.length,2);
console.log('PASS: ordinary outcome has only 0/1, repeated records remain in source count, empty day excluded');

const quadrants=quadrantGroups([{x:0,y:0},{x:1,y:0},{x:2,y:1},{x:0,y:1},{x:3,y:1}]);
assert.deepEqual(quadrants.map(g=>g.points.length),[1,2,1,1]);
assert.equal(quadrants.reduce((n,g)=>n+g.points.length,0),5);
assert.deepEqual(quadrantGroups([]).map(g=>g.points.length),[0,0,0,0]);
console.log('PASS: quadrants partition all periods, repeated condition counts bin to present, zero cells preserved');
const timestampX=buildScatter({...opts,condition:{id:'sleep',timestampEnabled:true},result:{id:'good'},boundaryHour:12,events:[make('sleep','2026-09-02T23:00:00+09:00',true),make('sleep','2026-09-03T01:00:00+09:00',true),make('good','2026-09-03T09:00:00+09:00')]});
assert.equal(timestampX.points.length,1);assert.equal(timestampX.points[0].x,24);assert.equal(timestampX.points[0].y,1);
const binaryX=buildScatter({...opts,boundaryHour:0,result:{id:'good'},events:[make('coffee','2026-09-02T15:00:00+09:00'),make('coffee','2026-09-02T16:00:00+09:00'),make('good','2026-09-02T10:00:00+09:00')]});
assert.equal(binaryX.points[0].x,1);
console.log('PASS: timestamp condition averages across midnight; repeated ordinary conditions stay binary');
for (const [unit,start,end,source,lag] of [
 ['day','2026-09-03','2026-09-04','2026-09-01',2],
 ['day','2026-09-03','2026-09-04','2026-09-05',-2],
 ['week','2026-09-14','2026-09-21','2026-08-31',2],
 ['month','2026-03-01','2026-04-01','2026-01-01',2],
]) {
 const at=s=>Date.parse(s+'T00:00:00+09:00');
 const shifted=buildScatter({condition:{id:'coffee'},result:{id:'good'},start:at(start),end:at(end),unit,lag,boundaryHour:0,now:Date.parse('2027-01-01'),events:[make('coffee',source+'T15:00:00+09:00'),make('good',start+'T16:00:00+09:00')]});
 assert.equal(shifted.points.length,1);assert.equal(shifted.points[0].x,1);assert.equal(shifted.points[0].y,1);assert.equal(shifted.points[0].xStart,at(source));
}
console.log('PASS: forward/backward N periods, weekly cross-month and monthly cross-year pairing');

const mixedEvents=[make('coffee','2026-09-02T08:00:00+09:00',true),make('coffee','2026-09-02T09:00:00+09:00'),make('coffee','2026-09-02T12:00:00+09:00'),make('good','2026-09-03T10:00:00+09:00',true)];
const mixed=buildScatter({...opts,condition:{id:'coffee',timestampEnabled:true},result:{id:'good'},boundaryHour:0,binary:true,lag:1,events:mixedEvents});
assert.equal(mixed.points.length,1);assert.equal(mixed.points[0].x,1);assert.equal(mixed.points[0].y,1);
const bands=timeBands(mixed.points,mixedEvents,'coffee');
assert.equal(bands[2].points.length,1);assert.equal(bands[2].yes,1);assert.equal(bands[3].points.length,1);assert.equal(bands[0].points.length,0);
console.log('PASS: binary ignores legacy timestamp flags; time bands deduplicate, honor boundaries and shifted source period');

const minuteRows=minutePoints(mixed.points,mixedEvents,'coffee');
assert.deepEqual(minuteRows.map(p=>p.minute),[480,540,720]);
assert.ok(minuteRows.every(p=>p.outcome===1));
assert.equal(minutePoints(mixed.points,[make('coffee','2026-09-02T23:59:59+09:00')],'coffee')[0].minute,1439);
console.log('PASS: each event retains exact local minute and shifted outcome; seconds do not round into next day');
