const $ = id => document.getElementById(id);
const kinds = ['mcq', 'tf', 'short'];
const workspace = {version: 2, documents: [], groups: [], quizzes: [], activeGroupId: null, activeDocumentId: null, activeQuizId: null, view: 'create'};
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
function findGroup(id) { return workspace.groups.find(group => group.id === id); }
function groupDocs(group) { return group ? group.documentIds.map(findDocument).filter(Boolean) : []; }
function groupName(group) { return groupDocs(group).map(doc => doc.name).join(' + '); }
function entriesFor(group) { return workspace.quizzes.filter(entry => entry.groupId === group.id); }
function currentSettings() { return {counts: counts(), topic: $('topic').value}; }
function rememberSettings() { const group = findGroup(workspace.activeGroupId); if (group) group.settings = currentSettings(); }

function persist() {
  // Exclude temporary server IDs and browser Blob URLs, as well as all API configuration.
  pendingSnapshot = {...workspace,
    groups: workspace.groups.map(group => ({...group, documentIds: [...group.documentIds]})),
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
  for (const id of ['pdf-input', 'replace-btn', 'source-group', 'source-document', 'sample-btn', 'refresh-models', 'model', 'topic', ...kinds.map(k => 'count-' + k)]) $(id).disabled = locked;
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
  for (const sourceGroup of workspace.groups) {
    const entries = entriesFor(sourceGroup);
    if (!entries.length) continue;
    const group = node('section', undefined, 'pdf-group');
    group.dataset.groupId = sourceGroup.id;
    const link = node('button', undefined, 'pdf-link'); link.title = groupName(sourceGroup);
    link.classList.toggle('selected', workspace.activeGroupId === sourceGroup.id);
    link.append(node('span', 'PDF', 'file-label'), node('span', `${groupDocs(sourceGroup).length} 份讲义 · ${entries.length} 套测验`, 'pdf-name'));
    link.onclick = () => { if (!busy && !booting) openQuiz(entries[entries.length - 1]); };
    group.append(link);
    const files = node('ul', undefined, 'group-files');
    for (const doc of groupDocs(sourceGroup)) files.append(node('li', doc.name));
    group.append(files);
    const children = node('div', undefined, 'pdf-quizzes');
    for (const entry of entries) {
      const button = node('button', undefined, 'quiz-entry'); button.dataset.quizId = entry.id;
      if (workspace.view === 'quiz' && workspace.activeQuizId === entry.id) button.setAttribute('aria-current', 'page');
      const done = entry.answers.filter(value => value.trim()).length;
      button.append(node('span', entry.title), node('small', `${entry.quiz.questions.length} 题 · ${entry.submitted ? '已完成' : done ? `已答 ${done} 题` : '未作答'}`));
      button.onclick = () => { if (!busy && !booting) openQuiz(entry); };
      children.append(button);
    }
    group.append(children); list.append(group);
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
  $('open-pdf').href = doc.url; $('source-document').value = doc.id;
  $('page-select').replaceChildren(...doc.pages.map(p => new Option(`第 ${p.page} 页`, p.page))); showPage();
}
function selectGroup(group) {
  workspace.activeGroupId = group.id;
  const docs = groupDocs(group);
  $('source-picker').hidden = false; $('dropzone').hidden = true; $('document-info').hidden = false;
  $('source-group').replaceChildren(...workspace.groups.map(g => new Option(groupName(g), g.id)));
  $('source-group').value = group.id;
  $('source-document').replaceChildren(...docs.map(doc => new Option(doc.name, doc.id)));
  $('source-files').replaceChildren(...docs.map(doc => node('li', doc.name)));
  $('filename').textContent = `${docs.length} 份讲义 · 联合出题`;
  $('page-count').textContent = `共 ${docs.reduce((sum, doc) => sum + doc.pages.length, 0)} 页包含可读文字`;
  selectDocument(docs.find(doc => doc.id === workspace.activeDocumentId) || docs[0]);
  for (const kind of kinds) $('count-' + kind).value = group.settings.counts[kind];
  $('topic').value = group.settings.topic;
  $('step-two').classList.add('current'); updateCounts(); sync();
}
function startNewGroup() {
  workspace.activeGroupId = null; workspace.activeDocumentId = null; documentData = null;
  $('source-picker').hidden = true; $('document-info').hidden = true; $('dropzone').hidden = false;
  $('step-two').classList.remove('current'); view('create'); persist(); message('');
}
function view(which) {
  workspace.view = which;
  $('create-view').hidden = which !== 'create'; $('quiz-view').hidden = which !== 'quiz';
  $('nav-create').classList.toggle('active', which === 'create'); $('nav-quiz').classList.toggle('active', which === 'quiz');
  $('breadcrumb').textContent = which === 'quiz' ? '我的测验' : '创建练习';
  $('step-three').classList.toggle('current', which === 'quiz');
  renderLibrary();
}
function createFor(group, settings) {
  if (!group) { startNewGroup(); return; }
  selectGroup(group);
  if (settings) {
    for (const kind of kinds) $('count-' + kind).value = settings.counts[kind];
    $('topic').value = settings.topic; rememberSettings(); updateCounts();
  }
  view('create'); persist(); message('设置题目数量后生成新测验，已有测验会保留在这组讲义下。');
}
async function readSource(doc) {
  const data = await api('/api/upload', {method: 'POST', headers: {'Content-Type': 'application/pdf'}, body: doc.file});
  doc.serverId = data.id; doc.pages = data.pages;
}
async function uploadFiles(files) {
  if (!files.length || busy || booting) return;
  if (files.length > 10) { message('每次最多选择 10 份 PDF，请重新选择。', true); $('pdf-input').value = ''; return; }
  busy = true; sync(); const failures = []; const documentIds = [];
  try {
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf') || file.size > 15 * 1024 * 1024) { failures.push(`${file.name}：请选择不超过 15 MB 的 PDF。`); continue; }
      message(`正在读取 ${file.name}…`);
      try {
        const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
        const fingerprint = file.name + ':' + Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
        let doc = workspace.documents.find(d => d.fingerprint === fingerprint);
        if (!doc) {
          doc = {id: crypto.randomUUID(), fingerprint, name: file.name, file, pages: [], createdAt: new Date().toISOString()};
          await readSource(doc); workspace.documents.push(doc);
        }
        if (!documentIds.includes(doc.id)) documentIds.push(doc.id);
      } catch (e) { failures.push(`${file.name}：${e.message}`); }
    }
    if (documentIds.length) {
      const group = {id: crypto.randomUUID(), documentIds, createdAt: new Date().toISOString(), settings: currentSettings()};
      workspace.groups.push(group); selectGroup(group); view('create'); await persist();
    }
    message(failures.length ? failures.join('\n') : storageNotice ? '讲义已加入本页，但浏览器保存不可用，请导出测验备份。' : '本次选择的 PDF 已合为一组。生成后会列在“我的测验”下，组内全部文件共同参与出题。', Boolean(failures.length) || storageNotice);
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
    details.append(node('summary', `查看原文依据 · ${q.source_name || groupDocs(findGroup(entry.groupId))[0]?.name || '示例'} · 第 ${q.page} 页`), node('blockquote', q.quote, 'raw-source'), node('p', '请对照原文检查答案。引用匹配不能保证题目和答案完全正确。', 'hint'));
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
  const group = findGroup(activeEntry.groupId);
  $('quiz-title').textContent = quiz.sample ? '示例：机器学习基础' : `${groupName(group)} · ${activeEntry.title}`;
  $('quiz-label').textContent = quiz.sample ? 'PRE-GENERATED SAMPLE · 非实时生成' : 'GENERATED FROM YOUR LECTURE';
  $('quiz-sources').replaceChildren(...groupDocs(group).map(doc => {
    if (!doc.url) doc.url = URL.createObjectURL(doc.file);
    const link = node('a', doc.name); link.href = doc.url; link.target = '_blank'; link.rel = 'noopener'; return link;
  }));
  $('regenerate-btn').hidden = !group; $('quiz-notice').textContent = quiz.notice;
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
  const group = findGroup(entry.groupId); if (group) selectGroup(group); else workspace.activeGroupId = null;
  renderQuiz(); persist(); message('');
}
function addQuiz(data, group, settings) {
  const number = group ? entriesFor(group).length + 1 : 1;
  const entry = {id: crypto.randomUUID(), groupId: group?.id || null, title: `练习 ${number}`, createdAt: new Date().toISOString(), quiz: data, settings,
    answers: data.questions.map(() => ''), submitted: false, wrongOnly: false, expandedSources: []};
  workspace.quizzes.push(entry); openQuiz(entry);
}

$('generate-btn').onclick = async () => {
  if (busy || booting || !documentData || $('generate-btn').disabled) return;
  const group = findGroup(workspace.activeGroupId), docs = groupDocs(group), settings = currentSettings(), model = $('model').value;
  rememberSettings(); busy = true; sync(); $('generate-btn').textContent = '正在生成，请稍候…';
  message('正在根据本组全部 PDF 生成新测验。已有测验和作答记录会保留，请保持页面打开。');
  try {
    for (const doc of docs) if (!doc.serverId) await readSource(doc);
    const request = () => api('/api/generate', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({document_ids: docs.map(doc => doc.serverId), document_names: docs.map(doc => doc.name), model, ...settings})});
    let generated;
    try { generated = await request(); }
    catch (e) {
      if (e.code !== 'document_expired') throw e;
      for (const doc of docs) await readSource(doc);
      generated = await request();
    }
    for (const question of generated.questions) {
      question.source_document_id = docs.find(doc => doc.serverId === question.source_id)?.id || docs[0].id;
      delete question.source_id;
    }
    addQuiz(generated, group, settings); await persist();
    message(storageNotice ? '新测验已生成，但浏览器保存不可用，请导出备份。' : '新测验已保存到这组讲义下，可以继续生成或切换已有测验。', storageNotice);
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
  const group = findGroup(activeEntry.groupId);
  const data = {...quiz, source_names: groupDocs(group).map(doc => doc.name), source_name: groupDocs(group).length === 1 ? groupDocs(group)[0].name : null, generated_at: activeEntry.createdAt};
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
  const a = node('a'); a.href = url; a.download = quiz.sample ? 'sample-quiz.json' : `lecture-quiz-${activeEntry.title}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('pdf-input').onchange = e => uploadFiles([...e.target.files]);
$('replace-btn').onclick = () => $('pdf-input').click();
$('source-group').onchange = () => { if (!busy) createFor(findGroup($('source-group').value)); };
$('source-document').onchange = () => { if (!busy) selectDocument(findDocument($('source-document').value)); };
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
$('back-btn').onclick = () => { if (!busy && !booting) createFor(findGroup(workspace.activeGroupId)); };
$('nav-create').onclick = () => { if (!busy && !booting) startNewGroup(); };
$('regenerate-btn').onclick = () => { if (!busy && activeEntry) createFor(findGroup(activeEntry.groupId), activeEntry.settings); };
$('nav-quiz').onclick = () => {
  if (busy || booting) return;
  const entry = workspace.quizzes.find(item => item.id === workspace.activeQuizId) || workspace.quizzes[workspace.quizzes.length - 1];
  if (entry) openQuiz(entry); else message('请先创建练习并上传 PDF，或点击“体验示例测验”。');
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
    if ([1, 2].includes(saved?.version) && Array.isArray(saved.documents) && Array.isArray(saved.quizzes)) {
      if (saved.version === 1) {
        // Old records never stored upload batches; keep their existing grouping and answers.
        saved.groups = saved.documents.map(doc => ({id: crypto.randomUUID(), documentIds: [doc.id], createdAt: doc.createdAt, settings: doc.settings || {counts: counts(), topic: ''}}));
        for (const entry of saved.quizzes) entry.groupId = saved.groups.find(group => group.documentIds.includes(entry.documentId))?.id || null;
        saved.activeGroupId = saved.groups.find(group => group.documentIds.includes(saved.activeDocumentId))?.id || null;
        saved.version = 2;
      }
      Object.assign(workspace, saved);
      workspace.documents = saved.documents.filter(doc => doc.file instanceof Blob && Array.isArray(doc.pages));
      workspace.groups = saved.groups.filter(group => group.documentIds.length && group.documentIds.every(findDocument));
      workspace.quizzes = saved.quizzes.filter(entry => Array.isArray(entry.quiz?.questions) && (entry.quiz.sample || findGroup(entry.groupId)));
      const group = findGroup(workspace.activeGroupId); if (group) selectGroup(group);
      const entry = workspace.quizzes.find(item => item.id === workspace.activeQuizId);
      if (entry && workspace.view === 'quiz') { activeEntry = entry; quiz = entry.quiz; renderQuiz(); } else view('create');
      persist();
    } else renderLibrary();
  } catch (_) { storageNotice = true; message('无法读取此浏览器的测验记录。本页仍可使用，请导出测验备份。', true); renderLibrary(); }
  booting = false; sync(); await models();
}
initialize();
