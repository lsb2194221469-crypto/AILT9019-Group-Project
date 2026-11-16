const {chromium} = require(process.env.LECTURE_LAB_PLAYWRIGHT || 'playwright');
const {spawn, spawnSync} = require('child_process'), assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os');
const root = path.resolve(__dirname, '..');
const artifacts = process.env.LECTURE_LAB_ARTIFACTS || fs.mkdtempSync(path.join(os.tmpdir(), 'lecture-sources-'));
fs.mkdirSync(artifacts, {recursive:true});
const python = process.env.LECTURE_LAB_PYTHON || (fs.existsSync(path.join(root, 'runtime/python.exe')) ? path.join(root, 'runtime/python.exe') : 'python');
const input = path.join(artifacts, 'math-source.pdf');
const made = spawnSync(python, ['-c', "import sys; sys.path.insert(0,'tests'); from test_source_preview import math_pdf; from pathlib import Path; Path(sys.argv[1]).write_bytes(math_pdf())", input], {cwd:root, windowsHide:true});
assert.equal(made.status, 0, String(made.stderr));
(async () => {
  const server = spawn(python, ['tests/browser_fixture.py'], {cwd:root, windowsHide:true});
  let browser;
  try {
    await new Promise((resolve,reject) => {server.stdout.once('data',resolve);server.once('error',reject);setTimeout(() => reject(Error('Startup timeout')),10000).unref();});
    browser = await chromium.launch({...(process.env.LECTURE_LAB_CHROME ? {executablePath:process.env.LECTURE_LAB_CHROME} : {}), headless:true, args:['--no-proxy-server']});
    const page = await browser.newPage({viewport:{width:1440, height:1000}}), errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:8766') && !request.url().startsWith('blob:')) external.push(request.url()); });
    await page.goto('http://127.0.0.1:8766');
    await page.waitForFunction(() => !booting && document.getElementById('model').value === 'fixture-model');
    await page.setInputFiles('#pdf-input', [
      {name:'math-source.pdf', mimeType:'application/pdf', buffer:fs.readFileSync(input)},
      {name:'second-source.pdf', mimeType:'application/pdf', buffer:Buffer.concat([fs.readFileSync(input),Buffer.from('\n% second fixture\n')])}
    ]);
    await page.waitForFunction(() => !busy && documentData && workspace.groups.length === 1);
    await page.waitForFunction(() => document.querySelector('#source-preview img')?.naturalWidth > 0);
    for (const kind of ['mcq','tf','short']) await page.locator('#count-'+kind).evaluate(element => {element.value=1;element.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.click('#generate-btn');
    await page.waitForFunction(() => !busy && workspace.quizzes.length === 1);
    // Seed old saved quotes containing known extraction artifacts. This is not
    // a live model result and does not loosen server citation validation.
    const legacy = ['Expectation of continuous rv: E[g(X)] = R g(x) f(x) dx', 'P r ( X <= x ) denotes cumulative probability.'];
    await page.evaluate(quotes => {
      quiz.questions[0].quote = quotes[0]; quiz.questions[1].quote = quotes[1];
      quiz.questions[0].explanation = String.raw`Use \(Pr(X\le x)\), \(\operatorname{V a r}(X)\) and \(\int_{-\infty}^{\infty}g(x)f(x)\,\mathrm{d}x\).`;
      activeEntry.answers = quiz.questions.map(q => q.answer);
      activeEntry.answers[0] = quiz.questions[0].options.find(option => option !== quiz.questions[0].answer);
      renderQuiz();
    }, legacy);
    await page.click('#submit-btn');
    await page.evaluate(() => {
      for (const summary of document.querySelectorAll('#questions summary')) {
        if (summary.textContent.startsWith('查看原文依据')) summary.parentElement.open = true;
      }
    });
    await page.waitForFunction(() => document.querySelectorAll('#questions .source-image').length === 3 && [...document.querySelectorAll('#questions .source-image')].every(img => img.naturalWidth > 0));
    assert.equal(await page.locator('#questions .source-extracted[open]').count(), 0);
    assert.deepEqual(await page.evaluate(() => quiz.questions.slice(0,2).map(q=>q.quote)), legacy);
    assert(await page.locator('#questions .katex').count() > 0);
    assert.equal(await page.locator('#questions .katex-error').count(), 0);
    assert.equal(await page.locator('.answer-status.is-wrong').count(), 1);
    assert.equal(await page.locator('.your-wrong-answer').count(), 1);
    assert.equal(await page.locator('.question-jump.is-wrong').count(), 1);
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    const alts = await page.locator('#questions .source-image').evaluateAll(images => images.map(image=>image.alt));
    assert(alts[0].startsWith('math-source.pdf 第 1 页'));
    assert(alts[1].startsWith('second-source.pdf 第 1 页'));
    assert.equal(await page.locator('#questions .source-original').first().getAttribute('href').then(href=>href.endsWith('#page=1')), true);
    await page.locator('#questions .source-facsimile').first().screenshot({path:path.join(artifacts,'integral-desktop.png')});
    await page.locator('#questions .source-facsimile').nth(1).screenshot({path:path.join(artifacts,'probability-desktop.png')});
    await page.locator('#questions > article').first().screenshot({path:path.join(artifacts,'wrong-answer-desktop.png')});
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('#questions .source-facsimile').first().screenshot({path:path.join(artifacts,'integral-mobile.png')});
    await page.evaluate(() => saveQueue); await page.reload();
    await page.waitForFunction(() => !booting && document.querySelectorAll('#questions .source-image').length === 3);
    assert.deepEqual(await page.evaluate(() => quiz.questions.slice(0,2).map(q=>q.quote)), legacy);
    // Missing local PDF must not substitute another document in a multi-PDF group.
    const missing = await page.evaluate(() => {
      const view = LectureSources.create(null, 1, 'R and P r must not be guessed.');
      return {images:view.element.querySelectorAll('img').length, text:view.element.textContent};
    });
    assert.equal(missing.images, 0); assert(missing.text.includes('R and P r'));
    // Network failure remains recoverable without API calls or losing the quiz.
    await page.route('**/api/source-preview?*', route=>route.abort());
    await page.reload();
    await page.waitForFunction(() => !booting && document.querySelectorAll('#questions .source-retry').length === 3);
    assert.equal(await page.locator('#questions .source-original').count(), 3);
    await page.unroute('**/api/source-preview?*');
    await page.locator('#questions .source-retry').first().click();
    await page.waitForFunction(() => document.querySelector('#questions .source-image')?.naturalWidth > 0);
    assert.equal(await page.evaluate(() => workspace.quizzes.length), 1);
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    fs.writeFileSync(path.join(artifacts,'verification.json'), JSON.stringify({passed:true,realProvider:false,checks:['original integral and limits','probability typography','two PDFs with same page number','verbatim legacy quote unchanged','collapsed lossy text','original-page link','named operator KaTeX','reload recovery','390px no overflow','offline failure and retry','missing PDF fallback','no external requests']},null,2));
    console.log('PASS: original PDF evidence, legacy quotes, math operators, multiple sources, reload, mobile, failure/retry. Dummy provider only.');
    console.log('Artifacts: '+artifacts);
  } finally { if (browser) await browser.close(); server.kill(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
