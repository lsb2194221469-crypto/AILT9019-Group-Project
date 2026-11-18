const $ = id => document.getElementById(id);
const kinds = ['mcq', 'tf', 'short'];
const countLabel = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
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
  $('message').setAttribute('role', error ? 'alert' : 'status');
  $('message').setAttribute('aria-live', error ? 'assertive' : 'polite');
}
function showTaskError(error) {
  if (!['topic_not_covered', 'topic_check_failed'].includes(error.code)) {
    message(error.message, true); return;
  }
  message('', true);
  const alert = $('message'); alert.hidden = false;
  alert.classList.add('topic-alert');
  alert.replaceChildren(node('strong', error.code === 'topic_not_covered' ? 'Topic not covered' : 'Topic check could not finish'), node('p', error.message));
  alert.tabIndex = -1; alert.focus({preventScroll: true});
  alert.scrollIntoView({behavior: 'auto', block: 'center'});
}
async function api(path, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), path === '/api/generate' ? 330000 : 60000);
  try {
    const res = await fetch(path, {...options, signal: controller.signal});
    let data;
    try { data = await res.json(); }
    catch (_) {
      throw Object.assign(new Error('We could not read the server response. Check your connection and try again.'), {status: res.status});
    }
    if (!res.ok) { const error = new Error(data?.error || 'The request failed. Please try again.'); error.code = data?.code; error.status = res.status; throw error; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('The server sent an unreadable response. Please try again.');
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The connection timed out. Check your network. Your quiz will keep generating in the background.');
    throw error;
  } finally { clearTimeout(timer); }
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
          if (!storageNotice) message('This browser could not save your work. You can keep using this page. Export your quiz to keep a copy.', true);
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
  document.querySelectorAll('.pdf-link,.quiz-entry,.quiz-delete,.document-create,#nav-create,#nav-quiz,#back-btn,#extra-set-btn,#regenerate-btn,#delete-quiz-btn').forEach(el => el.disabled = locked);
  $('generate-btn').setAttribute('aria-busy', String(busy));
}
async function models() {
  try {
    const data = await api('/api/models'), previous = $('model').value;
    $('model').replaceChildren();
    if (!data.models.length) {
      $('model').append(new Option('API not set up', ''));
      $('model-status').textContent = data.notice || 'Set up config.json, then reload the settings.';
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
    const query = ($('library-search')?.value || '').trim().toLocaleLowerCase();
    const entries = entriesFor(sourceGroup).filter(entry => !query || (groupName(sourceGroup) + ' ' + entry.title).toLocaleLowerCase().includes(query));
    if (!entries.length) continue;
    const group = node('section', undefined, 'pdf-group');
    group.dataset.groupId = sourceGroup.id;
    const link = node('button', undefined, 'pdf-link'); link.title = groupName(sourceGroup);
    link.classList.toggle('selected', workspace.activeGroupId === sourceGroup.id);
    link.append(node('span', 'PDF', 'file-label'), node('span', `${countLabel(groupDocs(sourceGroup).length, 'PDF')} · ${countLabel(entries.length, 'quiz').replace('quizs', 'quizzes')}`, 'pdf-name'));
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
      button.append(node('span', entry.title), node('small', `${countLabel(entry.quiz.questions.length, 'question')} · ${entry.submitted ? 'Finished' : done ? `${done} answered` : 'Not started'}`));
      button.onclick = () => { if (!busy && !booting) openQuiz(entry); };
      const row = node('div', undefined, 'quiz-row');
      const remove = node('button', undefined, 'quiz-delete');
      remove.title = `Delete ${entry.title}`;
      remove.setAttribute('aria-label', `Delete ${entry.title} (${groupName(sourceGroup)})`);
      remove.append(trashIcon()); remove.onclick = () => requestDeleteQuiz(entry);
      row.append(button, remove); children.append(row);
    }
    group.append(children); list.append(group);
  }
  const sample = workspace.quizzes.find(entry => entry.quiz.sample);
  if (sample && (!($('library-search')?.value || '').trim() || ('Sample Machine learning basics ' + sample.title).includes($('library-search').value.trim()))) {
    const link = node('button', 'Sample: Machine learning basics', 'quiz-entry sample-entry');
    if (workspace.view === 'quiz' && workspace.activeQuizId === sample.id) link.setAttribute('aria-current', 'page');
    link.onclick = () => { if (!busy && !booting) openQuiz(sample); };
    const row = node('div', undefined, 'quiz-row sample-entry'); link.classList.remove('sample-entry');
    const remove = node('button', undefined, 'quiz-delete'); remove.title = 'Delete sample quiz';
    remove.setAttribute('aria-label', 'Delete sample quiz'); remove.append(trashIcon());
    remove.onclick = () => requestDeleteQuiz(sample); row.append(link, remove); list.append(row);
  }
  if (!workspace.quizzes.length && !($('library-search')?.value || '').trim()) {
    const empty = node('div', undefined, 'collection-empty');
    empty.append(node('strong', 'Your quizzes will appear here.'), node('p', 'Upload your notes to get started. Each quiz is saved on its own, so you can return to it later.'));
    list.append(empty);
  }
  if ($('search-empty')) $('search-empty').hidden = !($('library-search').value.trim() && !list.children.length);
  sync();
}
function showPage() {
  const page = documentData?.pages.find(p => String(p.page) === $('page-select').value);
  $('source-preview').textContent = '';
  if (!page) return;
  const preview = LectureSources.create(documentData, page.page);
  $('source-preview').append(preview.element); preview.load();
}
function selectDocument(doc) {
  documentData = doc; workspace.activeDocumentId = doc.id;
  if (!doc.url) doc.url = URL.createObjectURL(doc.file);
  $('open-pdf').href = doc.url; $('source-document').value = doc.id;
  $('page-select').replaceChildren(...doc.pages.map(p => new Option(`Page ${p.page}`, p.page))); showPage();
}
function selectGroup(group) {
  workspace.activeGroupId = group.id;
  const docs = groupDocs(group);
  $('source-picker').hidden = false; $('dropzone').hidden = true; $('document-info').hidden = false;
  $('source-group').replaceChildren(...workspace.groups.map(g => new Option(groupName(g), g.id)));
  $('source-group').value = group.id;
  $('source-document').replaceChildren(...docs.map(doc => new Option(doc.name, doc.id)));
  $('source-files').replaceChildren(...docs.map(doc => node('li', doc.name)));
  $('filename').textContent = `${countLabel(docs.length, 'PDF')} · One quiz`;
  $('page-count').textContent = `${countLabel(docs.reduce((sum, doc) => sum + doc.pages.length, 0), 'page')} · Every page included · 80-page limit`;
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
  $('breadcrumb').textContent = which === 'quiz' ? 'My quizzes' : 'New quiz';
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
  view('create'); persist(); message('Choose your question counts to make another quiz. Your previous quizzes will stay in this group.');
}
async function readSource(doc) {
  const data = await api('/api/upload', {method: 'POST', headers: {'Content-Type': 'application/pdf'}, body: doc.file});
  doc.serverId = data.id; doc.pages = data.pages;
}
async function uploadFiles(files) {
  if (!files.length || busy || booting) return;
  if (files.length > 10) { message('Choose up to 10 PDFs per group.', true); $('pdf-input').value = ''; return; }
  const currentGroup = findGroup(workspace.activeGroupId), previousIds = currentGroup ? [...currentGroup.documentIds] : [];
  const settings = currentSettings();
  busy = true; sync(); const failures = [], candidates = [], addedIds = [];
  try {
    // Count unique files before uploading, so exceeding the group limit keeps the selection intact.
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf') || file.size > 15 * 1024 * 1024) { failures.push(`${file.name}: Choose a PDF no larger than 15 MB.`); continue; }
      try {
        const fingerprint = await LecturePlatform.fingerprint(file);
        const existing = workspace.documents.find(doc => doc.fingerprint === fingerprint);
        if ((existing && previousIds.includes(existing.id)) || candidates.some(doc => doc.fingerprint === fingerprint)) continue;
        candidates.push(existing || {id: LecturePlatform.id(), fingerprint, name: file.name, file, pages: [], createdAt: new Date().toISOString()});
      } catch (e) { failures.push(`${file.name}：${e.message}`); }
    }
    if (previousIds.length + candidates.length > 10) {
      message(`You already have ${previousIds.length} PDFs. Adding these would go over the 10-file limit. Your selected files are still here.`, true); return;
    }
    for (const doc of candidates) {
      message(`Reading ${doc.name}…`);
      try {
        if (!findDocument(doc.id)) { await readSource(doc); }
        const selectedPages = [...previousIds, ...addedIds].reduce((sum, id) => sum + findDocument(id).pages.length, 0);
        if (selectedPages + doc.pages.length > 80) throw new Error('This file would go over the 80-page limit. Split it into smaller files. Your previous selection is still here.');
        if (!findDocument(doc.id)) workspace.documents.push(doc);
        addedIds.push(doc.id);
      } catch (e) { failures.push(`${doc.name}：${e.message}`); }
    }
    let notice = 'These PDFs are already selected. No duplicate files were added.';
    if (addedIds.length) {
      const hasHistory = currentGroup && entriesFor(currentGroup).length > 0;
      // Keep the sources of completed quizzes unchanged when extending a historical group.
      const group = currentGroup && !hasHistory ? currentGroup : {id: LecturePlatform.id(), createdAt: new Date().toISOString()};
      group.documentIds = [...previousIds, ...addedIds]; group.settings = settings;
      if (group !== currentGroup) workspace.groups.push(group);
      selectGroup(group); view('create'); await persist();
      notice = hasHistory ? 'Your PDFs are in a new group. Previous quizzes and answers are safe. You can add more files.' : `${group.documentIds.length} PDFs selected. You can add more. All selected files will be used.`;
    }
    message(failures.length ? failures.join('\n') : storageNotice ? 'Files added, but this browser could not save them. Export your quiz to keep a copy.' : notice, Boolean(failures.length) || storageNotice);
  } finally { busy = false; $('pdf-input').value = ''; renderLibrary(); sync(); }
}

