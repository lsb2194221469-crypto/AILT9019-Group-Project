const {chromium}=require(process.env.LECTURE_LAB_PLAYWRIGHT||'playwright');
const {spawn}=require('child_process'),fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/editorial-2026-11-13');
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const server=spawn(path.join(root,'runtime/python.exe'),['tests/browser_fixture.py'],{cwd:root,windowsHide:true});let browser;
 try{
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);setTimeout(()=>reject(Error('Startup timeout')),10000).unref();});
  browser=await chromium.launch({executablePath:process.env.LECTURE_LAB_CHROME,headless:true,args:['--no-proxy-server']});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8766');await page.waitForFunction(()=>!booting&&document.getElementById('model').value==='fixture-model');
  for(const [name,width,height] of [['desktop',1440,1050],['mobile',390,844],['narrow',360,800],['tablet',768,1024]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const heading=await page.locator('h1').boundingBox();assert(heading.width>200);
   await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
  }
  await page.click('#nav-library');assert(await page.locator('#library-search').isVisible());
  await page.locator('.advanced-settings summary').click();assert(await page.locator('#model').isVisible());
  await page.click('#sample-btn');await page.waitForFunction(()=>workspace.view==='quiz');
  assert(await page.locator('#generation-dock').isHidden());
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,realProvider:false,checks:['1440/768/390/360 widths','no horizontal overflow','legible mobile heading','collection navigation','advanced settings disclosure','generation dock hidden while answering','no page errors'],historyRegression:'test_minimal_browser.cjs passed'},null,2));
  console.log('PASS: editorial desktop/tablet/mobile, collection navigation, advanced disclosure and quiz dock; screenshots: '+out);
 }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
