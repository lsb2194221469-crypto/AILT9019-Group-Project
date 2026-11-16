/* Render only explicitly marked math or unambiguous ^/_ notation.
   Plain text always enters through textContent; model HTML is never executed. */
(() => {
  const delimiters = [
    {left:'$$',right:'$$',display:true},
    {left:'\\[',right:'\\]',display:true},
    {left:'\\(',right:'\\)',display:false},
    {left:'$',right:'$',display:false}
  ];
  function operators(math) {
    // Only repair explicit operator names inside marked math. A plain "P r"
    // may mean multiplication, so neither source quotes nor prose are guessed.
    const names = {Pr:'\\Pr', Var:'\\operatorname{Var}', Cov:'\\operatorname{Cov}',
      sin:'\\sin', cos:'\\cos', tan:'\\tan', log:'\\log', ln:'\\ln', exp:'\\exp',
      lim:'\\lim', max:'\\max', min:'\\min'};
    return math.replace(/\\(?:operatorname|mathrm|text)\{([A-Za-z\s]+)\}/g, (whole, name, offset, value) => {
      const replacement = names[name.replace(/\s+/g, '')];
      if (!replacement) return whole;
      return replacement + (/\\[A-Za-z]+$/.test(replacement) && /[A-Za-z]/.test(value[offset + whole.length] || '') ? ' ' : '');
    })
      .replace(/(?<![A-Za-z\\])Pr(?=\s*(?:[\[(]|\\left\b))/g, () => '\\Pr');
  }
  function prepare(value) {
    const text = String(value).replace(/[\u200b\u00ad\ufeff]/g,'');
    // Avoid guessing "x2" or merging separate words. Mark only explicit powers
    // and subscripts in prose, keeping existing delimited LaTeX unchanged.
    const protectedMath = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$\n]+\$)/g;
    return text.split(protectedMath).map((part,index) => index % 2 ? operators(part) :
      part.replace(/\b([A-Za-z](?:\s*[\^_]\s*(?:\{[^{}\n]{1,40}\}|[+-]?\d+|[A-Za-z]))+)(?![\w])/g,
        (_, expression) => '\\(' + expression.replace(/\s*([\^_])\s*(\{[^{}\n]{1,40}\}|[+-]?\d+|[A-Za-z])/g,
          (_, operator, value) => operator + (value.startsWith('{') ? value : '{'+value+'}')) + '\\)')).join('');
  }
  function render(element) {
    if (!window.renderMathInElement) return;
    window.renderMathInElement(element, {
      delimiters, throwOnError:false, trust:false, strict:'ignore',
      maxExpand:300, maxSize:12,
      ignoredClasses:['raw-source'],
      errorCallback:() => { element.classList.add('math-fallback'); }
    });
  }
  function text(element,value) {
    element.textContent = prepare(value);
    render(element);
    return element;
  }
  window.LectureMath = Object.freeze({prepare,render,text});
})();
