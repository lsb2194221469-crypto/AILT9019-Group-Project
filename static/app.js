const $ = id => document.getElementById(id);
let documentData = null, quiz = null, type = 'mcq', busy = false, submitted = false;
function node(tag, text, cls) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; }
function message(text, error = false) { $('message').hidden = !text; $('message').textContent = text; $('message').className = error ? 'error' : ''; }
async function api(path, options) { const res = await fetch(path, options); const data = await res.json(); if (!res.ok) throw new Error(data.error || '请求失败，请重试。'); return data; }
function sync() { $('generate-btn').disabled = busy || !documentData || !$('model').value; ['pdf-input','replace-btn','sample-btn','refresh-models','model','topic','count'].forEach(id => $(id).disabled = busy); document.querySelectorAll('[data-type]').forEach(b => b.disabled = busy); $('generate-btn').setAttribute('aria-busy', String(busy)); }
async function models() {
  try { const data = await api('/api/models'); const previous = $('model').value; $('model').replaceChildren();
    if (!data.models.length) { $('model').append(new Option('未找到可用本地模型', '')); $('model-status').textContent = '请启动 Ollama 并安装模型，然后点击刷新。也可先体验示例测验。'; }
    else { data.models.forEach(m => $('model').append(new Option(m, m))); if (data.models.includes(previous)) $('model').value = previous; $('model-status').textContent = '已连接本机 Ollama · 讲义不会发送到外部服务'; }
  } catch (e) { message(e.message, true); } sync();
}
function showPage() { const page = documentData.pages.find(p => String(p.page) === $('page-select').value); $('source-preview').textContent = page?.text || ''; }
async function upload(file) {
  if (!file || busy) return;
  if (!file.name.toLowerCase().endsWith('.pdf') || file.size > 15 * 1024 * 1024) return message('请选择不超过 15 MB 的 PDF 文件。', true);
  busy = true; sync(); message('正在读取讲义文字…');
  try { const data = await api('/api/upload', {method: 'POST', headers: {'Content-Type': 'application/pdf'}, body: file});
    documentData = {...data, name: file.name}; quiz = null; $('quiz-count').textContent = '0';
    $('dropzone').hidden = true; $('document-info').hidden = false; $('filename').textContent = file.name;
    $('page-count').textContent = `${data.pages.length} 页包含可读文字 · 已准备就绪`;
    $('page-select').replaceChildren(...data.pages.map(p => new Option(`第 ${p.page} 页`, p.page))); showPage();
    $('step-two').classList.add('current'); $('step-three').classList.remove('current'); message('讲义已就绪。选择模型和题型，开始生成练习。');
  } catch (e) { message(e.message, true); } finally { busy = false; $('pdf-input').value = ''; sync(); }
}
function view(which) { $('create-view').hidden = which !== 'create'; $('quiz-view').hidden = which !== 'quiz'; $('nav-create').classList.toggle('active', which === 'create'); $('nav-quiz').classList.toggle('active', which === 'quiz'); $('breadcrumb').textContent = which === 'quiz' ? '当前测验' : '创建练习'; }
function responses() {return quiz.questions.map((q,i) => q.type === 'short' ? $(`response-${i}`).value.trim() : document.querySelector(`input[name="q${i}"]:checked`)?.value);}
function progress() { const done = responses().filter(Boolean).length; $('answer-progress').textContent = `已完成 ${done} / ${quiz.questions.length} 题`; $('progress').max = quiz.questions.length; $('progress').value = done; }
function renderQuiz() {
  submitted = false; $('questions').replaceChildren(); $('results').hidden = true; $('submit-btn').hidden = false; $('review-actions').hidden = true; $('wrong-btn').setAttribute('aria-pressed', 'false'); $('wrong-btn').textContent = '只看错题';
  $('quiz-title').textContent = quiz.sample ? '示例：机器学习基础' : '你的讲义练习';
  $('quiz-label').textContent = quiz.sample ? 'PRE-GENERATED SAMPLE · 非实时生成' : 'GENERATED FROM YOUR LECTURE';
  $('quiz-notice').textContent = quiz.notice; $('quiz-count').textContent = quiz.questions.length;
  quiz.questions.forEach((q, i) => { const card = node('article', undefined, 'card question'); card.append(node('span', `QUESTION ${String(i + 1).padStart(2, '0')} / ${q.type === 'mcq' ? '选择题' : q.type === 'tf' ? '判断题' : '简答题'}`, 'q-number'), node('h3', q.question));
    if (q.type === 'short') { const input = node('textarea'); input.id = `response-${i}`; input.placeholder = '用自己的话解释…（提交后对照参考答案自评）'; input.setAttribute('aria-label', `第 ${i + 1} 题答案`); card.append(input); }
    else q.options.forEach((option, j) => { const label = node('label', undefined, 'option'); const input = node('input'); input.type = 'radio'; input.name = `q${i}`; input.value = option; label.append(input, node('span', `${String.fromCharCode(65 + j)}. ${option}`)); card.append(label); });
    const answer = node('div', undefined, 'answer'); answer.id = `answer-${i}`; answer.hidden = true; card.append(answer); $('questions').append(card);
  }); $('questions').querySelectorAll('input,textarea').forEach(el => el.addEventListener('input', progress)); progress(); view('quiz'); $('step-three').classList.add('current');
}
$('generate-btn').onclick = async () => {
  if (busy || !documentData) return; busy = true; sync(); $('generate-btn').textContent = '正在生成，请稍候…'; message('本地模型正在阅读讲义。生成可能需要几分钟，请保持页面打开。');
  try { quiz = await api('/api/generate', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({document_id:documentData.id, model:$('model').value, type, count:Number($('count').value), topic:$('topic').value})}); renderQuiz(); message('练习已生成。请先独立作答，再查看解析。'); }
  catch (e) { message(e.message, true); } finally { busy = false; $('generate-btn').replaceChildren(document.createTextNode('生成我的练习'), node('span', '→')); sync(); }
};
$('sample-btn').onclick = async () => { try { quiz = await api('/api/sample'); renderQuiz(); message('这是预先编写的示例，不使用上传的 PDF，也不代表本地模型已连接。'); } catch (e) {message(e.message, true);} };
$('submit-btn').onclick = () => {
  if (!quiz || submitted) return;
  const values = responses();
  if (values.some(r => !r)) {message('还有题目未作答，请完成全部题目后查看解析。', true); const first = values.findIndex(r => !r); $('questions').children[first].querySelector('input,textarea').focus(); return;}
  submitted = true; let correct = 0, objective = 0;
  quiz.questions.forEach((q,i) => { const answer = $(`answer-${i}`); answer.hidden = false;
    if (q.type !== 'short') { objective++; if (values[i] === q.answer) correct++; }
    answer.parentElement.dataset.wrong = String(q.type !== 'short' && values[i] !== q.answer);
    answer.append(node('strong', q.type === 'short' ? '简答题 · 对照原文自行评估' : values[i] === q.answer ? '✓ 回答正确' : '↗ 再看一眼这个知识点'), node('p', `参考答案：${q.answer}`), node('p', q.explanation));
    const details = node('details'); details.append(node('summary', `查看原文依据 · 第 ${q.page} 页`), node('blockquote', q.quote), node('p', '请对照原文检查答案。引用匹配不能保证题目和答案完全正确。', 'hint')); answer.append(details);
  }); $('questions').querySelectorAll('input,textarea').forEach(el => el.disabled = true);
  $('results').hidden = false; $('results').replaceChildren(node('span', 'SESSION COMPLETE', 'eyebrow'), node('h2', objective ? `${correct} / ${objective} 道客观题答对` : '完成一次主动回忆'), node('p', `${quiz.questions.length - objective} 道简答题请对照参考答案自评。可以展开每道题的原文出处。`));
  $('submit-btn').hidden = true; $('review-actions').hidden = false; $('wrong-btn').disabled = correct === objective; message('解析已展开。练习结果仅供自学参考。'); $('results').scrollIntoView({behavior:'smooth',block:'nearest'});
};
$('export-btn').onclick = () => { if (!quiz) return; const blob = new Blob([JSON.stringify(quiz,null,2)],{type:'application/json'}); const url = URL.createObjectURL(blob); const a = node('a'); a.href = url; a.download = quiz.sample ? 'sample-quiz.json' : 'lecture-quiz.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); };
$('pdf-input').onchange = e => upload(e.target.files[0]); $('replace-btn').onclick = () => $('pdf-input').click();
$('page-select').onchange = showPage; $('refresh-models').onclick = models; $('model').onchange = sync;
$('count').oninput = () => $('count-label').textContent = `${$('count').value} 题`;
document.querySelectorAll('[data-type]').forEach(button => button.onclick = () => {type = button.dataset.type; document.querySelectorAll('[data-type]').forEach(b => {b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', b === button);});});
['dragenter','dragover'].forEach(event => $('dropzone').addEventListener(event,e => {e.preventDefault(); $('dropzone').classList.add('drag');}));
['dragleave','drop'].forEach(event => $('dropzone').addEventListener(event,e => {e.preventDefault(); $('dropzone').classList.remove('drag'); if(event==='drop') upload(e.dataTransfer.files[0]);}));
$('back-btn').onclick = $('nav-create').onclick = () => view('create');
$('nav-quiz').onclick = () => {if (quiz) view('quiz'); else message('请先生成练习，或点击“体验示例测验”。');};
$('retry-btn').onclick = () => {renderQuiz(); message('新一轮练习已开始。先试着回忆，再对照答案。'); $('quiz-view').scrollIntoView({behavior:'smooth'});};
$('wrong-btn').onclick = () => {const filtered = $('wrong-btn').getAttribute('aria-pressed') !== 'true'; $('wrong-btn').setAttribute('aria-pressed', String(filtered)); $('wrong-btn').textContent = filtered ? '显示全部题目' : '只看错题'; [...$('questions').children].forEach(card => card.hidden = filtered && card.dataset.wrong !== 'true');};
window.addEventListener('beforeunload', e => {if (busy) {e.preventDefault(); e.returnValue = '';}});
models();
