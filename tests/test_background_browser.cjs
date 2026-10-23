const {chromium}=require(process.env.LECTURE_LAB_PLAYWRIGHT || 'playwright');
const {spawn,spawnSync}=require('child_process'),assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),http=require('http');
const root=path.resolve(__dirname,'..'),artifacts=fs.mkdtempSync(path.join(os.tmpdir(),'lecture-background-'));
const embedded=path.join(root,'runtime','python.exe'),python=process.env.LECTURE_LAB_PYTHON || (fs.existsSync(embedded)?embedded:'python');
const pdf=path.join(artifacts,'math-layout.pdf');
const made=spawnSync(python,['-c',"import fitz,sys; d=fitz.open(); p=d.new_page(); p.insert_text((60,60),'The derivative of a square is twice its argument.'); p.insert_text((60,100),'x',fontsize=12); p.insert_text((67,94),'2',fontsize=8); d.save(sys.argv[1])",pdf],{cwd:root,windowsHide:true});
assert.equal(made.status,0,String(made.stderr));
const url='http://127.0.0.1:8766';
function get(route){return new Promise((resolve,reject)=>{http.get(url+route,res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>{try{resolve(JSON.parse(text));}catch(e){reject(e);}});}).on('error',reject);});}
const until=async(test,timeout=20000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await test())return;await new Promise(r=>setTimeout(r,100));}throw Error('Background test timeout');};
(async()=>{
 const server=spawn(python,['tests/browser_fixture.py'],{cwd:root,windowsHide:true});let browser;
 try{
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);setTimeout(()=>reject(Error('Startup timeout')),10000).unref();});
  browser=await chromium.launch({...(process.env.LECTURE_LAB_CHROME?{executablePath:process.env.LECTURE_LAB_CHROME}:{}),headless:true,args:['--no-proxy-server']});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[];
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
  let page=await context.newPage();
  const ready=async p=>{await p.goto(url);await p.waitForFunction(()=>!booting&&document.getElementById('model').value==='fixture-model');};
  const delay=async ms=>{await page.request.post(url+'/api/test/provider',{data:{delay_ms:ms}});};
  const start=async()=>{await page.click('#generate-btn');await page.waitForFunction(()=>currentTask?.submitted);return page.evaluate(()=>currentTask.id);};
  const displayed=async n=>page.waitForFunction(n=>!busy&&workspace.quizzes.length===n,n);
  await ready(page);await page.setInputFiles('#pdf-input',pdf);await page.waitForFunction(()=>!busy&&workspace.groups.length===1);
  for(const [kind,count]of Object.entries({mcq:0,tf:0,short:1}))await page.locator('#count-'+kind).evaluate((el,n)=>{el.value=n;el.dispatchEvent(new Event('input',{bubbles:true}));},count);
  // Freeze page execution, a stronger case than an ordinary tab/window switch.
  await delay(2500);const first=await start();const cdp=await context.newCDPSession(page);
  await cdp.send('Page.setWebLifecycleState',{state:'frozen'});
  await until(async()=>(await get('/api/jobs/'+first)).status==='succeeded');
  assert.equal((await get('/api/test/metrics')).calls,1);
  await cdp.send('Page.setWebLifecycleState',{state:'active'});await page.bringToFront();await displayed(1);
  // Refresh while running resumes the task, without a second model call.
  await page.click('#regenerate-btn');await delay(2500);const second=await start();
  await page.reload();await displayed(2);assert.equal((await get('/api/test/metrics')).calls,2);
  assert.equal(await page.evaluate(()=>workspace.quizzes.filter(q=>q.id===workspace.tasks[1].id).length),1);
  // Close the tab while running; the independent server saves the result.
  await page.click('#regenerate-btn');const third=await start();await page.close();
  await until(async()=>(await get('/api/jobs/'+third)).status==='succeeded');
  page=await context.newPage();await ready(page);await displayed(3);
  assert.equal((await get('/api/test/metrics')).calls,3);
  // Offline browser polling does not stop the provider; online wake retrieves it.
  await page.click('#regenerate-btn');const fourth=await start();await context.setOffline(true);
  await until(async()=>(await get('/api/jobs/'+fourth)).status==='succeeded');
  await context.setOffline(false);await displayed(4);assert.equal((await get('/api/test/metrics')).calls,4);
  // Lose the creation response after acceptance. Retry the exact same ID.
  await page.click('#regenerate-btn');await delay(0);let interrupted=false;
  await page.route('**/api/jobs',async route=>{if(!interrupted){interrupted=true;await route.fetch();await route.abort();}else await route.continue();});
  await page.click('#generate-btn');await displayed(5);await page.unroute('**/api/jobs');
  assert.equal((await get('/api/test/metrics')).calls,5);
  await page.fill('#response-0','恢复后的独立答案');await page.evaluate(()=>saveQueue);await page.reload();await displayed(5);
  assert.equal(await page.inputValue('#response-0'),'恢复后的独立答案');
  assert.equal(await page.evaluate(()=>new Set(workspace.quizzes.map(q=>q.id)).size),5);
  assert.equal(await page.evaluate(()=>workspace.tasks.filter(t=>t.status==='pending').length),0);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(artifacts,'recovered.png'),fullPage:true});
  fs.writeFileSync(path.join(artifacts,'verification.json'),JSON.stringify({passed:true,modelCalls:5,realProvider:false,checks:['frozen page','refresh while running','closed tab','offline recovery','ambiguous submission retry','one import per job','answer persistence']},null,2));
  console.log('Artifacts: '+artifacts);console.log('PASS: frozen/refresh/closed/offline pages recover results, ambiguous retry deduplicated; 5 model calls for 5 tasks. Dummy provider only.');
 }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
