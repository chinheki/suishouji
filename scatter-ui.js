import { buildScatter, quadrantGroups, minutePoints } from './scatter.js?v=27';
const $ = id => document.getElementById(id);
export function renderScatter(tags, events, selectedConditions, result, start, end) {
  const select = $('scatter-condition');
  const available = tags.filter(t => selectedConditions.has(t.id));
  if (!select._selected) select._selected = new Set(available.map(t=>t.id));
  const ids = select._selected;
  for (const id of ids) if (!available.some(t=>t.id===id)) ids.delete(id);
  const selected = available.filter(t=>ids.has(t.id));
  select.replaceChildren();
  for (const tag of available) {
    const label = document.createElement('label'), input = document.createElement('input');
    input.type='checkbox'; input.checked=ids.has(tag.id);
    input.addEventListener('change',()=>{if(input.checked)ids.add(tag.id);else ids.delete(tag.id);});
    label.append(input,document.createTextNode(tag.name)); select.append(label);
  }
  const timeSelect=$('time-condition'), previous=timeSelect.value;
  timeSelect.replaceChildren();
  for(const tag of available){const o=document.createElement('option');o.value=tag.id;o.textContent=tag.name;timeSelect.append(o);}
  if(available.some(t=>t.id===previous))timeSelect.value=previous;
  $('time-chart').replaceChildren();$('time-detail').textContent='';
  const target = $('scatter-plot'); target.replaceChildren();
  $('scatter-note').textContent=''; $('scatter-detail').textContent='';
  if (!result || !Number.isFinite(start) || !Number.isFinite(end)) {
    $('scatter-summary').textContent='选择条件和一个结果。'; return;
  }
  $('association-kind').textContent='四象限';
  $('association-help').textContent='所有标签按已记录／未记录比较，格内按周期数排序。';
  const unit=$('timeline-unit').value, lag=Number($('offset-direction').value)*Number($('offset-count').value);
  const boundaryHour=0;
  const unitName={day:'天',week:'周',month:'月'}[unit];
  const series=selected.map(condition=>({condition,...buildScatter({events,condition,result,start,end,unit,lag,boundaryHour,binary:true})}));
  $('scatter-summary').textContent=`按${unitName}比较；每个标签独立计数，空白或不完整周期排除。`;
  $('scatter-note').textContent='未记录不等于实际未发生；不同标签可能包含同一周期，不可相加。关联不代表因果。';
  if(selected.length)renderQuadrants(target,series,result,lag,unitName,tags);
  else target.textContent='请选择至少一个横轴条件。';
  const condition=available.find(t=>t.id===timeSelect.value);
  if(condition){
    const {points}=buildScatter({events,condition,result,start,end,unit,lag,boundaryHour:0,binary:true});
    const observations=minutePoints(points,events,condition.id);
    const make=(name,attrs={},text)=>{const node=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);if(text!==undefined)node.textContent=text;return node;};
    const width=Math.max(300,$('time-chart').clientWidth),left=94,right=width-25,top=35,bottom=320;
    const svg=make('svg',{viewBox:`0 0 ${width} 380`,role:'group','aria-label':`${condition.name}发生时刻与${result.name}是否记录的两列散点图`});
    svg.classList.add('time-scatter');
    svg.append(make('text',{x:0,y:16,class:'scatter-axis-title'},'条件发生时刻 · 精确到分钟'));
    const columnX=value=>left+(value?.75:.25)*(right-left);
    for(const value of [0,1]) {
      const x=columnX(value);
      svg.append(make('line',{x1:x,x2:x,y1:top,y2:bottom,class:'scatter-grid'}));
      svg.append(make('text',{x,y:bottom+23,'text-anchor':'middle',class:'scatter-tick'},value?'已记录':'未记录'));
    }
    const minuteY=minute=>bottom-minute/1440*(bottom-top);
    for(let hour=0;hour<=24;hour+=4){
      const y=minuteY(hour*60);
      svg.append(make('line',{x1:left,x2:right,y1:y,y2:y,class:'scatter-grid'}));
      svg.append(make('text',{x:left-8,y:y+4,'text-anchor':'end',class:'scatter-tick'},String(hour).padStart(2,'0')+':00'));
    }
    const clusters=new Map();
    for(const observation of observations){const key=observation.outcome+':'+observation.minute;if(!clusters.has(key))clusters.set(key,[]);clusters.get(key).push(observation);}
    for(const cluster of clusters.values()){
      const {minute,outcome}=cluster[0],x=columnX(outcome),y=minuteY(minute);
      const clock=String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
      const label=`${condition.name} ${clock} → ${outcome?'已记录':'未记录'}${result.name}：${cluster.length} 条记录`;
      const dot=make('circle',{cx:x,cy:y,r:cluster.length>1?8:5,class:'scatter-dot',tabindex:0,role:'button','aria-label':label});
      dot.append(make('title',{},label));
      const inspect=()=>{$('time-detail').textContent=label+'。'+cluster.map(o=>`${new Date(o.event.occurredAt).toLocaleString('zh-CN',{hour12:false})}（结果周期从 ${new Date(o.period.start).toLocaleDateString('zh-CN')} 起）`).join('；');};
      dot.addEventListener('click',inspect);dot.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();inspect();}});svg.append(dot);
      if(cluster.length>1)svg.append(make('text',{x,y:y+3,'text-anchor':'middle',class:'scatter-cluster-count','aria-hidden':'true'},cluster.length));
    }
    svg.append(make('text',{x:(left+right)/2,y:370,'text-anchor':'middle',class:'scatter-axis-title'},result.name));
    $('time-chart').append(svg);
    $('time-detail').textContent='每条条件记录按实际时分定位；左列未记录结果，右列已记录结果。同列同一分钟重合时显示记录数，点击查看全部时间。';
  }
}

