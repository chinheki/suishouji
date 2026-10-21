const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const base = process.env.SUISHOUJI_TEST_URL || 'http://127.0.0.1:4188';
(async () => {
 const browser = await chromium.launch({headless:true,channel:'chrome'});
 try {
  const page = await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Tokyo'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const [path,id] of [['cycles.html','results'],['backup.html','out']]){
   await page.goto(`${base}/tests/${path}`);
   await page.waitForFunction(id=>document.getElementById(id).textContent!=='运行中',id);
   const output=await page.locator('#'+id).innerText();assert(!output.includes('FAIL'),output);console.log(output);
  }
  await page.goto(base);await page.locator('#conditions .tag').first().waitFor();
  await page.screenshot({path:'preview-home.png'});
  const add=()=>page.getByRole('button',{name:'添加实验条件标签',exact:true}).click();
  await add();await page.locator('#close-dialog').click();assert(!await page.locator('#add-dialog').isVisible());
  await add();await page.locator('#tag-name').fill('中文名字超过十个汉字测试');assert.match(await page.locator('#form-error').innerText(),/20/);
  await page.locator('#tag-name').fill('新标签');await page.locator('#tag-name').press('Enter');assert(await page.locator('#add-dialog').isVisible());
  await page.locator('#add-dialog [aria-label="下一页"]').click();await page.locator('#tag-type').selectOption('number');await page.locator('#tag-unit').fill('kg');
  await page.locator('#close-dialog').click();await page.getByRole('button',{name:'继续填写',exact:true}).click();assert.equal(await page.locator('#tag-unit').inputValue(),'kg');
  await page.locator('#add-dialog [aria-label="上一页"]').click();assert.equal(await page.locator('#tag-name').inputValue(),'新标签');
  await page.screenshot({path:'preview-form.png'});
  await page.locator('#add-submit').click();await page.locator('#add-dialog').waitFor({state:'hidden'});
  const tag=page.getByRole('button',{name:'记录一次：新标签',exact:true});await tag.click();await page.locator('#record-value').click();
  await page.getByRole('button',{name:'1',exact:true}).click();await page.getByRole('button',{name:'返回表单',exact:true}).click();assert.equal(await page.locator('#record-value').inputValue(),'');
  await page.locator('#record-value').click();await page.getByRole('button',{name:'2',exact:true}).click();await page.getByRole('button',{name:'确认数值',exact:true}).click();assert.equal(await page.locator('#record-value').inputValue(),'2');
  await page.locator('#record-submit').click();await page.locator('#record-dialog').waitFor({state:'hidden'});
  await page.locator('#undo').click();await page.waitForFunction(()=>!document.querySelector('#page-home .recorded'));
  await tag.focus();await tag.press('Shift+F10');await page.locator('#record-date').click();await page.getByRole('button',{name:'上个月',exact:true}).click();await page.getByRole('button',{name:'上个月',exact:true}).click();await page.setViewportSize({width:320,height:740});const cal=await page.locator('#record-dialog').evaluate(el=>({scroll:el.scrollHeight,client:el.clientHeight}));assert(cal.scroll<=cal.client+1,JSON.stringify(cal));await page.setViewportSize({width:390,height:844});await page.screenshot({path:'preview-calendar.png'});await page.getByRole('button',{name:'1',exact:true}).click();await page.getByRole('button',{name:'确认日期',exact:true}).click();
  await page.locator('#record-dialog [aria-label="下一页"]').click();await page.locator('#record-time').click();await page.locator('.time-wheel').first().getByRole('button',{name:'23',exact:true}).click();await page.locator('.time-wheel').last().getByRole('button',{name:'55',exact:true}).click();await page.getByRole('button',{name:'确认时间',exact:true}).click();assert.equal(await page.locator('#record-time').inputValue(),'23:55');
  await page.locator('#record-dialog [aria-label="下一页"]').click();await page.locator('#record-value').click();await page.getByRole('button',{name:'3',exact:true}).click();await page.getByRole('button',{name:'确认数值',exact:true}).click();await page.locator('#record-submit').click();await page.locator('#record-dialog').waitFor({state:'hidden'});
  await page.locator('[data-page=settings]').click();await page.getByRole('button',{name:'导出备份',exact:true}).click();assert.match(await page.locator('#backup-status').innerText(),/备份|导出/);
  for(const size of [{width:320,height:740},{width:390,height:844},{width:1280,height:900}]){
   await page.setViewportSize(size);await page.locator('[data-page=home]').click();await add();
   const geometry=await page.locator('#add-dialog').evaluate(el=>({height:el.getBoundingClientRect().height,scroll:el.scrollHeight,client:el.clientHeight,width:el.getBoundingClientRect().width}));assert(geometry.height<=size.height*.66+1);assert(geometry.scroll<=geometry.client+1,JSON.stringify(geometry));assert(geometry.width<=800);await page.locator('#close-dialog').click();
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await page.context().setOffline(true);await page.reload();await page.locator('#conditions .tag').first().waitFor();await add();await page.locator('#tag-name').fill('离线标签');await page.locator('#add-submit').click();await page.locator('#add-dialog').waitFor({state:'hidden'});await page.getByRole('button',{name:'记录一次：离线标签',exact:true}).click();await page.locator('#undo').waitFor({state:'visible'});assert.deepEqual(errors,[]);console.log('PASS: draft protection, pagination, length, Enter, numeric/date/time panels, backup, 320/390/1280 layouts');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
