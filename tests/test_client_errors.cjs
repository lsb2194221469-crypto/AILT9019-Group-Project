// Regression checks for real client functions, without a DOM or provider calls.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const source = fs.readFileSync(path.join(__dirname, '../static/app.js'), 'utf8');
const apiSource = source.slice(source.indexOf('async function api('), source.indexOf('function counts()'));
async function main() {
  let cleared = 0, abortTimer;
  const context = vm.createContext({AbortController,
    setTimeout: callback => { abortTimer = callback; return 1; },
    clearTimeout: () => cleared++, fetch: async () => ({ok:true, status:200, json:async()=>({status:'running'})})});
  vm.runInContext(apiSource, context);
  assert.equal((await context.api('/api/jobs/test')).status, 'running');
  context.fetch = async () => ({ok:false, status:403, json:async()=>({error:'denied'})});
  await assert.rejects(context.api('/api/jobs'), error => error.status === 403 && error.message === 'denied');
  context.fetch = async () => ({ok:false, status:503, json:async()=>{throw new SyntaxError('HTML');}});
  await assert.rejects(context.api('/api/jobs'), error => error.status === 503);
  context.fetch = async () => ({ok:true, status:200, json:async()=>null});
  await assert.rejects(context.api('/api/jobs'), /数据格式/);
  context.fetch = (_, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(new Error(), {name:'AbortError'})));
  });
  const hanging = context.api('/api/jobs'); abortTimer();
  await assert.rejects(hanging, /连接超时/);
  assert.equal(cleared, 5);

  // A completed result that cannot be imported must terminate with its actual
  // error, rather than being retried as a network failure indefinitely.
  let calls = 0;
  const taskContext = vm.createContext({
    api: async () => { calls++; return {status:'succeeded', result:{}}; },
    completeTask: async () => { throw new Error('PDF record missing'); },
    sync: () => {}, persist: async () => {}, message: () => {},
    $: () => ({replaceChildren: () => {}}),
    document: {createTextNode: () => ({})}, node: () => ({}),
    currentTask:null, busy:false});
  vm.runInContext(source.slice(source.indexOf('async function runTask('), source.indexOf("$('generate-btn').onclick")), taskContext);
  const task = {id:'test', status:'pending', submitted:true};
  await taskContext.runTask(task);
  assert.equal(calls, 1); assert.equal(task.status, 'failed');
  assert.equal(task.error, 'PDF record missing'); assert.equal(taskContext.busy, false);
  console.log('PASS: client success, HTTP error, HTML response, invalid payload, timeout cleanup, terminal import failure. No provider calls.');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
