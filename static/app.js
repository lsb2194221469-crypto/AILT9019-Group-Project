const $ = id => document.getElementById(id);
const kinds = ['mcq', 'tf', 'short'];
const workspace = {version: 2, documents: [], groups: [], quizzes: [], tasks: [], deletedQuizIds: [], activeGroupId: null, activeDocumentId: null, activeQuizId: null, view: 'create'};
let documentData = null, quiz = null, activeEntry = null, busy = false, booting = true;
let saveQueue = Promise.resolve(), storageNotice = false, saving = false, pendingSnapshot = null;
let deleteTargetId = null;
let currentTask = null, wakeTask = null;

function node(tag, text, cls) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (cls) el.className = cls;
  return el;
}
function trashIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7');
  svg.append(path); return svg;
}
function message(text, error = false) {
  $('message').hidden = !text;
  $('message').textContent = text;
  $('message').className = error ? 'error' : '';
}
async function api(path, options) {
  const res = await fetch(path, options), data = await res.json();
  if (!res.ok) { const error = new Error(data.error || '请求失败，请重试。'); error.code = data.code; error.status = res.status; throw error; }
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
  pendingSnapshot = structuredClone({...workspace,
    groups: workspace.groups.map(group => ({...group, documentIds: [...group.documentIds]})),
    documents: workspace.documents.map(({serverId, url, ...doc}) => ({...doc})),
    quizzes: workspace.quizzes.map(entry => ({...entry, answers: [...entry.answers], expandedSources: [...entry.expandedSources]}))});
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
  for (const id of ['pdf-input', 'replace-btn', 'clear-pdfs-btn', 'source-group', 'source-document', 'sample-btn', 'refresh-models', 'model', 'topic', ...kinds.map(k => 'count-' + k)]) $(id).disabled = locked;
  document.querySelectorAll('.pdf-link,.quiz-entry,.quiz-delete,.document-create,#nav-create,#nav-quiz,#back-btn,#regenerate-btn,#delete-quiz-btn').forEach(el => el.disabled = locked);
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
      const row = node('div', undefined, 'quiz-row');
      const remove = node('button', undefined, 'quiz-delete');
      remove.title = `删除 ${entry.title}`;
      remove.setAttribute('aria-label', `删除 ${entry.title}（${groupName(sourceGroup)}）`);
      remove.append(trashIcon()); remove.onclick = () => requestDeleteQuiz(entry);
      row.append(button, remove); children.append(row);
    }
    group.append(children); list.append(group);
  }
  const sample = workspace.quizzes.find(entry => entry.quiz.sample);
  if (sample) {
    const link = node('button', '示例：机器学习基础', 'quiz-entry sample-entry');
    if (workspace.view === 'quiz' && workspace.activeQuizId === sample.id) link.setAttribute('aria-current', 'page');
    link.onclick = () => { if (!busy && !booting) openQuiz(sample); };
    const row = node('div', undefined, 'quiz-row sample-entry'); link.classList.remove('sample-entry');
    const remove = node('button', undefined, 'quiz-delete'); remove.title = '删除示例测验';
    remove.setAttribute('aria-label', '删除示例测验'); remove.append(trashIcon());
    remove.onclick = () => requestDeleteQuiz(sample); row.append(link, remove); list.append(row);
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
  if (files.length > 10) { message('每组最多 10 份 PDF，请减少选择数量。', true); $('pdf-input').value = ''; return; }
  const currentGroup = findGroup(workspace.activeGroupId), previousIds = currentGroup ? [...currentGroup.documentIds] : [];
  const settings = currentSettings();
  busy = true; sync(); const failures = [], candidates = [], addedIds = [];
  try {
    // Count unique files before uploading, so exceeding the group limit keeps the selection intact.
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf') || file.size > 15 * 1024 * 1024) { failures.push(`${file.name}：请选择不超过 15 MB 的 PDF。`); continue; }
      try {
        const fingerprint = await LecturePlatform.fingerprint(file);
        const existing = workspace.documents.find(doc => doc.fingerprint === fingerprint);
        if ((existing && previousIds.includes(existing.id)) || candidates.some(doc => doc.fingerprint === fingerprint)) continue;
        candidates.push(existing || {id: LecturePlatform.id(), fingerprint, name: file.name, file, pages: [], createdAt: new Date().toISOString()});
      } catch (e) { failures.push(`${file.name}：${e.message}`); }
    }
    if (previousIds.length + candidates.length > 10) {
      message(`当前已选 ${previousIds.length} 份，再选这些文件会超过每组 10 份的上限。已选文件已保留，请减少本次选择。`, true); return;
    }
    for (const doc of candidates) {
      message(`正在读取 ${doc.name}…`);
      try {
        if (!findDocument(doc.id)) { await readSource(doc); workspace.documents.push(doc); }
        addedIds.push(doc.id);
      } catch (e) { failures.push(`${doc.name}：${e.message}`); }
    }
    let notice = '这些 PDF 已在当前选择中，没有重复添加。';
    if (addedIds.length) {
      const hasHistory = currentGroup && entriesFor(currentGroup).length > 0;
      // Keep the sources of completed quizzes unchanged when extending a historical group.
      const group = currentGroup && !hasHistory ? currentGroup : {id: LecturePlatform.id(), createdAt: new Date().toISOString()};
      group.documentIds = [...previousIds, ...addedIds]; group.settings = settings;
      if (group !== currentGroup) workspace.groups.push(group);
      selectGroup(group); view('create'); await persist();
      notice = hasHistory ? '原讲义与补选 PDF 已组成新组，原有测验和作答保留。还可以继续选择文件。' : `当前已选 ${group.documentIds.length} 份 PDF，可继续选择；生成时使用本组全部文件。`;
    }
    message(failures.length ? failures.join('\n') : storageNotice ? '讲义已加入本页，但浏览器保存不可用，请导出测验备份。' : notice, Boolean(failures.length) || storageNotice);
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
function addQuiz(data, group, settings, id = LecturePlatform.id()) {
  // Keep the sequence increasing after deletion and make each generation an
  // independent snapshot, including its questions and generation settings.
  const number = group ? Math.max(group.lastQuizNumber || 0, ...entriesFor(group).map(entry => Number(entry.title.match(/\d+$/)?.[0]) || 0)) + 1 : 1;
  if (group) group.lastQuizNumber = number;
  const entry = {id, groupId: group?.id || null, title: `练习 ${number}`, createdAt: new Date().toISOString(), quiz: structuredClone(data), settings: settings ? structuredClone(settings) : null,
    answers: data.questions.map(() => ''), submitted: false, wrongOnly: false, expandedSources: []};
  workspace.quizzes.push(entry); openQuiz(entry);
}

function requestDeleteQuiz(entry) {
  if (busy || booting) return;
  deleteTargetId = entry.id;
  $('delete-description').textContent = `将删除“${entry.quiz.sample ? '示例测验' : entry.title}”的 ${entry.quiz.questions.length} 道题及其作答记录。其他测验和 PDF 会保留。`;
  $('delete-source').textContent = groupName(findGroup(entry.groupId));
  $('delete-dialog').showModal(); $('delete-cancel').focus();
}
async function deleteQuiz(id) {
  const index = workspace.quizzes.findIndex(entry => entry.id === id);
  if (index < 0) return;
  const removed = workspace.quizzes[index];
  workspace.deletedQuizIds = [...new Set([...workspace.deletedQuizIds, id])];
  workspace.quizzes.splice(index, 1);
  if (activeEntry?.id === id || workspace.activeQuizId === id) {
    const siblings = workspace.quizzes.filter(entry => entry.groupId === removed.groupId);
    const next = siblings[siblings.length - 1] || workspace.quizzes[Math.min(index, workspace.quizzes.length - 1)];
    activeEntry = null; quiz = null; workspace.activeQuizId = null;
    if (next) openQuiz(next);
    else {
      $('questions').replaceChildren(); $('quiz-sources').replaceChildren();
      createFor(findGroup(removed.groupId));
    }
  }
  renderLibrary(); await persist();
  message(storageNotice ? '本页已删除测验，但浏览器保存失败，刷新后可能恢复。' : '已删除所选测验，其他测验和 PDF 已保留。', storageNotice);
}

function taskDelay(ms) {
  return new Promise(resolve => {
    const finish = () => { clearTimeout(timer); if (wakeTask === finish) wakeTask = null; resolve(); };
    const timer = setTimeout(finish, ms); wakeTask = finish;
  });
}
async function completeTask(task, generated) {
  const docs = task.documentIds.map(findDocument).filter(Boolean), group = findGroup(task.groupId);
  if (!group || !docs.length) throw new Error('生成已完成，但本浏览器的原 PDF 记录缺失。');
  const stored = await LectureLibrary.findQuiz(task.id).catch(() => ({}));
  if (!stored.deleted && !workspace.deletedQuizIds.includes(task.id)) {
    const existing = workspace.quizzes.find(entry => entry.id === task.id) || stored.entry;
    if (existing) {
      if (!workspace.quizzes.some(entry => entry.id === existing.id)) workspace.quizzes.push(existing);
      openQuiz(existing);
    } else {
      for (const question of generated.questions) {
        const index = task.requestBody.document_ids.indexOf(question.source_id);
        question.source_document_id = docs[index >= 0 ? index : 0]?.id;
        delete question.source_id;
      }
      addQuiz(generated, group, task.settings, task.id);
    }
  } else if (!workspace.deletedQuizIds.includes(task.id)) workspace.deletedQuizIds.push(task.id);
  task.status = 'completed'; task.completedAt = new Date().toISOString(); await persist();
  message(storageNotice ? '新测验已生成，但浏览器保存不可用，请导出备份。' : '新测验已保存到这组讲义下，可以继续生成或切换已有测验。', storageNotice);
}
async function runTask(task) {
  currentTask = task; busy = true; sync(); $('generate-btn').textContent = '后台正在生成…';
  try {
    while (task.status === 'pending') {
      try {
        const status = task.submitted ? await api('/api/jobs/' + task.id) : await api('/api/jobs', {
          method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(task.requestBody)});
        if (!task.submitted) { task.submitted = true; await persist(); }
        if (status.status === 'succeeded') { await completeTask(task, status.result); break; }
        if (status.status === 'failed') throw Object.assign(new Error(status.error), {status: 400});
        message(status.status === 'queued' ? '后台任务已提交，正在排队。可以切换窗口，回来后自动显示结果。' : '后台正在生成题目。可以切换窗口或刷新页面，回来后会自动取回结果。');
        await taskDelay(1500);
      } catch (error) {
        if (error.code === 'document_expired' && !task.submitted) {
          const docs = task.documentIds.map(findDocument).filter(Boolean);
          for (const doc of docs) await readSource(doc);
          task.requestBody.document_ids = docs.map(doc => doc.serverId); await persist();
          continue;
        }
        if ([400, 403, 404, 409].includes(error.status)) throw error;
        // A lost response is ambiguous. Retry the same task ID, never a fresh
        // model request; the server deduplicates submissions before generation.
        message('连接暂时中断，正在尝试取回后台任务。恢复网络或切回此页面后会继续，不会重复提交出题。');
        await taskDelay(4000);
      }
    }
  } catch (error) {
    task.status = 'failed'; task.error = error.message; await persist(); message(error.message, true);
  } finally {
    currentTask = null; busy = false;
    $('generate-btn').replaceChildren(document.createTextNode('生成我的练习'), node('span', '→')); sync();
  }
}
$('generate-btn').onclick = async () => {
  if (busy || booting || !documentData || $('generate-btn').disabled) return;
  const group = findGroup(workspace.activeGroupId), docs = groupDocs(group), settings = currentSettings(), model = $('model').value;
  rememberSettings(); busy = true; sync(); $('generate-btn').textContent = '正在准备讲义…';
  message('正在准备后台出题任务…');
  try {
    for (const doc of docs) if (!doc.serverId) await readSource(doc);
    const id = LecturePlatform.id();
    const task = {id, groupId: group.id, documentIds: docs.map(doc => doc.id), settings: structuredClone(settings),
      status: 'pending', submitted: false, createdAt: new Date().toISOString(),
      requestBody: {job_id: id, document_ids: docs.map(doc => doc.serverId), document_names: docs.map(doc => doc.name), model, ...settings}};
    workspace.tasks.push(task); await persist(); await runTask(task);
  } catch (error) { busy = false; sync(); $('generate-btn').textContent = '生成我的练习 →'; message(error.message, true); }
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
$('clear-pdfs-btn').onclick = () => {
  if (busy || booting) return;
  startNewGroup(); $('pdf-input').value = '';
  for (const id of ['source-files', 'source-document', 'source-group', 'page-select']) $(id).replaceChildren();
  $('source-preview').textContent = ''; $('open-pdf').removeAttribute('href');
  message('已清空当前 PDF 选择，可以重新选择。历史测验和作答记录已保留。');
};
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
$('delete-quiz-btn').append(trashIcon(), document.createTextNode('删除测验'));
$('delete-quiz-btn').onclick = () => { if (activeEntry) requestDeleteQuiz(activeEntry); };
$('delete-cancel').onclick = () => $('delete-dialog').close();
$('delete-confirm').onclick = () => { const id = deleteTargetId; $('delete-dialog').close(); if (id) deleteQuiz(id); };
$('delete-dialog').addEventListener('close', () => { deleteTargetId = null; });
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
window.addEventListener('beforeunload', e => { if (busy && !currentTask) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('pagehide', () => { if (!booting) persist(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) wakeTask?.(); });
window.addEventListener('focus', () => wakeTask?.());
window.addEventListener('online', () => wakeTask?.());
window.addEventListener('pageshow', () => wakeTask?.());

async function initialize() {
  updateCounts(); sync();
  try {
    const saved = await LectureLibrary.read();
    if ([1, 2].includes(saved?.version) && Array.isArray(saved.documents) && Array.isArray(saved.quizzes)) {
      if (saved.version === 1) {
        // Old records never stored upload batches; keep their existing grouping and answers.
        saved.groups = saved.documents.map(doc => ({id: LecturePlatform.id(), documentIds: [doc.id], createdAt: doc.createdAt, settings: doc.settings || {counts: counts(), topic: ''}}));
        for (const entry of saved.quizzes) entry.groupId = saved.groups.find(group => group.documentIds.includes(entry.documentId))?.id || null;
        saved.activeGroupId = saved.groups.find(group => group.documentIds.includes(saved.activeDocumentId))?.id || null;
        saved.version = 2;
      }
      Object.assign(workspace, saved);
      workspace.tasks = Array.isArray(saved.tasks) ? saved.tasks : [];
      workspace.deletedQuizIds = Array.isArray(saved.deletedQuizIds) ? saved.deletedQuizIds : [];
      workspace.documents = saved.documents.filter(doc => doc.file instanceof Blob && Array.isArray(doc.pages));
      workspace.groups = saved.groups.filter(group => group.documentIds.length && group.documentIds.every(findDocument));
      workspace.quizzes = saved.quizzes.filter(entry => !workspace.deletedQuizIds.includes(entry.id) && Array.isArray(entry.quiz?.questions) && (entry.quiz.sample || findGroup(entry.groupId)));
      const group = findGroup(workspace.activeGroupId); if (group) selectGroup(group);
      const entry = workspace.quizzes.find(item => item.id === workspace.activeQuizId);
      if (entry && workspace.view === 'quiz') { activeEntry = entry; quiz = entry.quiz; renderQuiz(); } else view('create');
      persist();
    } else renderLibrary();
  } catch (_) { storageNotice = true; message('无法读取此浏览器的测验记录。本页仍可使用，请导出测验备份。', true); renderLibrary(); }
  booting = false; sync(); await models();
  for (const task of workspace.tasks.filter(task => task.status === 'pending')) await runTask(task);
}
initialize();
