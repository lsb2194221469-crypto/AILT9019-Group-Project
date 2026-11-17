const {chromium}=require(process.env.LECTURE_LAB_PLAYWRIGHT||'playwright');
const {spawn,spawnSync}=require('child_process'),fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),out=process.env.LECTURE_LAB_QA_DIR||path.join(root,'../../work/english-ui');
fs.mkdirSync(out,{recursive:true});
const python=process.env.LECTURE_LAB_PYTHON||path.join(root,'runtime/python.exe'),pdf=path.join(out,'english-notes.pdf');
assert.equal(spawnSync(python,['-c',"import fitz,sys;d=fitz.open();p=d.new_page();p.insert_text((60,60),'A square is written as x2. The derivative of a square is twice its argument.');p.insert_text((60,100),'x',fontsize=12);p.insert_text((67,94),'2',fontsize=8);d.save(sys.argv[1])",pdf],{windowsHide:true}).status,0);
(async()=>{
 const server=spawn(python,['tests/browser_fixture.py'],{cwd:root,windowsHide:true});let browser;
 try{
  await new Promise((ok,no)=>{server.stdout.once('data',ok);server.once('error',no);setTimeout(()=>no(Error('Server startup timeout')),10000).unref()});
  browser=await chromium.launch({executablePath:process.env.LECTURE_LAB_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-proxy-server']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const check=async label=>{const t=await page.locator('body').innerText();assert(!/[\u3400-\u9fff]/u.test(t),label+' contains Chinese: '+t.match(/.{0,20}[\u3400-\u9fff].{0,30}/u));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' horizontal overflow')};
  await page.goto('http://127.0.0.1:8766');await page.waitForFunction(()=>typeof booting!=='undefined'&&!booting);
  await check('Desktop home');assert.equal(await page.locator('html').getAttribute('lang'),'en');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).fontSize),'16px');
  await page.screenshot({path:path.join(out,'home-desktop.png'),fullPage:true});
  await page.click('#sample-btn');await check('Sample quiz');
  await page.click('#nav-create');await page.setInputFiles('#pdf-input',pdf);await page.waitForFunction(()=>!busy&&!!documentData);
  for(const k of ['mcq','tf','short'])await page.locator('#count-'+k).evaluate(el=>{el.value=1;el.dispatchEvent(new Event('input',{bubbles:true}))});
  await check('Upload and settings');await page.click('#generate-btn');await page.waitForFunction(()=>!busy&&quiz&&!quiz.sample);await check('Generated quiz');
  await page.locator('input[name=q0]').last().check();await page.locator('input[name=q1]').last().check();await page.fill('#response-2','The derivative is twice x.');await page.click('#submit-btn');await check('Answer review');
  await page.locator('#questions details>summary').first().click();await page.locator('#questions .source-image').first().waitFor();await check('Source preview');
  await page.screenshot({path:path.join(out,'review-desktop.png'),fullPage:true});
  for(const [open,close] of [['rename-btn','rename-cancel'],['delete-quiz-btn','delete-cancel'],['retry-btn','retry-cancel']]){await page.click('#'+open);await check(open);await page.click('#'+close)}
  await page.setViewportSize({width:390,height:844});await check('Mobile review');await page.screenshot({path:path.join(out,'review-mobile.png'),fullPage:true});
  await page.click('#regenerate-btn');await check('Mobile settings');await page.screenshot({path:path.join(out,'settings-mobile.png'),fullPage:true});
  await page.click('#clear-pdfs-btn');await page.setInputFiles('#pdf-input',{name:'not-a-pdf.txt',mimeType:'text/plain',buffer:Buffer.from('not a PDF')});await check('Upload error');
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'browser-check.json'),JSON.stringify({passed:true,provider:'simulated',checks:['English home','English sample','upload','mixed counts','generation','review','dialogs','mobile','upload error','no horizontal overflow','16px base font'],errors},null,2));
  console.log('PASS: English interface, sample, generation, review, dialogs, errors and mobile layout. Simulated provider.');
 }finally{if(browser)await browser.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
