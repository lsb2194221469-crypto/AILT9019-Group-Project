/* Render only explicitly marked math or unambiguous ^/_ notation.
   Plain text always enters through textContent; model HTML is never executed. */
(() => {
  const delimiters = [
    {left:'$$',right:'$$',display:true},
    {left:'\\[',right:'\\]',display:true},
    {left:'\\(',right:'\\)',display:false},
    {left:'$',right:'$',display:false}
  ];
  function prepare(value) {
    const text = String(value).replace(/[\u200b\u00ad\ufeff]/g,'');
    // Avoid guessing "x2" or merging separate words. Mark only explicit powers
    // and subscripts in prose, keeping existing delimited LaTeX unchanged.
    const protectedMath = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$\n]+\$)/g;
    return text.split(protectedMath).map((part,index) => index % 2 ? part :
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
