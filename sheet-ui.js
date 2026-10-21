// Shared bottom sheets keep draft data in the original controls across pages.
const states=new WeakMap();
const snapshot=dialog=>JSON.stringify([...dialog.querySelectorAll('input,select')].map(el=>[el.id,el.value,el.disabled]), null, 0)+[...dialog.querySelectorAll('#tag-icons [aria-pressed=true]')].map(el=>el.getAttribute('aria-label')).join();
export function prepareSheet(dialog){const state=states.get(dialog);state.pages=dialog.id==='add-dialog'?state.allPages:state.allPages.filter(page=>{const input=page.querySelector('input,select');return input&&!input.disabled&&!input.parentElement.hidden&&(input.id!=='record-time'||!document.getElementById('backfill-fields').hidden);});state.allPages.forEach(page=>page.hidden=true);state.baseline=snapshot(dialog);state.page=0;state.panel=null;render(dialog);}
export function showSheetField(field){const dialog=field.closest('dialog'),state=states.get(dialog);if(!state)return;state.page=Math.max(0,state.pages.findIndex(page=>page.contains(field)));render(dialog);}
export function requestSheetClose(dialog){const state=states.get(dialog);if(state.panel){state.panel.cancel();return;}if(snapshot(dialog)!==state.baseline){state.confirm.hidden=false;state.confirm.querySelector('button').focus();}else dialog.close();}
function render(dialog){const state=states.get(dialog);state.pages.forEach((page,i)=>page.hidden=i!==state.page);state.prev.disabled=state.page===0;state.next.disabled=state.page===state.pages.length-1;state.count.textContent=`${state.page+1} / ${state.pages.length}`;}
export function initSheets(){
 const resize=()=>document.documentElement.style.setProperty('--available-height',`${window.visualViewport?.height||window.innerHeight}px`);resize();window.visualViewport?.addEventListener('resize',resize);
 for(const dialog of document.querySelectorAll('dialog')){
  const form=dialog.querySelector('form');form.noValidate=true;
  const pages=[];
  const addPage=nodes=>{const page=document.createElement('div');page.className='sheet-page';form.insertBefore(page,form.querySelector('.form-error'));for(const node of nodes)page.append(node);pages.push(page);};
  if(dialog.id==='add-dialog'){
   const name=document.getElementById('tag-name');form.querySelector('label[for=tag-name]').textContent='标签名称 *';name.removeAttribute('maxlength');name.required=true;name.setAttribute('aria-describedby','form-error');
   addPage([form.querySelector('label[for=tag-name]'),name,form.querySelector('.icon-field')]);
   addPage([form.querySelector('label[for=tag-type]'),document.getElementById('tag-type'),document.getElementById('tag-unit-wrap')]);
  }else{
   const fields=document.getElementById('backfill-fields');const labels=[...fields.children];for(const label of labels)addPage([label]);
   addPage([document.getElementById('record-value-wrap')]);
  }
  const nav=document.createElement('div');nav.className='sheet-pagination';
  const prev=document.createElement('button'),next=document.createElement('button'),count=document.createElement('span');
  prev.type=next.type='button';prev.textContent='◀';next.textContent='▶';prev.setAttribute('aria-label','上一页');next.setAttribute('aria-label','下一页');count.setAttribute('aria-live','polite');nav.append(prev,count,next);form.insertBefore(nav,form.querySelector('.submit'));
  const confirm=document.createElement('div');confirm.className='discard-confirm';confirm.hidden=true;confirm.innerHTML='<p>是否退出？退出将丢失未保存内容</p><button type="button">继续填写</button><button type="button">退出</button>';
  confirm.addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();(document.activeElement===confirm.children[1]?confirm.children[2]:confirm.children[1]).focus();}e.stopPropagation();});confirm.setAttribute('role','alertdialog');confirm.setAttribute('aria-label','未保存内容');form.append(confirm);
  const state={pages,allPages:pages,prev,next,count,page:0,baseline:'',confirm,panel:null};states.set(dialog,state);
  prev.onclick=()=>{state.page--;render(dialog);};next.onclick=()=>{state.page++;render(dialog);};
  confirm.children[1].onclick=()=>{confirm.hidden=true;form.querySelector('.close').focus();};confirm.children[2].onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{confirm.hidden=true;state.panel?.cancel();});
  dialog.addEventListener('cancel',e=>{e.preventDefault();requestSheetClose(dialog);});
  let outside=false;dialog.addEventListener('pointerdown',e=>{const r=dialog.getBoundingClientRect();outside=e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;});
  dialog.addEventListener('click',e=>{const r=dialog.getBoundingClientRect();if(outside&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))requestSheetClose(dialog);outside=false;});
  form.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing&&e.target.matches('input')){e.preventDefault();e.target.blur();}});
  for(const input of form.querySelectorAll('input:not([type=file]),select')){
   input.enterKeyHint='done';
   if(input.type==='date'||input.type==='number'||input.id==='record-time'){
    if(input.id==='record-time')input.addEventListener('pointerdown',e=>{e.preventDefault();openPanel(dialog,input);});input.readOnly=true;input.addEventListener('click',()=>openPanel(dialog,input));
    input.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();openPanel(dialog,input);}});
   }
  }
  form.addEventListener('submit',e=>{for(const input of form.querySelectorAll('input,select'))if(!input.disabled&&!input.checkValidity()){e.preventDefault();e.stopImmediatePropagation();showSheetField(input);input.reportValidity();break;}},true);
 }
}
function openPanel(dialog,input){
 const state=states.get(dialog);if(state.panel)return;
 const panel=document.createElement('div');panel.className='field-panel';const caption=document.createElement('div');caption.className='panel-caption';caption.textContent=input.id==='record-time'?'发生时间':input.type==='date'?'发生日期':'数值';panel.append(caption);const display=document.createElement('output');display.className='panel-value';display.textContent=input.value||'请输入数值';display.setAttribute('aria-live','polite');panel.append(display);
 let draft=input.value;
 const body=document.createElement('div');panel.append(body);
 const submit=document.createElement('button');submit.type='button';submit.className='field-confirm';submit.textContent=input.id==='record-time'?'确认时间':input.type==='date'?'确认日期':'确认数值';panel.append(submit);
 const close=dialog.querySelector('.close'),oldLabel=close.getAttribute('aria-label');close.textContent='←';close.setAttribute('aria-label','返回表单');
 const onKey=e=>{if(input.type!=='number'||e.isComposing)return;if(/^[0-9.\-]$/.test(e.key)){e.preventDefault();draft+=e.key;display.textContent=draft;}else if(e.key==='Backspace'){e.preventDefault();draft=draft.slice(0,-1);display.textContent=draft;}else if(e.key==='Enter'){e.preventDefault();submit.click();}};dialog.addEventListener('keydown',onKey);
 const cancel=()=>{dialog.removeEventListener('keydown',onKey);panel.remove();dialog.classList.remove('field-mode');close.textContent='×';close.setAttribute('aria-label',oldLabel);state.panel=null;render(dialog);};state.panel={cancel};dialog.classList.add('field-mode');dialog.querySelector('form').append(panel);submit.focus();
 submit.onclick=()=>{if(input.type==='number'&&(!draft||!Number.isFinite(Number(draft)))){display.textContent='请输入有效数字';return;}if(input.id==='record-time'&&![...input.options].some(o=>o.value===draft))input.add(new Option(draft,draft));input.value=draft;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));cancel();input.focus();};
 if(input.id==='record-time'){
 body.className='time-wheels';const parts=(draft||'10:00').split(':');for(let column=0;column<2;column++){const wheel=document.createElement('div');wheel.className='time-wheel';wheel.setAttribute('role','group');wheel.setAttribute('aria-label',column===0?'小时':'分钟');for(let value=0;value<(column===0?24:60);value+=column===0?1:5){const text=String(value).padStart(2,'0');const b=document.createElement('button');b.type='button';b.textContent=text;b.setAttribute('aria-pressed',String(parts[column]===text));b.onclick=()=>{parts[column]=text;draft=parts.join(':');display.textContent=draft;for(const button of wheel.children)button.setAttribute('aria-pressed',String(button===b));};wheel.append(b);}let scrollTimer;wheel.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{if(!panel.isConnected)return;const index=Math.max(0,Math.min(wheel.children.length-1,Math.round(wheel.scrollTop/44)));wheel.children[index].click();},140);});body.append(wheel);requestAnimationFrame(()=>{const selected=wheel.querySelector('[aria-pressed=true]');if(selected)wheel.scrollTop=selected.offsetTop-wheel.offsetTop-44;});}
 }else if(input.type==='number'){
  body.className='number-pad';for(const key of ['1','2','3','4','5','6','7','8','9','−','0','.','清空','⌫']){const b=document.createElement('button');b.type='button';b.textContent=key;b.onclick=()=>{draft=key==='清空'?'':key==='⌫'?draft.slice(0,-1):key==='−'?(draft.startsWith('-')?draft.slice(1):'-'+draft):draft+key;display.textContent=draft||'请输入数值';};body.append(b);}
 }else{
  let month=new Date((draft||new Date().toLocaleDateString('sv-SE'))+'T12:00:00');month.setDate(1);
  const draw=()=>{body.replaceChildren();const nav=document.createElement('div');nav.className='calendar-nav';for(const step of [-1,0,1]){const b=document.createElement('button');b.type='button';b.textContent=step<0?'◀':step>0?'▶':`${month.getFullYear()}年 ${month.getMonth()+1}月`;b.setAttribute('aria-label',step<0?'上个月':step>0?'下个月':'当前月份');b.disabled=step===0;b.onclick=()=>{month.setMonth(month.getMonth()+step);draw();};nav.append(b);}body.append(nav);const grid=document.createElement('div');grid.className='calendar-grid';for(const name of ['一','二','三','四','五','六','日']){const span=document.createElement('span');span.textContent=name;grid.append(span);}const offset=(month.getDay()+6)%7;for(let i=0;i<offset;i++)grid.append(document.createElement('span'));for(let d=1;d<=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();d++){const value=`${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const b=document.createElement('button');b.type='button';b.textContent=d;b.disabled=!!input.max&&value>input.max;b.setAttribute('aria-pressed',String(value===draft));b.onclick=()=>{draft=value;display.textContent=draft;draw();};grid.append(b);}body.append(grid);};draw();
 }
}

export function initFloatingFields(){
 for(const input of document.querySelectorAll('input:not([type=file]):not([type=checkbox]):not([type=radio])')){
  let label=input.closest('label');
  if(!label)label=document.querySelector(`label[for="${input.id}"]`);
  if(!label){label=document.createElement('label');label.htmlFor=input.id;label.textContent=input.getAttribute('aria-label')||input.placeholder;input.before(label);}
  const wrapper=document.createElement('div');wrapper.className='floating-field';label.before(wrapper);
  const caption=document.createElement('span');caption.className='floating-caption';
  if(label.contains(input)){for(const node of [...label.childNodes])if(node!==input)caption.append(node);label.append(caption,input);wrapper.append(label);}
  else{caption.textContent=label.textContent;label.replaceChildren(caption);wrapper.append(label,input);}
  const sync=()=>wrapper.classList.toggle('has-value',!!input.value);
  input.addEventListener('input',sync);input.addEventListener('change',sync);sync();
  input.addEventListener('focus',()=>{sync();wrapper.classList.add('focused');});input.addEventListener('blur',()=>wrapper.classList.remove('focused'));
  if(input.type==='search'||input.type==='text')input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();input.blur();}});
 }
}

function syncKeyboardLayout(){
 const active=document.activeElement;
 for(const dialog of document.querySelectorAll('dialog')){
  const editing=dialog.contains(active)&&active.matches('input:not([readonly]):not([type=file])')&&(window.visualViewport?.height||innerHeight)<650;
  dialog.classList.toggle('keyboard-edit',editing);
  dialog.querySelectorAll('.keyboard-field').forEach(node=>node.classList.remove('keyboard-field'));
  let done=dialog.querySelector('.keyboard-done');
  if(editing){active.closest('.floating-field')?.classList.add('keyboard-field');if(!done){done=document.createElement('button');done.type='button';done.className='keyboard-done field-confirm';done.textContent='完成输入';done.onclick=()=>{active.blur();dialog.classList.remove('keyboard-edit');};dialog.querySelector('form').append(done);}done.onclick=()=>{active.blur();dialog.classList.remove('keyboard-edit');};}
 }
}
window.visualViewport?.addEventListener('resize',syncKeyboardLayout);
document.addEventListener('focusin',syncKeyboardLayout);
document.addEventListener('focusout',()=>setTimeout(syncKeyboardLayout,0));
