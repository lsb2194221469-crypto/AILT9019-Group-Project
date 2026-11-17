/* Optional image viewer. Every screenshot link also works without JavaScript. */
(() => {
  const dialog = document.getElementById('image-dialog');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const image = document.getElementById('dialog-image');
  const heading = document.getElementById('image-dialog-title');
  let opener;
  document.querySelectorAll('a[data-lightbox]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault(); opener = link; image.src = link.href;
      image.alt = link.querySelector('img').alt;
      heading.textContent = link.dataset.title || 'App screenshot';
      dialog.showModal(); dialog.scrollTop = 0;
    });
  });
  document.getElementById('close-image').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => { image.removeAttribute('src'); opener?.focus({preventScroll:true}); });
})();
