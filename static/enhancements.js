/* Additive controls; keep the existing IndexedDB schema and quiz IDs intact. */
(() => {
  $('nav-library').onclick = () => $('library-section').scrollIntoView({behavior:'smooth',block:'start'});
  const dock = () => { $('generation-dock').hidden = workspace.view === 'quiz'; $('dock-summary').textContent = documentData ? `${groupDocs(findGroup(workspace.activeGroupId)).length} 份讲义 · ${Object.values(counts()).reduce((a,b)=>a+b,0)} 道题，准备好了。` : '选好讲义，再开始。'; };
  new MutationObserver(dock).observe($('create-view'), {attributes:true,attributeFilter:['hidden']});
  new MutationObserver(dock).observe($('generate-btn'), {attributes:true,attributeFilter:['disabled']});
  dock();
  $('library-search').addEventListener('input', renderLibrary);
  const presets = node('div', undefined, 'preset-row');
  presets.setAttribute('aria-label', '题量快捷设置');
  for (const [label, values] of [['快速复习', [2, 2, 1]], ['均衡练习', [4, 4, 2]], ['深入理解', [2, 2, 6]]]) {
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
    if (!name) { $('quiz-name').setCustomValidity('请输入测验名称。'); $('quiz-name').reportValidity(); return; }
    if (!entry || busy) return;
    entry.title = name.slice(0,80); openQuiz(entry); await persist();
    $('rename-dialog').close(); message(storageNotice ? '名称已修改，但浏览器保存失败，请导出备份。' : '测验名称已保存。', storageNotice);
  };
  $('quiz-name').oninput = () => $('quiz-name').setCustomValidity('');
  $('rename-dialog').addEventListener('close', () => { renamingId = null; $('rename-btn').focus(); });
  $('print-btn').onclick = () => { if (quiz) window.print(); };
  $('markdown-btn').onclick = () => {
    if (!activeEntry || !quiz) return;
    const lines = ['# ' + activeEntry.title, '', '> 自学练习；请对照 PDF 原文核对答案。', ''];
    quiz.questions.forEach((q, index) => {
      lines.push(`## ${index + 1}. ${q.question}`, '');
      (q.options || []).forEach((option, i) => lines.push(`${String.fromCharCode(65+i)}. ${option}`));
      lines.push('', `**答案：** ${q.answer}`, '', q.explanation, '', `**出处：** ${q.source_name || '讲义'} · 第 ${q.page} 页`, '', q.quote.split('\n').map(line => '> ' + line).join('\n'), '');
    });
    const url = URL.createObjectURL(new Blob([lines.join('\n')], {type:'text/markdown;charset=utf-8'}));
    const a = node('a'); a.href = url; a.download = 'lecture-quiz.md'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message('Markdown 已导出，包含题目、答案、解析与原文出处。');
  };
})();
