const {chromium}=require(process.env.LECTURE_LAB_PLAYWRIGHT || 'playwright');
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert');
const root=path.resolve(__dirname,'../docs');
const out=process.env.LECTURE_LAB_SHOWCASE_QA_DIR || path.resolve(__dirname,'../.showcase-checks');
fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.mp4':'video/mp4','.vtt':'text/vtt','.txt':'text/plain; charset=utf-8'};
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html')));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  const size=fs.statSync(file).size,headers={'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','Accept-Ranges':'bytes'};
  const range=/bytes=(\d+)-(\d*)/.exec(req.headers.range||'');
  if(range){const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),size-1):size-1;res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1});fs.createReadStream(file,{start,end}).pipe(res);}
  else{res.writeHead(200,{...headers,'Content-Length':size});fs.createReadStream(file).pipe(res);}
});
const checks=[];
(async()=>{
  await new Promise(ok=>server.listen(8777,'127.0.0.1',ok));
  const browser=await chromium.launch({executablePath:process.env.LECTURE_LAB_CHROME || (process.platform==='win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined),headless:true,args:['--no-proxy-server']});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    const errors=[],failed=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push([r.url(),r.status()]);});
    assert((await page.goto('http://127.0.0.1:8777/')).ok());
    await page.locator('img:not(#dialog-image)').evaluateAll(imgs=>imgs.forEach(img=>img.loading='eager'));
    await page.waitForFunction(()=>[...document.querySelectorAll('img:not(#dialog-image)')].every(i=>i.complete&&i.naturalWidth));
    assert.equal(await page.locator('html').getAttribute('lang'),'en');
    assert.equal(await page.locator('h1').count(),1);
    assert(!/[\u3400-\u9fff]/u.test(await page.locator('body').innerText()),'Chinese on showcase');
    const links=await page.locator('[href],[src],video[poster]').evaluateAll(els=>els.flatMap(el=>['href','src','poster'].filter(a=>el.hasAttribute(a)).map(a=>el.getAttribute(a))));
    for(const link of new Set(links)){
      if(link.startsWith('#'))assert(await page.locator(link).count(),'Missing anchor '+link);
      else if(!/^[a-z]+:/i.test(link))assert(fs.existsSync(path.join(root,link)),'Missing asset '+link);
    }
    checks.push('English content, unique title, internal anchors, local assets');
    for(const width of [1440,1024,768,390,320]){
      await page.setViewportSize({width,height:1000});
      const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
      if(overflow.scroll>width+1)console.log(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>({tag:el.tagName,class:el.className,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width,text:el.textContent.slice(0,50)}))));
      assert(overflow.scroll<=width+1,'Overflow '+JSON.stringify(overflow));
      await page.locator('.comparison>summary').click();
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Open table overflow');
      await page.locator('.comparison>summary').click();
      for(const link of await page.locator('nav a').all()){await link.click();const hash=await page.evaluate(()=>location.hash);const rect=await page.locator(hash).boundingBox();const header=await page.locator('.site-header').boundingBox();assert(rect.y>=header.height-1,'Anchor hidden under header '+hash);}
      await page.evaluate(()=>scrollTo(0,0));
      if(width===1440){await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});await page.locator('.hero').screenshot({path:path.join(out,'hero.png')});}
      if(width===390){await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});await page.locator('#team').screenshot({path:path.join(out,'team-mobile.png')});}
      checks.push(`Layout and navigation at ${width}px, including open results table`);
    }
    await page.setViewportSize({width:1440,height:1000});
    const opener=page.locator('a[data-lightbox]').nth(2);
    await opener.click();assert(await page.locator('#image-dialog').isVisible());
    assert((await page.locator('#image-dialog-title').innerText()).includes('source'));
    await page.keyboard.press('Escape');assert(!await page.locator('#image-dialog').isVisible());
    assert(await opener.evaluate(el=>el===document.activeElement));
    await opener.click();await page.locator('#close-image').click();assert(!await page.locator('#image-dialog').isVisible());
    checks.push('Screenshot viewer, full-size image, Escape/close and returned keyboard focus');
    const faq=page.locator('.faq-list details').nth(2);await faq.locator('summary').focus();await page.keyboard.press('Enter');assert(await faq.getAttribute('open')!==null);
    checks.push('Keyboard-operated FAQ');
    await page.locator('#demo').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('.demo-outline li').count(),4);
    const finalDemo=page.locator('#final-demo-video');
    assert.equal(await finalDemo.count(),1);
    assert.equal(await finalDemo.getAttribute('href'),'https://www.youtube.com/watch?v=8RMKTD8L2ng');
    assert.equal(await finalDemo.getAttribute('target'),'_blank');
    assert((await finalDemo.getAttribute('rel')).includes('noopener'));
    assert.equal(await page.locator('a[href*="youtube.com"],a[href*="youtu.be"]').count(),1);
    assert.equal(await page.locator('a[href*="Nv7gvNffzcs"],video,iframe').count(),0);
    assert((await page.locator('#demo').innerText()).includes('Focus on a topic'));
    checks.push('Final demo link only, no presentation link or embedded player');
    assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior),'auto');
    checks.push('Reduced-motion preference respected');
    const contrast=await page.evaluate(()=>{
      const rgb=s=>{const a=s.match(/[\d.]+/g)?.map(Number)||[];return a.length>=3?a:null};
      const lum=a=>{const c=a.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*c[0]+.7152*c[1]+.0722*c[2]};
      const failures=[];
      for(const el of document.querySelectorAll('body *')){
        if(el.closest('[aria-hidden=true],dialog:not([open])')||!el.getClientRects().length||!Array.from(el.childNodes).some(n=>n.nodeType===3&&n.textContent.trim()))continue;
        const style=getComputedStyle(el),fg=rgb(style.color);if(!fg)continue;let current=el,bg;
        while(current){const candidate=rgb(getComputedStyle(current).backgroundColor);if(candidate&&(candidate.length<4||candidate[3]>.95)){bg=candidate;break}current=current.parentElement;}
        if(!bg)continue;const ratio=(Math.max(lum(fg),lum(bg))+.05)/(Math.min(lum(fg),lum(bg))+.05);
        const size=parseFloat(style.fontSize),large=size>=24||(size>=18.66&&Number(style.fontWeight)>=700);
        if(ratio<(large?3:4.5))failures.push({text:el.textContent.trim().slice(0,80),ratio:Math.round(ratio*100)/100,color:style.color});
      }return failures;
    });
    if(contrast.length)console.log(JSON.stringify(contrast));
    assert.deepEqual(contrast,[],'Low text contrast');checks.push('WCAG AA text contrast (computed solid backgrounds)');
    const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}}),fallback=await nojs.newPage();
    await fallback.goto('http://127.0.0.1:8777/');assert(await fallback.locator('#team').count());
    const imageLink=fallback.locator('[data-lightbox]').first();assert((await fallback.request.get(new URL(await imageLink.getAttribute('href'),fallback.url()).href)).ok());
    await nojs.close();checks.push('Core content and screenshot links work without JavaScript');
    assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
    fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({passed:true,date:new Date().toISOString().slice(0,10),checks,errors,failed,live_provider_calls:0},null,2));
    console.log(JSON.stringify({passed:true,checks:checks.length,errors,failed}));
  }finally{await browser.close();server.close();}
})().catch(e=>{server.close();console.error(e);process.exitCode=1});
