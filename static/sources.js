/* Show original PDF glyphs for source evidence; never guess lost math symbols. */
(() => {
  const cache = new Map(), pending = new Map();
  const make = (tag, text, cls) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (cls) element.className = cls;
    return element;
  };
  async function preview(doc, page, quote) {
    const key = JSON.stringify([doc.fingerprint || doc.id, page, quote]);
    if (cache.has(key)) {
      const result = cache.get(key); cache.delete(key); cache.set(key, result);
      return result;
    }
    if (pending.has(key)) return pending.get(key);
    const request = (async () => {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch('/api/source-preview?page=' + page, {
          method:'POST', headers:{'Content-Type':'application/pdf', 'X-Source-Quote':encodeURIComponent(quote)},
          body:doc.file, signal:controller.signal
        });
        if (!response.ok) throw new Error('preview unavailable');
        const result = await response.json();
        if (!result.image || result.page !== page || !['page','excerpt'].includes(result.mode)) throw new Error('invalid preview');
        const bytes = Uint8Array.from(atob(result.image), char => char.charCodeAt(0));
        const value = {...result, image:undefined, blob:new Blob([bytes], {type:'image/png'})};
        cache.set(key, value);
        while (cache.size > 24) {
          const oldest = cache.keys().next().value;
          cache.delete(oldest);
        }
        return value;
      } finally { clearTimeout(timer); pending.delete(key); }
    })();
    pending.set(key, request);
    return request;
  }
  function create(doc, page, quote = '') {
    const root = make('div', undefined, 'source-evidence');
    const raw = make('details', undefined, 'source-extracted');
    raw.append(make('summary', '提取文本（不保留原页排版）'), make('blockquote', quote, 'raw-source'));
    if (!doc?.file || !Number.isInteger(page) || page < 1) {
      root.append(make('p', '原 PDF 不在此浏览器中，暂时只能显示提取文本；公式请对照原文件。', 'hint'), raw);
      raw.open = true;
      return {element:root, load:() => {}};
    }
    const figure = make('figure', undefined, 'source-facsimile');
    const caption = make('figcaption', `PDF 原页排版 · 第 ${page} 页`);
    const status = make('p', '正在读取 PDF 原页排版…', 'hint'); status.setAttribute('role','status');
    const original = make('a', '打开 PDF 原页 ↗', 'text-button source-original');
    if (!doc.url) doc.url = URL.createObjectURL(doc.file);
    original.href = doc.url + '#page=' + page; original.target = '_blank'; original.rel = 'noopener';
    figure.append(caption, status); root.append(figure, original);
    if (quote) root.append(raw);
    let loading = false, done = false;
    async function load() {
      if (loading || done) return;
      loading = true; status.textContent = '正在读取 PDF 原页排版…';
      figure.querySelector('.source-retry')?.remove();
      try {
        const result = await preview(doc, page, quote);
        const image = make('img', undefined, 'source-image');
        image.alt = `${doc.name} 第 ${page} 页${result.mode === 'excerpt' ? '原文片段' : '原页'}（保留 PDF 数学符号与排版）`;
        image.width = result.width; image.height = result.height;
        const url = URL.createObjectURL(result.blob);
        try {
          await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
        } finally { URL.revokeObjectURL(url); }
        caption.textContent = `PDF ${result.mode === 'excerpt' ? '原文片段' : '原页'} · 第 ${page} 页`;
        figure.append(image); status.remove(); done = true;
      } catch (_) {
        status.textContent = '原页预览暂时不可用，请打开 PDF 原页查看公式。';
        const retry = make('button', '重试预览', 'text-button source-retry'); retry.type = 'button';
        retry.onclick = load; figure.append(retry);
      } finally { loading = false; }
    }
    return {element:root, load};
  }
  window.LectureSources = Object.freeze({create});
})();