function renderQuadrants(target,series,result,lag,unitName,tags) {
  const colors=['#567a54','#8a60a0','#387c91','#a65c46','#8a742f','#525ca1'];
  const grid=document.createElement('div');grid.className='quadrant-grid';
  const max=Math.max(0,...series.flatMap(s=>quadrantGroups(s.points).map(g=>g.points.length)));
  for(const [index,group] of quadrantGroups([]).entries()) {
    const cell=document.createElement('section');cell.className='quadrant-cell';cell.dataset.x=group.x;cell.dataset.y=group.y;
    const heading=document.createElement('h3');heading.textContent=`${group.y?'已记录':'未记录'} ${result.name} · 条件${group.x?'已记录':'未记录'}`;cell.append(heading);
    const rows=series.map(s=>({...s,group:quadrantGroups(s.points)[index]})).sort((a,b)=>b.group.points.length-a.group.points.length || a.condition.name.localeCompare(b.condition.name,'zh-CN'));
    for(const row of rows) {
      const count=row.group.points.length, button=document.createElement('button');button.type='button';button.className='quadrant-tag';
      button.style.setProperty('--tag-color',colors[tags.findIndex(t=>t.id===row.condition.id)%colors.length]);
      const ratio=max ? count/max : 0;
      button.style.setProperty('--tag-width',`${ratio*100}%`);
      button.dataset.short=String(ratio<.7);
      const bar=document.createElement('span');bar.className='quadrant-bar';bar.setAttribute('aria-hidden','true');
      const name=document.createElement('span');name.className='quadrant-tag-name';name.textContent=row.condition.name;
      const number=document.createElement('span');number.className='quadrant-tag-count';number.textContent=count;
      const label=document.createElement('span');label.className='quadrant-tag-text';label.append(name,number);
      button.append(bar,label);button.setAttribute('aria-label',`${heading.textContent}，${row.condition.name}：${count} 个周期`);
      button.addEventListener('click',()=>{$('scatter-detail').textContent=`${row.condition.name}：${heading.textContent}，${count} 个周期。${row.group.points.map(p=>new Date(p.start).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})).join('、')}${lag?`；条件来自${lag>0?'前':'后'} ${Math.abs(lag)} 个${unitName}周期。`:''}`;});
      cell.append(button);
    }
    grid.append(cell);
  }
  target.append(grid);
  for(const row of series) {
    const rates=[0,1].map(x=>{const sample=row.points.filter(p=>Number(p.x>0)===x);const n=sample.filter(p=>p.y>0).length;return `${x?'已记录':'未记录'}条件：${sample.length?`${Math.round(n/sample.length*100)}%（${n}/${sample.length}）`:'无样本'}`;});
    const p=document.createElement('p');p.className='quadrant-comparison';p.textContent=`${row.condition.name} → ${result.name}记录率：${rates.join('；')}`;target.append(p);
  }
  $('scatter-detail').textContent='点击格内标签查看日期。四个象限共用最大数量作为 100%，其他色条按同一比例缩放，可跨象限比较；短条文字保留完整。';
}
