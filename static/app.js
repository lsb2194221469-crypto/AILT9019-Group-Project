const $ = id => document.getElementById(id);
const kinds = ['mcq', 'tf', 'short'];
const workspace = {version: 1, documents: [], quizzes: [], activeDocumentId: null, activeQuizId: null, view: 'create'};
let documentData = null, quiz = null, activeEntry = null, busy = false, booting = true;
let saveQueue = Promise.resolve(), storageNotice = false, saving = false, pendingSnapshot = null;

function node(tag, text, cls) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (cls) el.className = cls;
  return el;
}
function message(text, error = false) {
  $('message').hidden = !text;
  $('message').textContent = text;
  $('message').className = error ? 'error' : '';
}
async function api(path, options) {
  const res = await fetch(path, options), data = await res.json();
  if (!res.ok) { const error = new Error(data.error || '请求失败，请重试。'); error.code = data.code; throw error; }
  return data;
}
function counts() { return Object.fromEntries(kinds.map(k => [k, Number($('count-' + k).value)])); }
function mathNode(tag, text, cls) { return LectureMath.text(node(tag, undefined, cls), text); }
function findDocument(id) { return workspace.documents.find(doc => doc.id === id); }
function entriesFor(doc) { return workspace.quizzes.filter(entry => entry.documentId === doc.id); }
function currentSettings() { return {counts: counts(), topic: $('topic').value}; }
function rememberSettings() { if (documentData) documentData.settings = currentSettings(); }

function persist() {
  // Exclude temporary server IDs and browser Blob URLs, as well as all API configuration.
  pendingSnapshot = {...workspace,
    documents: workspace.documents.map(({serverId, url, ...doc}) => ({...doc})),
    quizzes: workspace.quizzes.map(entry => ({...entry, answers: [...entry.answers], expandedSources: [...entry.expandedSources]}))};
  // Coalesce rapid keystrokes and source toggles while a transaction is pending.
  if (!saving) {
    saving = true;
    saveQueue = (async () => {
      while (pendingSnapshot) {
        const snapshot = pendingSnapshot; pendingSnapshot = null;
        try { await LectureLibrary.write(snapshot); }
        catch (_) {
          if (!storageNotice) message('无法保存到此浏览器。本页仍可使用，请导出测验备份。', true);
          storageNotice = true;
        }
      }
      saving = false;
    })();
  }
  return saveQueue;
}
function sync() {
  const locked = busy || booting, total = Object.values(counts()).reduce((a, b) => a + b, 0);
  $('generate-btn').disabled = locked || !documentData || !$('model').value || total < 1 || total > 24;
  for (const id of ['pdf-input', 'replace-btn', 'add-pdfs', 'source-document', 'sample-btn', 'refresh-models', 'model', 'topic', ...kinds.map(k => 'count-' + k)]) $(id).disabled = locked;
  document.querySelectorAll('.pdf-link,.quiz-entry,.document-create,#nav-create,#nav-quiz,#back-btn,#regenerate-btn').forEach(el => el.disabled = locked);
  $('generate-btn').setAttribute('aria-busy', String(busy));
}
async function models() {
  try {
    const data = await api('/api/models'), previous = $('model').value;
    $('model').replaceChildren();
    if (!data.models.length) {
      $('model').append(new Option('尚未配置 API', ''));
      $('model-status').textContent = data.notice || '请填写 config.json 后重新读取配置。';
    } else {
      data.models.forEach(m => $('model').append(new Option(m, m)));
      if (data.models.includes(previous)) $('model').value = previous;
      $('model-status').textContent = data.notice;
    }
  } catch (e) { message(e.message, true); }
  sync();
}