function responses() {
  return quiz.questions.map((q, i) => q.type === 'short' ? $(`response-${i}`).value : document.querySelector(`input[name="q${i}"]:checked`)?.value || '');
}
function progress() {
  const done = responses().filter(value => value.trim()).length;
  $('answer-progress').textContent = `${done} of ${quiz.questions.length} answered`;
  $('progress').max = quiz.questions.length; $('progress').value = done; renderQuestionMap();
}
function renderQuestionMap() {
  if (!quiz || !activeEntry) return;
  const map = $('question-map'); map.replaceChildren();
  quiz.questions.forEach((question, index) => {
    const answered = Boolean(activeEntry.answers[index]?.trim());
    const starred = (activeEntry.starredQuestions || []).includes(index);
    const button = node('button', String(index + 1) + (starred ? ' ★' : ''), 'question-jump');
    button.classList.toggle('answered', answered);
    const wrong = activeEntry.submitted && question.type !== 'short' && activeEntry.answers[index] !== question.answer;
    button.classList.toggle('is-wrong', Boolean(wrong));
    button.setAttribute('aria-label', `Question ${index + 1}, ${answered ? 'answered' : 'not answered'}${wrong ? ', incorrect' : ''}${starred ? ', saved' : ''}`);
    button.onclick = () => jumpToQuestion(index); map.append(button);
  });
  $('next-unanswered').hidden = activeEntry.submitted;
  $('next-unanswered').disabled = activeEntry.answers.every(answer => answer.trim());
}
function jumpToQuestion(index) {
  activeEntry.wrongOnly = false; activeEntry.starredOnly = false; applyFilter();
  const card = $('questions').children[index];
  card.scrollIntoView({behavior:'smooth', block:'center'});
  (activeEntry.submitted ? card : card.querySelector('input,textarea') || card).focus({preventScroll:true});
  persist();
}
function applyFilter() {
  $('wrong-btn').setAttribute('aria-pressed', String(Boolean(activeEntry.wrongOnly)));
  $('wrong-btn').textContent = activeEntry.wrongOnly ? 'Show all questions' : 'Show mistakes';
  $('starred-btn').setAttribute('aria-pressed', String(Boolean(activeEntry.starredOnly)));
  $('starred-btn').textContent = activeEntry.starredOnly ? 'Show all questions' : 'Show saved';
  [...$('questions').children].forEach((card, index) => {
    card.hidden = Boolean((activeEntry.wrongOnly && card.dataset.wrong !== 'true') || (activeEntry.starredOnly && !(activeEntry.starredQuestions || []).includes(index)));
  });
  $('filter-empty').hidden = [...$('questions').children].some(card => !card.hidden);
}
function renderReview() {
  const entry = activeEntry, values = entry.answers; let correct = 0, objective = 0;
  quiz.questions.forEach((q, i) => {
    const answer = $(`answer-${i}`); answer.hidden = false; answer.replaceChildren();
    const wrong = q.type !== 'short' && values[i] !== q.answer;
    if (q.type !== 'short') { objective++; if (values[i] === q.answer) correct++; }
    answer.parentElement.dataset.wrong = String(wrong);
    answer.append(node('strong', q.type === 'short' ? 'Short answer · Check your own response' : wrong ? '✕ Incorrect · Check the answer below' : '✓ Correct', `answer-status ${q.type === 'short' ? 'self-review' : wrong ? 'is-wrong' : 'is-correct'}`));
    if (wrong) {
      const label = q.type === 'tf' ? values[i] === 'True' ? 'True' : 'False' : values[i];
      answer.append(mathNode('p', `Your answer: ${label || 'Not answered'}`, 'your-wrong-answer'));
    }
    answer.append(mathNode('p', `Reference answer: ${q.answer}`, wrong ? 'correct-answer' : ''), mathNode('p', q.explanation));
    const details = node('details'); details.open = entry.expandedSources.includes(i);
    const documents = groupDocs(findGroup(entry.groupId));
    const source = documents.find(doc => doc.id === q.source_document_id) ||
      (documents.filter(doc => doc.name === q.source_name).length === 1 ? documents.find(doc => doc.name === q.source_name) : null) ||
      (documents.length === 1 ? documents[0] : null);
    const evidence = LectureSources.create(source, q.page, q.quote);
    details.append(node('summary', `View source · ${q.source_name || source?.name || 'Sample'} · Page ${q.page}`), evidence.element, node('p', 'Check the answer against the PDF. A matching quote does not prove that the answer is correct.', 'hint'));
    if (details.open) evidence.load();
    details.addEventListener('toggle', () => {
      if (details.open) evidence.load();
      entry.expandedSources = entry.expandedSources.filter(index => index !== i);
      if (details.open) entry.expandedSources.push(i);
      persist();
    });
    answer.append(details);
  });
  $('questions').querySelectorAll('input,textarea').forEach(el => el.disabled = true);
  $('results').hidden = false;
  $('results').replaceChildren(node('span', 'SESSION COMPLETE', 'eyebrow'), node('h2', objective ? `${correct} of ${objective} scored answers correct` : 'Practice complete'), node('p', `Check your ${countLabel(quiz.questions.length - objective, 'short answer')} against the reference answers. Open the source to review each question.`));
  $('submit-btn').hidden = true; $('review-actions').hidden = false; $('wrong-btn').disabled = correct === objective; applyFilter(); renderQuestionMap();
}
function renderQuiz() {
  $('questions').replaceChildren(); $('results').hidden = true; $('submit-btn').hidden = false; $('review-actions').hidden = true;
  $('wrong-btn').setAttribute('aria-pressed', 'false'); $('wrong-btn').textContent = 'Show mistakes';
  const group = findGroup(activeEntry.groupId);
  $('quiz-title').textContent = quiz.sample ? 'Sample: Machine learning basics' : `${groupName(group)} · ${activeEntry.title}`;
  $('quiz-label').textContent = quiz.sample ? 'READY-MADE SAMPLE · NOT A LIVE RESULT' : 'GENERATED FROM YOUR LECTURE';
  $('quiz-sources').replaceChildren(...groupDocs(group).map(doc => {
    if (!doc.url) doc.url = URL.createObjectURL(doc.file);
    const link = node('a', doc.name); link.href = doc.url; link.target = '_blank'; link.rel = 'noopener'; return link;
  }));
  $('regenerate-btn').hidden = !group; $('extra-set-btn').hidden = !group; $('quiz-notice').textContent = quiz.notice;
  quiz.questions.forEach((q, i) => {
    const card = node('article', undefined, 'card question'); card.tabIndex = -1;
    const star = node('button', (activeEntry.starredQuestions || []).includes(i) ? '★ Saved' : '☆ Save', 'question-star');
    star.setAttribute('aria-pressed', String((activeEntry.starredQuestions || []).includes(i)));
    star.setAttribute('aria-label', `Save question ${i + 1}`);
    star.onclick = () => {
      const selected = new Set(activeEntry.starredQuestions || []);
      if (selected.has(i)) selected.delete(i); else selected.add(i);
      activeEntry.starredQuestions = [...selected];
      star.textContent = selected.has(i) ? '★ Saved' : '☆ Save'; star.setAttribute('aria-pressed', String(selected.has(i)));
      renderQuestionMap(); applyFilter(); persist();
    }; card.append(star);
    card.append(node('span', `QUESTION ${String(i + 1).padStart(2, '0')} / ${q.type === 'mcq' ? 'Multiple choice' : q.type === 'tf' ? 'True or false' : 'Short answer'}`, 'q-number'), mathNode('h3', q.question));
    if (q.type === 'short') {
      const input = node('textarea'); input.id = `response-${i}`; input.value = activeEntry.answers[i] || '';
      input.placeholder = 'Write your answer in your own words. After submitting, compare it with the reference answer.'; input.setAttribute('aria-label', `Answer to question ${i + 1}`); card.append(input);
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
  progress(); applyFilter(); view('quiz');
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
  const entry = {id, groupId: group?.id || null, title: `Quiz ${number}`, createdAt: new Date().toISOString(), quiz: structuredClone(data), settings: settings ? structuredClone(settings) : null,
    answers: data.questions.map(() => ''), submitted: false, wrongOnly: false, expandedSources: []};
  workspace.quizzes.push(entry); openQuiz(entry);
}

function requestDeleteQuiz(entry) {
  if (busy || booting) return;
  deleteTargetId = entry.id;
  $('delete-description').textContent = `Delete ${countLabel(entry.quiz.questions.length, 'question')} and your answers from ${entry.quiz.sample ? 'the sample quiz' : entry.title}? Other quizzes and PDFs will stay.`;
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
  message(storageNotice ? 'Quiz deleted on this page, but the browser could not save the change. It may reappear after a refresh.' : 'Quiz deleted. Your other quizzes and PDFs are safe.', storageNotice);
}

function taskDelay(ms) {
  return new Promise(resolve => {
    const finish = () => { clearTimeout(timer); if (wakeTask === finish) wakeTask = null; resolve(); };
    const timer = setTimeout(finish, ms); wakeTask = finish;
  });
}
async function completeTask(task, generated) {
  const docs = task.documentIds.map(findDocument).filter(Boolean), group = findGroup(task.groupId);
  if (!group || !docs.length) throw new Error('The quiz is ready, but its PDF is missing from this browser. Please upload the PDF again.');
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
  message(storageNotice ? 'Your quiz is ready, but this browser could not save it. Export a copy.' : 'Quiz saved in this PDF group. You can make another or open a previous quiz.', storageNotice);
}
async function runTask(task) {
  currentTask = task; busy = true; sync(); $('generate-btn').textContent = 'Making your quiz…';
  try {
    while (task.status === 'pending') {
      try {
        const status = task.submitted ? await api('/api/jobs/' + task.id) : await api('/api/jobs', {
          method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(task.requestBody)});
        if (!task.submitted) { task.submitted = true; await persist(); }
        if (status.status === 'succeeded') {
          // A local import/render failure is not a network interruption. Stop
          // polling and show the actual error instead of looping forever.
          try { await completeTask(task, status.result); }
          catch (error) { error.status = 400; throw error; }
          break;
        }
        if (status.status === 'failed') throw Object.assign(new Error(status.error), {status: 400, code: status.code});
        message(status.status === 'queued' ? 'Your quiz is in the queue. You can switch tabs and return when it is ready.' : task.settings?.topic?.trim() ? 'We are checking your topic against all PDFs, then making your quiz if it is covered. You can switch tabs or refresh.' : 'Your quiz is being made. You can switch tabs or refresh. The result will appear when you return.');
        await taskDelay(1500);
      } catch (error) {
        if (error.code === 'document_expired' && !task.submitted) {
          const docs = task.documentIds.map(findDocument).filter(Boolean);
          for (const doc of docs) await readSource(doc);
          task.requestBody.document_ids = docs.map(doc => doc.serverId); await persist();
          continue;
        }
        if ([400, 403, 404, 409, 422].includes(error.status) || ['topic_not_covered', 'topic_check_failed'].includes(error.code)) throw error;
        // A lost response is ambiguous. Retry the same task ID, never a fresh
        // model request; the server deduplicates submissions before generation.
        message('Connection lost. We are trying to reconnect to your quiz. It will resume when you return or reconnect, without starting another request.');
        await taskDelay(4000);
      }
    }
  } catch (error) {
    task.status = 'failed'; task.error = error.message; task.errorCode = error.code; await persist(); showTaskError(error);
  } finally {
    currentTask = null; busy = false;
    $('generate-btn').replaceChildren(document.createTextNode('Make my quiz'), node('span', '→')); sync();
  }
}
$('generate-btn').onclick = async () => {
  if (busy || booting || !documentData || $('generate-btn').disabled) return;
  const group = findGroup(workspace.activeGroupId), docs = groupDocs(group), settings = currentSettings(), model = $('model').value;
  rememberSettings(); busy = true; sync(); $('generate-btn').textContent = 'Getting your notes ready…';
  message('Getting your quiz ready…');
  try {
    for (const doc of docs) if (!doc.serverId) await readSource(doc);
    const id = LecturePlatform.id();
    const task = {id, groupId: group.id, documentIds: docs.map(doc => doc.id), settings: structuredClone(settings),
      status: 'pending', submitted: false, createdAt: new Date().toISOString(),
      requestBody: {job_id: id, document_ids: docs.map(doc => doc.serverId), document_names: docs.map(doc => doc.name), model, ...settings}};
    workspace.tasks.push(task); await persist(); await runTask(task);
  } catch (error) { busy = false; sync(); $('generate-btn').textContent = 'Make my quiz →'; message(error.message, true); }
};
$('sample-btn').onclick = async () => {
  if (busy || booting) return;
  busy = true; sync();
  try {
    const existing = workspace.quizzes.find(entry => entry.quiz.sample);
    if (existing) openQuiz(existing); else addQuiz(await api('/api/sample'), null, null);
    message('This is a ready-made sample. It does not use your PDFs or test the model connection.');
  } catch (e) { message(e.message, true); }
  finally { busy = false; sync(); }
};
$('submit-btn').onclick = () => {
  if (!quiz || activeEntry.submitted) return;
  const values = responses();
  if (values.some(r => !r.trim())) {
    message('Answer every question before checking the answers.', true);
    jumpToQuestion(values.findIndex(r => !r.trim())); return;
  }
  activeEntry.answers = values; activeEntry.submitted = true;
  renderReview(); renderLibrary(); persist(); message('Answers shown. Use them to help you study and check them against your notes.');
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
  message('Selection cleared. You can choose new PDFs. Your saved quizzes and answers are safe.');
};
$('source-group').onchange = () => { if (!busy) createFor(findGroup($('source-group').value)); };
$('source-document').onchange = () => { if (!busy) selectDocument(findDocument($('source-document').value)); };
$('page-select').onchange = showPage; $('refresh-models').onclick = models; $('model').onchange = sync;
function updateCounts() {
  const values = counts(), total = Object.values(values).reduce((a, b) => a + b, 0);
  for (const [kind, count] of Object.entries(values)) $('count-' + kind + '-label').textContent = `${countLabel(count, 'question')}`;
  $('total-count').textContent = `${total} questions in total`;
  $('count-status').textContent = total === 0 ? 'Choose at least 1 question.' : total > 24 ? 'Choose no more than 24 questions in total.' : 'Mix question types. Set any type to 0 to skip it. Choose up to 24 questions in total.';
  $('count-status').classList.toggle('count-error', total === 0 || total > 24); sync();
}
for (const kind of kinds) $('count-' + kind).oninput = () => { updateCounts(); rememberSettings(); persist(); };
$('topic').oninput = () => { rememberSettings(); persist(); };
['dragenter', 'dragover'].forEach(event => $('dropzone').addEventListener(event, e => { e.preventDefault(); $('dropzone').classList.add('drag'); }));
['dragleave', 'drop'].forEach(event => $('dropzone').addEventListener(event, e => { e.preventDefault(); $('dropzone').classList.remove('drag'); if (event === 'drop') uploadFiles([...e.dataTransfer.files]); }));
$('back-btn').onclick = () => { if (!busy && !booting) createFor(findGroup(workspace.activeGroupId)); };
$('nav-create').onclick = () => { if (!busy && !booting) startNewGroup(); };
$('extra-set-btn').onclick = async () => {
  if (busy || booting || !activeEntry) return;
  const group = findGroup(activeEntry.groupId);
  if (!group) { message('Upload a PDF first. The ready-made sample cannot create new questions.', true); return; }
  const settings = structuredClone(activeEntry.settings || group.settings);
  createFor(group, settings);
  if ($('generate-btn').disabled) { message('Check your question counts and model settings before making another quiz.', true); return; }
  await $('generate-btn').onclick();
};
$('regenerate-btn').onclick = () => { if (!busy && activeEntry) createFor(findGroup(activeEntry.groupId), activeEntry.settings); };
$('delete-quiz-btn').append(trashIcon(), document.createTextNode('Delete quiz'));
$('delete-quiz-btn').onclick = () => { if (activeEntry) requestDeleteQuiz(activeEntry); };
$('delete-cancel').onclick = () => $('delete-dialog').close();
$('delete-confirm').onclick = () => { const id = deleteTargetId; $('delete-dialog').close(); if (id) deleteQuiz(id); };
$('delete-dialog').addEventListener('close', () => { deleteTargetId = null; });
$('nav-quiz').onclick = () => {
  if (busy || booting) return;
  const entry = workspace.quizzes.find(item => item.id === workspace.activeQuizId) || workspace.quizzes[workspace.quizzes.length - 1];
  if (entry) openQuiz(entry); else message('Upload a PDF to start, or try the sample quiz.');
};
$('retry-btn').onclick = () => {
  if (!activeEntry || busy || booting) return;
  $('retry-dialog').showModal(); $('retry-cancel').focus();
};
$('retry-cancel').onclick = () => $('retry-dialog').close();
$('retry-confirm').onclick = () => {
  if (!activeEntry || busy || booting) return;
  $('retry-dialog').close();
  activeEntry.answers = quiz.questions.map(() => ''); activeEntry.submitted = false;
  activeEntry.wrongOnly = false; activeEntry.starredOnly = false; activeEntry.expandedSources = [];
  renderQuiz(); persist(); message('Ready to try again. Saved questions and answers in other quizzes are safe.');
  jumpToQuestion(0);
};
$('retry-dialog').addEventListener('close', () => $('retry-btn').focus());
$('next-unanswered').onclick = () => { const index = activeEntry.answers.findIndex(answer => !answer.trim()); if (index >= 0) jumpToQuestion(index); };
$('starred-btn').onclick = () => { activeEntry.starredOnly = !activeEntry.starredOnly; activeEntry.wrongOnly = false; applyFilter(); persist(); };
$('show-all-questions').onclick = () => { activeEntry.starredOnly = false; activeEntry.wrongOnly = false; applyFilter(); persist(); };
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
      for (const entry of workspace.quizzes) entry.title = entry.title.replace(/^\u7ec3\u4e60 (\d+)$/, 'Quiz $1');
      const group = findGroup(workspace.activeGroupId); if (group) selectGroup(group);
      const entry = workspace.quizzes.find(item => item.id === workspace.activeQuizId);
      if (entry && workspace.view === 'quiz') { activeEntry = entry; quiz = entry.quiz; renderQuiz(); } else view('create');
      persist();
    } else renderLibrary();
  } catch (_) { storageNotice = true; message('We could not load your saved quizzes. You can still use this page. Export your work to keep a copy.', true); renderLibrary(); }
  booting = false; sync(); await models();
  for (const task of workspace.tasks.filter(task => task.status === 'pending')) await runTask(task);
}
initialize();
