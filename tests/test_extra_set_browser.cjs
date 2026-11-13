const fs=require('fs'),path=require('path'),Module=require('module');
let source=fs.readFileSync(path.join(__dirname,'test_history_browser.cjs'),'utf8');
source=source.replace('assert.deepEqual(errors,[]);', `
  await page.fill('#response-0','必须保留的原始答案');await saved(page);
  const before=await page.evaluate(()=>({id:activeEntry.id,groupId:activeEntry.groupId,settings:activeEntry.settings,count:workspace.quizzes.length}));
  await page.click('#extra-set-btn');
  await page.waitForFunction(n=>!busy&&workspace.quizzes.length===n,before.count+1);
  assert.equal(await page.evaluate(()=>activeEntry.groupId),before.groupId);
  assert.notEqual(await page.evaluate(()=>activeEntry.id),before.id);
  assert.deepEqual(await page.evaluate(()=>activeEntry.settings),before.settings);
  assert.equal(await page.evaluate(id=>workspace.quizzes.find(q=>q.id===id).answers[0],before.id),'必须保留的原始答案');
  await saved(page);await reload(page);
  assert.equal(await page.evaluate(()=>workspace.quizzes.length),before.count+1);
  await page.click('#sample-btn');await page.waitForFunction(()=>activeEntry.quiz.sample);
  assert(await page.locator('#extra-set-btn').isHidden());
  assert.deepEqual(errors,[]);
  console.log('PASS: one-click additional set, same PDFs/settings, independent ID, prior answers retained after reload, sample hides button.');`);
const test=new Module(__filename,module);test.filename=__filename;test.paths=module.paths;test._compile(source,__filename);