function renderLibrary() {
  const list = $('quiz-library'); list.replaceChildren();
  $('quiz-count').textContent = workspace.quizzes.length;
  if (!workspace.documents.length) list.append(node('p', '添加 PDF 后，测验会按讲义列在这里。', 'library-empty'));
  for (const doc of workspace.documents) {
    const entries = entriesFor(doc), group = node('section', undefined, 'pdf-group');
    group.dataset.documentId = doc.id;
    const link = node('button', undefined, 'pdf-link'); link.title = doc.name;
    link.classList.toggle('selected', workspace.activeDocumentId === doc.id);
    link.append(node('span', 'PDF', 'file-label'), node('span', doc.name, 'pdf-name'), node('small', entries.length + ' 套'));
    link.onclick = () => {
      if (busy || booting) return;
      if (entries.length) openQuiz(entries[entries.length - 1]);
      else createFor(doc);
    };
    group.append(link);
    const children = node('div', undefined, 'pdf-quizzes');
    for (const entry of entries) {
      const button = node('button', undefined, 'quiz-entry');
      button.dataset.quizId = entry.id;
      if (workspace.view === 'quiz' && workspace.activeQuizId === entry.id) button.setAttribute('aria-current', 'page');
      const done = entry.answers.filter(value => value.trim()).length;
      button.append(node('span', entry.title), node('small', `${entry.quiz.questions.length} 题 · ${entry.submitted ? '已完成' : done ? `已答 ${done} 题` : '未作答'}`));
      button.onclick = () => { if (!busy && !booting) openQuiz(entry); };
      children.append(button);
    }
    if (!entries.length) children.append(node('p', '还没有测验', 'library-empty'));
    const more = node('button', '＋ 生成新测验', 'document-create');
    more.onclick = () => { if (!busy && !booting) createFor(doc); };
    children.append(more); group.append(children); list.append(group);
  }
  const sample = workspace.quizzes.find(entry => entry.quiz.sample);
  if (sample) {
    const link = node('button', '示例：机器学习基础', 'quiz-entry sample-entry');
    if (workspace.view === 'quiz' && workspace.activeQuizId === sample.id) link.setAttribute('aria-current', 'page');
    link.onclick = () => { if (!busy && !booting) openQuiz(sample); }; list.append(link);
  }
  sync();
}
function showPage() {
  $('source-preview').textContent = documentData?.pages.find(p => String(p.page) === $('page-select').value)?.text || '';
}
function selectDocument(doc) {
  documentData = doc; workspace.activeDocumentId = doc.id;
  if (!doc.url) doc.url = URL.createObjectURL(doc.file);
  $('open-pdf').href = doc.url;
  $('source-picker').hidden = false; $('dropzone').hidden = true; $('document-info').hidden = false;
  $('source-document').replaceChildren(...workspace.documents.map(d => new Option(d.name, d.id)));
  $('source-document').value = doc.id;
  $('filename').textContent = doc.name; $('page-count').textContent = `${doc.pages.length} 页包含可读文字`;
  $('page-select').replaceChildren(...doc.pages.map(p => new Option(`第 ${p.page} 页`, p.page))); showPage();
  for (const kind of kinds) $('count-' + kind).value = doc.settings.counts[kind];
  $('topic').value = doc.settings.topic;
  $('step-two').classList.add('current'); updateCounts(); sync();
}
function view(which) {
  workspace.view = which;
  $('create-view').hidden = which !== 'create'; $('quiz-view').hidden = which !== 'quiz';
  $('nav-create').classList.toggle('active', which === 'create'); $('nav-quiz').classList.toggle('active', which === 'quiz');
  $('breadcrumb').textContent = which === 'quiz' ? '我的测验' : '创建练习';
  $('step-three').classList.toggle('current', which === 'quiz');
  renderLibrary();
}
function createFor(doc, settings) {
  if (doc) selectDocument(doc);
  if (settings) {
    for (const kind of kinds) $('count-' + kind).value = settings.counts[kind];
    $('topic').value = settings.topic; rememberSettings(); updateCounts();
  }
  view('create'); persist(); message('设置题目数量后生成新测验，已有测验会保留在对应 PDF 下。');
}
async function readSource(doc) {
  const data = await api('/api/upload', {method: 'POST', headers: {'Content-Type': 'application/pdf'}, body: doc.file});
  doc.serverId = data.id; doc.pages = data.pages;
}
async function uploadFiles(files) {
  if (!files.length || busy || booting) return;
  busy = true; sync(); const failures = []; let first = null;
  try {
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf') || file.size > 15 * 1024 * 1024) { failures.push(`${file.name}：请选择不超过 15 MB 的 PDF。`); continue; }
      message(`正在读取 ${file.name}…`);
      try {
        const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
        const fingerprint = file.name + ':' + Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
        let doc = workspace.documents.find(d => d.fingerprint === fingerprint);
        if (!doc) {
          doc = {id: crypto.randomUUID(), fingerprint, name: file.name, file, pages: [], createdAt: new Date().toISOString(), settings: {counts: counts(), topic: ''}};
          await readSource(doc); workspace.documents.push(doc);
        }
        first ||= doc;
      } catch (e) { failures.push(`${file.name}：${e.message}`); }
    }
    if (first) { selectDocument(first); view('create'); await persist(); }
    message(failures.length ? failures.join('\n') : storageNotice ? '讲义已加入本页，但浏览器保存不可用，请导出测验备份。' : '讲义已加入左侧列表。可以多次出题，每次生成都会单独保留。', Boolean(failures.length) || storageNotice);
  } finally { busy = false; $('pdf-input').value = ''; renderLibrary(); sync(); }
}

