const {chromium}=require(process.env.LECTURE_LAB_PLAYWRIGHT || 'playwright');
const {spawn,spawnSync}=require('child_process'),assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');
const root=path.resolve(__dirname,'..'),artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'lecture-history-'));
const embedded=path.join(root,'runtime','python.exe');
const python=process.env.LECTURE_LAB_PYTHON || (fs.existsSync(embedded)?embedded:'python');
const pdf=path.join(artifacts,'math-layout.pdf');
const made=spawnSync(python,['-c',"import fitz,sys; d=fitz.open(); p=d.new_page(); p.insert_text((60,60),'A square is written as x2. The derivative of a square is twice its argument.'); p.insert_text((60,100),'x',fontsize=12); p.insert_text((67,94),'2',fontsize=8); d.save(sys.argv[1])",pdf],{cwd:root,windowsHide:true});
assert.equal(made.status,0,String(made.stderr));
(async()=>{
 const server=spawn(python,['tests/browser_fixture.py'],{cwd:root,windowsHide:true});let browser;
 try {
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);setTimeout(()=>reject(Error('Startup timeout')),10000).unref();});
  browser=await chromium.launch({...(process.env.LECTURE_LAB_CHROME?{executablePath:process.env.LECTURE_LAB_CHROME}:{}),headless:true,args:['--no-proxy-server']});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
  const ready=async p=>{await p.goto('http://127.0.0.1:8766');await p.waitForFunction(()=>!booting&&document.getElementById('model').value==='fixture-model');};
  const saved=async p=>p.evaluate(()=>saveQueue);
  const reload=async p=>{await saved(p);await p.reload();await p.waitForFunction(()=>!booting&&document.getElementById('model').value==='fixture-model');};
  const generate=async n=>{await page.click('#generate-btn');await page.waitForFunction(n=>!busy&&workspace.quizzes.length===n,n);await saved(page);};
  const select=async id=>page.locator(`.quiz-entry[data-quiz-id="${id}"]`).click();
  await ready(page);await page.setInputFiles('#pdf-input',pdf);await page.waitForFunction(()=>!busy&&workspace.groups.length===1);
  for(const [kind,count] of Object.entries({mcq:0,tf:0,short:1}))await page.locator('#count-'+kind).evaluate((el,n)=>{el.value=n;el.dispatchEvent(new Event('input',{bubbles:true}));},count);
  await generate(1);const first=await page.evaluate(()=>activeEntry.id);await page.fill('#response-0','第一套原来的作答');await saved(page);
  const stale=await context.newPage();await ready(stale);
  await page.click('#regenerate-btn');await generate(2);const second=await page.evaluate(()=>activeEntry.id);await page.fill('#response-0','第二套独立作答');await saved(page);
  await select(first);await page.fill('#response-0','第一套的新作答');await saved(page);
  // An unchanged stale answer must not replace the first tab's newer answer.
  await stale.click('#regenerate-btn');await stale.fill('#topic','旧窗口修改主题');await saved(stale);
  await reload(page);assert.equal(await page.evaluate(()=>workspace.quizzes.length),2);
  await select(first);assert.equal(await page.inputValue('#response-0'),'第一套的新作答');
  // Editing one old answer must still retain the newly generated second quiz.
  await stale.click('#nav-quiz');await stale.fill('#response-0','旧窗口明确修改答案');await saved(stale);
  await reload(page);assert.equal(await page.evaluate(()=>workspace.quizzes.length),2);
  await select(second);assert.equal(await page.inputValue('#response-0'),'第二套独立作答');
  await page.click('#regenerate-btn');await generate(3);const third=await page.evaluate(()=>activeEntry.id);
  assert.equal(await page.locator('.pdf-group .quiz-entry').count(),3);
  // Cancel, Escape and default focus are safe; sidebar trash removes only its row.
  await page.click('#delete-quiz-btn');assert(await page.locator('#delete-dialog').isVisible());
  assert.equal(await page.evaluate(()=>document.activeElement.id),'delete-cancel');await page.click('#delete-cancel');
  assert.equal(await page.locator('.quiz-entry[data-quiz-id]').count(),3);
  await page.locator(`.quiz-row:has([data-quiz-id="${first}"]) .quiz-delete`).click();
  await page.keyboard.press('Escape');assert.equal(await page.locator('.quiz-entry[data-quiz-id]').count(),3);
  await page.locator(`.quiz-row:has([data-quiz-id="${first}"]) .quiz-delete`).click();await page.click('#delete-confirm');
  await page.waitForFunction(id=>!workspace.quizzes.some(e=>e.id===id),first);await saved(page);
  assert.equal(await page.evaluate(()=>activeEntry.id),third);assert.equal(await page.locator('#quiz-sources a').count(),1);
  // A stale tab still holding the deleted quiz cannot resurrect it, even on edit/pagehide.
  await stale.fill('#response-0','不能把已删除的题目恢复');await saved(stale);await stale.close();
  await reload(page);assert.equal(await page.locator('.quiz-entry[data-quiz-id]').count(),2);
  assert.equal(await page.locator(`[data-quiz-id="${first}"]`).count(),0);
  // Remove active quiz, select surviving one, keep its progress, then regenerate.
  await select(third);await page.click('#delete-quiz-btn');await page.click('#delete-confirm');await saved(page);
  assert.equal(await page.evaluate(()=>activeEntry.id),second);assert.equal(await page.inputValue('#response-0'),'第二套独立作答');
  const staleGroup=await context.newPage();await ready(staleGroup);await staleGroup.click('#regenerate-btn');
  await page.click('#regenerate-btn');await generate(2);
  assert.equal(await page.evaluate(()=>activeEntry.title),'练习 4');
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.click('#delete-quiz-btn');assert(await page.locator('#delete-dialog').isVisible());
  assert(await page.evaluate(()=>document.getElementById('delete-dialog').getBoundingClientRect().width<=innerWidth));
  await page.screenshot({path:path.join(artifacts,'mobile.png'),fullPage:true});await page.click('#delete-cancel');
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(artifacts,'desktop.png'),fullPage:true});
  // Last generated quiz deletion returns to usable source settings without removing PDFs.
  for(const id of await page.evaluate(()=>workspace.quizzes.map(e=>e.id))){await select(id);await page.click('#delete-quiz-btn');await page.click('#delete-confirm');await saved(page);}
  assert(await page.locator('#create-view').isVisible());assert.equal(await page.locator('.pdf-group').count(),0);
  assert.equal(await page.locator('#source-files li').count(),1);assert.equal(await page.locator('#generate-btn').isEnabled(),true);
  await staleGroup.fill('#topic','旧标签页设置不能回退已生成的序号');await saved(staleGroup);await staleGroup.close();
  await reload(page);assert.equal(await page.evaluate(()=>workspace.quizzes.length),0);await generate(1);
  assert.equal(await page.evaluate(()=>activeEntry.title),'练习 5');
  await page.click('#sample-btn');await page.waitForFunction(()=>activeEntry.quiz.sample);
  await page.click('#delete-quiz-btn');await page.click('#delete-confirm');await saved(page);
  assert.equal(await page.evaluate(()=>workspace.quizzes.filter(e=>e.quiz.sample).length),0);
  await page.click('#sample-btn');await page.waitForFunction(()=>activeEntry.quiz.sample);assert.equal(await page.evaluate(()=>workspace.quizzes.length),2);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(artifacts,'verification.json'),JSON.stringify({passed:true,checks:['independent generations','stale-tab append preservation','unchanged stale answer preservation','explicit edit preservation','cancel/Escape/focus','per-row deletion','active fallback','deleted quiz cannot resurrect','reload','monotonic numbering','retained PDF reuse','sample recreation','desktop/mobile'],realProvider:false},null,2));
  console.log('Artifacts: '+artifacts);
  console.log('PASS: independent history, concurrent saves, deletion/cancellation/active fallback/tombstones, reload, retained PDF reuse, numbering, sample, desktop/mobile. Dummy provider only.');
 }finally {if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
