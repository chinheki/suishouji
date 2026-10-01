"""Create deterministic fictional event data; never read a user's database."""
import json, random
from datetime import datetime, timedelta, timezone
from pathlib import Path
rng=random.Random(930)
tz=timezone(timedelta(hours=9))
start=datetime(2026,9,1,tzinfo=tz)
specs=[('gaba','吃了 GABA','conditions',1,False),('exercise','睡前运动','conditions',1,False),('coffee','喝了咖啡','conditions',None,False),('alcohol','喝了酒','conditions',1,False),('stretch','拉伸','conditions',3,False),('review','每周复盘','conditions',7,False),('good','睡得很好','results',1,False),('okay','睡得一般','results',1,False),('bad','睡得不好','results',1,False),('headache','头痛了','results',None,False),('energy','精神不错','results',1,False),('sleep','入睡','results',1,True),('wake','起床','results',1,True),('nap','午睡','results',1,True),('old','睡前看屏幕','conditions',None,False)]
def iso(dt):return dt.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
tags=[dict(id='demo-'+key,name=name,group=group,cycleDays=cycle,timestampEnabled=stamp,order=i,createdAt=iso(start),archived=key=='old') for i,(key,name,group,cycle,stamp) in enumerate(specs)]
bykey={s[0]:t for s,t in zip(specs,tags)}
events=[]; latest={}
def add(key,dt):
 t=bykey[key]
 if t['cycleDays'] and not t['timestampEnabled'] and key in latest and dt-latest[key]<timedelta(days=t['cycleDays']):return
 latest[key]=dt
 events.append(dict(id=f'demo-event-{len(events):04d}',tagId=t['id'],tagName=t['name'],group=t['group'],cycleDays=t['cycleDays'],timestampEnabled=t['timestampEnabled'],occurredAt=iso(dt),timezone='Asia/Tokyo',utcOffsetMinutes=540,synthetic=True))
for i in range(29):
 day=start+timedelta(days=i)
 if i in (7,18):continue # Whole days intentionally missing.
 gaba=rng.random()<.55; exercise=rng.random()<.35; coffee=rng.choice([0,1,1,2,3]); alcohol=i in (4,12,20,26)
 if gaba:add('gaba',day+timedelta(hours=22))
 if exercise:add('exercise',day+timedelta(hours=21))
 for c in range(coffee):add('coffee',day+timedelta(hours=9+c*3,minutes=rng.randrange(50)))
 if alcohol:add('alcohol',day+timedelta(hours=20))
 if i%3==0:add('stretch',day+timedelta(hours=18))
 if i%7==0:add('review',day+timedelta(hours=17))
 if i<10 and i%2==0:add('old',day+timedelta(hours=22,minutes=30))
 # Fictional signal plus noise, only to exercise chart rendering.
 bedtime=23*60+rng.randint(-65,110)+(40 if coffee>=2 else 0)+(25 if exercise else 0)
 if i<28:
  if i not in (10,22):add('sleep',day+timedelta(minutes=bedtime))
  if i==14:add('sleep',day+timedelta(days=1,hours=3,minutes=24)) # Woke and fell asleep again.
  if i not in (11,22):add('wake',day+timedelta(days=1,hours=7,minutes=rng.randrange(100)))
 # Outcomes describe previous night's sleep, not tonight's exposures.
 if i>0 and i not in (8,19):
  outcome=rng.choices(['good','okay','bad'],weights=[4,4,2])[0]
  add(outcome,day+timedelta(hours=10))
  if rng.random()<.45:add('energy',day+timedelta(hours=11))
 if i in (3,6,15,21,25):
  add('headache',day+timedelta(hours=14,minutes=15))
  if i==15:add('headache',day+timedelta(hours=19,minutes=40))
 if i in (5,13,21,27):add('nap',day+timedelta(hours=13,minutes=20+rng.randrange(30)))
events.sort(key=lambda e:e['occurredAt'])
data=dict(version=1,start='2026-09-01',end='2026-09-29',timezone='Asia/Tokyo',synthetic=True,tags=tags,events=events)
Path('demo-data.js').write_text('export const demoData = '+json.dumps(data,ensure_ascii=False,indent=2)+';\n')
print(f'{len(tags)} tags, {len(events)} events, 2026-09-01–2026-09-29')