function responses() {
  return quiz.questions.map((q, i) => q.type === 'short' ? $(`response-${i}`).value : document.querySelector(`input[name="q${i}"]:checked`)?.value || '');
}
function progress() {
  const done = responses().filter(value => value.trim()).length;
  $('answer-progress').textContent = `已完成 ${done} / ${quiz.questions.length} 题`;
  $('progress').max = quiz.questions.length; $('progress').value = done;
}
function applyFilter() {
  $('wrong-btn').setAttribute('aria-pressed', String(activeEntry.wrongOnly));
  $('wrong-btn').textContent = activeEntry.wrongOnly ? '显示全部题目' : '只看错题';
  [...$('questions').children].forEach(card => card.hidden = activeEntry.wrongOnly && card.dataset.wrong !== 'true');
}
function renderReview() {
  const entry = activeEntry, values = entry.answers; let correct = 0, objective = 0;
  quiz.questions.forEach((q, i) => {
    const answer = $(`answer-${i}`); answer.hidden = false; answer.replaceChildren();
    if (q.type !== 'short') { objective++; if (values[i] === q.answer) correct++; }
    answer.parentElement.dataset.wrong = String(q.type !== 'short' && values[i] !== q.answer);
    answer.append(node('strong', q.type === 'short' ? '简答题 · 对照原文自行评估' : values[i] === q.answer ? '✓ 回答正确' : '↗ 再看一眼这个知识点'), mathNode('p', `参考答案：${q.answer}`), mathNode('p', q.explanation));
    const details = node('details'); details.open = entry.expandedSources.includes(i);
    details.append(node('summary', `查看原文依据 · 第 ${q.page} 页`), node('blockquote', q.quote, 'raw-source'), node('p', '请对照原文检查答案。引用匹配不能保证题目和答案完全正确。', 'hint'));
    details.addEventListener('toggle', () => {
      entry.expandedSources = entry.expandedSources.filter(index => index !== i);
      if (details.open) entry.expandedSources.push(i);
      persist();
    });
    answer.append(details);
  });
  $('questions').querySelectorAll('input,textarea').forEach(el => el.disabled = true);
  $('results').hidden = false;
  $('results').replaceChildren(node('span', 'SESSION COMPLETE', 'eyebrow'), node('h2', objective ? `${correct} / ${objective} 道客观题答对` : '完成一次主动回忆'), node('p', `${quiz.questions.length - objective} 道简答题请对照参考答案自评。可以展开每道题的原文出处。`));
  $('submit-btn').hidden = true; $('review-actions').hidden = false; $('wrong-btn').disabled = correct === objective; applyFilter();
}
function renderQuiz() {
  $('questions').replaceChildren(); $('results').hidden = true; $('submit-btn').hidden = false; $('review-actions').hidden = true;
  $('wrong-btn').setAttribute('aria-pressed', 'false'); $('wrong-btn').textContent = '只看错题';
  const doc = findDocument(activeEntry.documentId);
  $('quiz-title').textContent = quiz.sample ? '示例：机器学习基础' : `${doc.name} · ${activeEntry.title}`;
  $('quiz-label').textContent = quiz.sample ? 'PRE-GENERATED SAMPLE · 非实时生成' : 'GENERATED FROM YOUR LECTURE';
  $('regenerate-btn').hidden = !doc; $('quiz-notice').textContent = quiz.notice;
  quiz.questions.forEach((q, i) => {
    const card = node('article', undefined, 'card question');
    card.append(node('span', `QUESTION ${String(i + 1).padStart(2, '0')} / ${q.type === 'mcq' ? '选择题' : q.type === 'tf' ? '判断题' : '简答题'}`, 'q-number'), mathNode('h3', q.question));
    if (q.type === 'short') {
      const input = node('textarea'); input.id = `response-${i}`; input.value = activeEntry.answers[i] || '';
      input.placeholder = '用自己的话解释…（提交后对照参考答案自评）'; input.setAttribute('aria-label', `第 ${i + 1} 题答案`); card.append(input);
    } else q.options.forEach((option, j) => {
      const label = node('label', undefined, 'option'), input = node('input');
      input.type = 'radio'; input.name = `q${i}`; input.value = option; input.checked = activeEntry.answers[i] === option;
      label.append(input, mathNode('span', `${String.fromCharCode(65 + j)}. ${option}`)); card.append(label);
    });
    const answer = node('div', undefined, 'answer'); answer.id = `answer-${i}`; answer.hidden = true; card.append(answer); $('questions').append(card);
  });
  $('questions').querySelectorAll('input,textarea').forEach(el => el.addEventListener('input', () => {
    activeEntry.answers = responses(); progress(); renderLibrary(); persist();
  }));
  if (activeEntry.submitted) renderReview();
  progress(); view('quiz');
}
function openQuiz(entry) {
  activeEntry = entry; quiz = entry.quiz; workspace.activeQuizId = entry.id;
  const doc = findDocument(entry.documentId); if (doc) selectDocument(doc);
  renderQuiz(); persist(); message('');
}
function addQuiz(data, doc, settings) {
  const number = doc ? entriesFor(doc).length + 1 : 1;
  const entry = {id: crypto.randomUUID(), documentId: doc?.id || null, title: `练习 ${number}`, createdAt: new Date().toISOString(), quiz: data, settings,
    answers: data.questions.map(() => ''), submitted: false, wrongOnly: false, expandedSources: []};
  workspace.quizzes.push(entry); openQuiz(entry);
}

