const $ = id => document.getElementById(id);
const make = (name, attrs={}, text) => {
  const node=document.createElementNS('http://www.w3.org/2000/svg',name);
  for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);
  if(text!==undefined)node.textContent=text;
  return node;
};
export function renderNumericCharts(tags, events, start, end) {
  const container=$('numeric-charts');container.replaceChildren();
  const selected=tags.filter(tag=>tag.valueType==='number'||events.some(e=>e.tagId===tag.id&&typeof e.value==='number'));
  $('numeric-section').hidden=!selected.length;
  for(const tag of selected){
    const records=events.filter(e=>e.tagId===tag.id&&typeof e.value==='number'&&Number.isFinite(e.value)&&Date.parse(e.occurredAt)>=start&&Date.parse(e.occurredAt)<end)
      .sort((a,b)=>Date.parse(a.occurredAt)-Date.parse(b.occurredAt)||a.id.localeCompare(b.id));
    const units=[...new Set(records.map(e=>e.unit||''))];
    if(!units.length)units.push(tag.unit||'');
    for(const unit of units){
      const points=records.filter(e=>(e.unit||'')===unit);
      const section=document.createElement('div');section.className='numeric-chart'+(tag.group==='results'?' result':'');
      const title=document.createElement('h3');title.textContent=tag.name+(unit?`（${unit}）`:'');section.append(title);container.append(section);
      if(!points.length){const p=document.createElement('p');p.className='empty';p.textContent='这个时间范围还没有数值记录。';section.append(p);continue;}
      const width=Math.max(290,container.clientWidth),left=68,right=width-18,top=30,bottom=200,height=260;
      let min=points.reduce((v,e)=>Math.min(v,e.value),Infinity),max=points.reduce((v,e)=>Math.max(v,e.value),-Infinity);
      const pad=(max-min)*.1||Math.max(Math.abs(min)*.05,1);min-=pad;max+=pad;
      const x=time=>left+(time-start)/(end-start)*(right-left), y=value=>bottom-(value-min)/(max-min)*(bottom-top);
      const svg=make('svg',{viewBox:`0 0 ${width} ${height}`,role:'group','aria-label':`${tag.name}数值趋势，横轴日期，纵轴${unit||'数值'}`});
      svg.append(make('text',{x:left,y:14,class:'scatter-axis-title'},unit||'数值'));
      for(let i=0;i<=4;i++){
        const value=min+(max-min)*i/4,py=y(value);
        svg.append(make('line',{x1:left,x2:right,y1:py,y2:py,class:'scatter-grid'}));
        svg.append(make('text',{x:left-7,y:py+4,'text-anchor':'end',class:'scatter-tick'},new Intl.NumberFormat('zh-CN',{maximumSignificantDigits:4,notation:Math.abs(value)>=1e6?'scientific':'standard'}).format(value)));
      }
      for(let i=0;i<=2;i++){
        const time=start+(end-start-1)*i/2,px=x(time);
        svg.append(make('text',{x:px,y:bottom+22,'text-anchor':i===0?'start':i===2?'end':'middle',class:'scatter-tick'},new Date(time).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})));
      }
      svg.append(make('text',{x:(left+right)/2,y:height-5,'text-anchor':'middle',class:'scatter-axis-title'},'日期'));
      svg.append(make('polyline',{points:points.map(e=>`${x(Date.parse(e.occurredAt))},${y(e.value)}`).join(' '),class:'numeric-line'}));
      const detail=document.createElement('p');detail.className='point-detail';detail.setAttribute('role','status');detail.textContent=`${points.length} 条数值记录 · 点选圆点查看准确数值和时间。`;
      for(const event of points){
        const label=`${event.tagName||tag.name}：${event.value} ${unit} · ${new Date(event.occurredAt).toLocaleString('zh-CN',{hour12:false})}`;
        const dot=make('circle',{cx:x(Date.parse(event.occurredAt)),cy:y(event.value),r:5,tabindex:0,role:'button',class:'numeric-point','aria-label':label});
        dot.append(make('title',{},label));
        dot.addEventListener('click',()=>{detail.textContent=label;});dot.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();detail.textContent=label;}});svg.append(dot);
      }
      section.append(svg,detail);
    }
  }
}
