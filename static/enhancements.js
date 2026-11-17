/* Additive controls; keep the existing IndexedDB schema and quiz IDs intact. */
(() => {
  $('nav-library').onclick = () => $('library-section').scrollIntoView({behavior:'smooth',block:'start'});
  const dock = () => { $('generation-dock').hidden = workspace.view === 'quiz'; $('dock-summary').textContent = documentData ? `${countLabel(groupDocs(findGroup(workspace.activeGroupId)).length, 'PDF')} · ${Object.values(counts()).reduce((a,b)=>a+b,0)} questions ready to create` : 'Add your notes to get started.'; };
  new MutationObserver(dock).observe($('create-view'), {attributes:true,attributeFilter:['hidden']});
  new MutationObserver(dock).observe($('generate-btn'), {attributes:true,attributeFilter:['disabled']});
  dock();
  $('library-search').addEventListener('input', renderLibrary);
  const presets = node('div', undefined, 'preset-row');
  presets.setAttribute('aria-label', 'Quick question counts');
  for (const [label, values] of [['Quick review', [2, 2, 1]], ['Mixed practice', [4, 4, 2]], ['More short answers', [2, 2, 6]]]) {
    const button = node('button', label, 'secondary'); button.type = 'button';
    button.onclick = () => {
      if (busy || booting) return;
      kinds.forEach((kind, index) => { $('count-' + kind).value = values[index]; });
      updateCounts(); rememberSettings(); persist();
    };
    presets.append(button);
  }
  $('count-mcq').closest('article').querySelector('.card-heading').after(presets);
  const updatePresets = () => {
    const values = Object.values(counts());
    [...presets.children].forEach((button, index) => {
      const expected = [[2,2,1],[4,4,2],[2,2,6]][index];
      button.setAttribute('aria-pressed', String(values.every((n,i) => n === expected[i])));
      button.disabled = busy || booting;
    });
  };
  new MutationObserver(updatePresets).observe($('generate-btn'), {attributes:true, attributeFilter:['disabled']});
  kinds.forEach(kind => $('count-' + kind).addEventListener('input', updatePresets));
  presets.addEventListener('click', updatePresets); updatePresets();
  let renamingId = null;
  $('rename-btn').onclick = () => {
    if (!activeEntry || busy || booting) return;
    renamingId = activeEntry.id; $('quiz-name').value = activeEntry.title;
    $('rename-dialog').showModal(); $('quiz-name').select();
  };
  $('rename-cancel').onclick = () => $('rename-dialog').close();
  $('rename-form').onsubmit = async event => {
    event.preventDefault();
    const name = $('quiz-name').value.trim(), entry = workspace.quizzes.find(q => q.id === renamingId);
    if (!name) { $('quiz-name').setCustomValidity('Enter a quiz name.'); $('quiz-name').reportValidity(); return; }
    if (!entry || busy) return;
    entry.title = name.slice(0,80); openQuiz(entry); await persist();
    $('rename-dialog').close(); message(storageNotice ? 'Name changed, but this browser could not save it. Export a copy.' : 'Quiz name saved.', storageNotice);
  };
  $('quiz-name').oninput = () => $('quiz-name').setCustomValidity('');
  $('rename-dialog').addEventListener('close', () => { renamingId = null; $('rename-btn').focus(); });
  $('print-btn').onclick = () => { if (quiz) window.print(); };
  $('markdown-btn').onclick = () => {
    if (!activeEntry || !quiz) return;
    const lines = ['# ' + activeEntry.title, '', '> Study practice. Check answers against the PDF. Plain text may lose math symbols, so check the original page.', ''];
    quiz.questions.forEach((q, index) => {
      lines.push(`## ${index + 1}. ${LectureMath.prepare(q.question)}`, '');
      (q.options || []).forEach((option, i) => lines.push(`${String.fromCharCode(65+i)}. ${LectureMath.prepare(option)}`));
      lines.push('', `**Answer:** ${LectureMath.prepare(q.answer)}`, '', LectureMath.prepare(q.explanation), '', `**Source:** ${q.source_name || 'Notes'} · Page ${q.page}`, '', q.quote.split('\n').map(line => '> ' + line).join('\n'), '');
    });
    const url = URL.createObjectURL(new Blob([lines.join('\n')], {type:'text/markdown;charset=utf-8'}));
    const a = node('a'); a.href = url; a.download = 'lecture-quiz.md'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message('Markdown exported with questions, answers, explanations, and sources.');
  };
})();