$('generate-btn').onclick = async () => {
  if (busy || booting || !documentData || $('generate-btn').disabled) return;
  const doc = documentData, settings = currentSettings(), model = $('model').value;
  rememberSettings(); busy = true; sync(); $('generate-btn').textContent = '正在生成，请稍候…';
  message('正在为当前 PDF 生成新测验。已有测验和作答记录会保留，请保持页面打开。');
  try {
    if (!doc.serverId) await readSource(doc);
    const request = () => api('/api/generate', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({document_id: doc.serverId, model, ...settings})});
    let generated;
    try { generated = await request(); }
    catch (e) {
      if (e.code !== 'document_expired') throw e;
      await readSource(doc); generated = await request();
    }
    addQuiz(generated, doc, settings); await persist();
    message(storageNotice ? '新测验已生成，但浏览器保存不可用，请导出备份。' : '新测验已保存到这份 PDF 下，可以继续生成或切换已有测验。', storageNotice);
  } catch (e) { message(e.message, true); }
  finally { busy = false; $('generate-btn').replaceChildren(document.createTextNode('生成我的练习'), node('span', '→')); sync(); }
};
$('sample-btn').onclick = async () => {
  if (busy || booting) return;
  busy = true; sync();
  try {
    const existing = workspace.quizzes.find(entry => entry.quiz.sample);
    if (existing) openQuiz(existing); else addQuiz(await api('/api/sample'), null, null);
    message('这是预先编写的示例，不使用上传的 PDF，也不代表 API 连接已验证。');
  } catch (e) { message(e.message, true); }
  finally { busy = false; sync(); }
};
$('submit-btn').onclick = () => {
  if (!quiz || activeEntry.submitted) return;
  const values = responses();
  if (values.some(r => !r.trim())) {
    message('还有题目未作答，请完成全部题目后查看解析。', true);
    $('questions').children[values.findIndex(r => !r.trim())].querySelector('input,textarea').focus(); return;
  }
  activeEntry.answers = values; activeEntry.submitted = true;
  renderReview(); renderLibrary(); persist(); message('解析已展开。练习结果仅供自学参考。');
  $('results').scrollIntoView({behavior: 'smooth', block: 'nearest'});
};
$('export-btn').onclick = () => {
  if (!quiz) return;
  const doc = findDocument(activeEntry.documentId);
  const data = {...quiz, source_name: doc?.name || null, generated_at: activeEntry.createdAt};
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
  const a = node('a'); a.href = url; a.download = quiz.sample ? 'sample-quiz.json' : `${doc.name.replace(/\.pdf$/i, '')}-${activeEntry.title}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('pdf-input').onchange = e => uploadFiles([...e.target.files]);
$('replace-btn').onclick = $('add-pdfs').onclick = () => $('pdf-input').click();
$('source-document').onchange = () => { if (!busy) createFor(findDocument($('source-document').value)); };
$('page-select').onchange = showPage; $('refresh-models').onclick = models; $('model').onchange = sync;
function updateCounts() {
  const values = counts(), total = Object.values(values).reduce((a, b) => a + b, 0);
  for (const [kind, count] of Object.entries(values)) $('count-' + kind + '-label').textContent = `${count} 题`;
  $('total-count').textContent = `共 ${total} 题`;
  $('count-status').textContent = total === 0 ? '至少选择 1 道题。' : total > 24 ? '总数超过 24 题，请减少数量。' : '一次生成三种题型；每种可设为 0，总数最多 24 题。';
  $('count-status').classList.toggle('count-error', total === 0 || total > 24); sync();
}
for (const kind of kinds) $('count-' + kind).oninput = () => { updateCounts(); rememberSettings(); persist(); };
$('topic').oninput = () => { rememberSettings(); persist(); };
['dragenter', 'dragover'].forEach(event => $('dropzone').addEventListener(event, e => { e.preventDefault(); $('dropzone').classList.add('drag'); }));
['dragleave', 'drop'].forEach(event => $('dropzone').addEventListener(event, e => { e.preventDefault(); $('dropzone').classList.remove('drag'); if (event === 'drop') uploadFiles([...e.dataTransfer.files]); }));
$('back-btn').onclick = $('nav-create').onclick = () => { if (!busy && !booting) createFor(documentData); };
$('regenerate-btn').onclick = () => { if (!busy && activeEntry) createFor(findDocument(activeEntry.documentId), activeEntry.settings); };
$('nav-quiz').onclick = () => {
  if (busy || booting) return;
  const entry = workspace.quizzes.find(item => item.id === workspace.activeQuizId) || workspace.quizzes[workspace.quizzes.length - 1];
  if (entry) openQuiz(entry); else message('从 PDF 分栏选择讲义并生成测验，或点击“体验示例测验”。');
};
$('retry-btn').onclick = () => {
  activeEntry.answers = quiz.questions.map(() => ''); activeEntry.submitted = false; activeEntry.wrongOnly = false; activeEntry.expandedSources = [];
  renderQuiz(); persist(); message('已开始重新练习。其他测验的作答记录会保留。'); $('quiz-view').scrollIntoView({behavior: 'smooth'});
};
$('wrong-btn').onclick = () => { activeEntry.wrongOnly = !activeEntry.wrongOnly; applyFilter(); persist(); };
window.addEventListener('beforeunload', e => { if (busy) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('pagehide', () => { if (!booting) persist(); });

async function initialize() {
  updateCounts(); sync();
  try {
    const saved = await LectureLibrary.read();
    if (saved?.version === 1 && Array.isArray(saved.documents) && Array.isArray(saved.quizzes)) {
      Object.assign(workspace, saved);
      workspace.documents = saved.documents.filter(doc => doc.file instanceof Blob && Array.isArray(doc.pages));
      workspace.quizzes = saved.quizzes.filter(entry => Array.isArray(entry.quiz?.questions) && (entry.quiz.sample || findDocument(entry.documentId)));
      const doc = findDocument(workspace.activeDocumentId) || workspace.documents[0]; if (doc) selectDocument(doc);
      const entry = workspace.quizzes.find(item => item.id === workspace.activeQuizId);
      if (entry && workspace.view === 'quiz') { activeEntry = entry; quiz = entry.quiz; renderQuiz(); } else view('create');
    } else renderLibrary();
  } catch (_) { storageNotice = true; message('无法读取此浏览器的测验记录。本页仍可使用，请导出测验备份。', true); renderLibrary(); }
  booting = false; sync(); await models();
}
initialize();
