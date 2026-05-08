'use strict';

/* ── State ── */
let books = JSON.parse(localStorage.getItem('bt_books') || '[]');
let currentView = 'library';
let searchQuery  = '';
let html5QrCode  = null;
let pendingBook  = null;
let isLookingUp  = false;
let toastTimer   = null;
let indicatorTimer = null;

/* ── Boot ── */
document.addEventListener('DOMContentLoaded', () => {
  setupNav();
  setupSearch();
  setupManualAdd();
  setupScannerISBNInput();
  setupPreviewModal();
  setupDetailModal();
  buildAlphaNav();
  renderLibrary();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});

/* ════════════════════════════
   Navigation
════════════════════════════ */
function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
}

async function switchView(view) {
  if (view === currentView) return;

  if (currentView === 'scanner') await stopScanner();

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  document.getElementById(`view-${view}`).classList.add('active');
  document.querySelector(`[data-view="${view}"]`).classList.add('active');

  const titles = { library: 'My Library', scanner: 'Scan ISBN', add: 'Add Book' };
  document.getElementById('header-title').textContent = titles[view];

  const header = document.getElementById('app-header');
  const searchContainer = document.getElementById('search-container');
  if (view === 'scanner') {
    searchContainer.style.display = 'none';
    document.getElementById('book-count').style.display = 'none';
  } else {
    searchContainer.style.display = '';
    document.getElementById('book-count').style.display = '';
  }

  currentView = view;

  if (view === 'scanner') {
    isLookingUp = false;
    document.getElementById('isbn-manual').value = '';
    document.getElementById('scanner-message').textContent = 'Point camera at the barcode on the back of a book';
    setTimeout(startScanner, 150);
  }
}

/* ════════════════════════════
   Library Rendering
════════════════════════════ */
function getSortKey(title) {
  return (title || '').replace(/^(the |a |an )\s*/i, '').trim();
}

function renderLibrary() {
  const container = document.getElementById('book-list');
  const empty     = document.getElementById('empty-state');
  const countEl   = document.getElementById('book-count');

  let list = books;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = books.filter(b =>
      (b.title  || '').toLowerCase().includes(q) ||
      (b.author || '').toLowerCase().includes(q) ||
      (b.isbn   || '').includes(q)
    );
  }

  countEl.textContent = books.length === 1 ? '1 book' : `${books.length} books`;

  if (list.length === 0) {
    container.innerHTML = '';
    empty.classList.add('visible');
    updateAlphaNav([]);
    return;
  }

  empty.classList.remove('visible');

  const sorted = [...list].sort((a, b) =>
    getSortKey(a.title).localeCompare(getSortKey(b.title), undefined, { sensitivity: 'base' })
  );

  const groups = {};
  for (const book of sorted) {
    const ch = getSortKey(book.title)[0]?.toUpperCase() || '#';
    const letter = /[A-Z]/.test(ch) ? ch : '#';
    if (!groups[letter]) groups[letter] = [];
    groups[letter].push(book);
  }

  const activeLetters = Object.keys(groups).sort((a, b) => a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b));

  container.innerHTML = activeLetters.map(letter => {
    const id = letter === '#' ? 'HASH' : letter;
    return `
      <div class="book-section" id="section-${id}">
        <div class="section-header">${letter}</div>
        ${groups[letter].map(bookCardHTML).join('')}
      </div>`;
  }).join('');

  container.querySelectorAll('.book-card').forEach(card => {
    card.addEventListener('click', () => showBookDetail(card.dataset.id));
  });

  updateAlphaNav(activeLetters);
}

function bookCardHTML(book) {
  const letter = getSortKey(book.title)[0]?.toUpperCase() || '?';
  const coverHTML = book.cover
    ? `<img src="${escHtml(book.cover)}" alt="" loading="lazy"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
    : '';
  const fallbackDisplay = book.cover ? 'display:none' : '';
  return `
    <div class="book-card" data-id="${escHtml(book.id)}">
      <div class="book-thumb">
        ${coverHTML}
        <div class="cover-fallback" style="${fallbackDisplay}">${escHtml(letter)}</div>
      </div>
      <div class="book-info">
        <div class="book-title">${escHtml(book.title)}</div>
        <div class="book-author">${escHtml(book.author || 'Unknown Author')}</div>
        ${book.year ? `<div class="book-year">${escHtml(book.year)}</div>` : ''}
      </div>
    </div>`;
}

/* ════════════════════════════
   Alphabet Nav
════════════════════════════ */
function buildAlphaNav() {
  const nav = document.getElementById('alpha-nav');
  const letters = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
  nav.innerHTML = letters.map(l =>
    `<div class="alpha-letter dim" data-letter="${l}">${l}</div>`
  ).join('');

  nav.addEventListener('click', e => {
    const l = e.target.dataset.letter;
    if (l) scrollToLetter(l);
  });

  /* Touch drag along the strip */
  let dragging = false;
  nav.addEventListener('touchstart', e => { dragging = true; handleAlphaTouch(e); }, { passive: true });
  nav.addEventListener('touchmove',  e => { if (dragging) handleAlphaTouch(e); }, { passive: true });
  nav.addEventListener('touchend',   () => {
    dragging = false;
    document.querySelectorAll('.alpha-letter').forEach(el => el.classList.remove('active-touch'));
  });
}

function handleAlphaTouch(e) {
  const touch = e.touches[0];
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  if (el?.dataset.letter) {
    document.querySelectorAll('.alpha-letter').forEach(x => x.classList.remove('active-touch'));
    el.classList.add('active-touch');
    scrollToLetter(el.dataset.letter);
  }
}

function updateAlphaNav(activeLetters) {
  document.querySelectorAll('.alpha-letter').forEach(el => {
    if (activeLetters.includes(el.dataset.letter)) {
      el.classList.remove('dim');
    } else {
      el.classList.add('dim');
    }
  });
}

function scrollToLetter(letter) {
  const id = letter === '#' ? 'HASH' : letter;
  const section = document.getElementById(`section-${id}`);
  if (!section) return;
  const container = document.getElementById('book-list-container');
  container.scrollTo({ top: section.offsetTop - 2, behavior: 'smooth' });
  flashLetterIndicator(letter);
}

function flashLetterIndicator(letter) {
  const el = document.getElementById('letter-indicator');
  el.textContent = letter;
  el.classList.remove('hidden', 'fade');
  clearTimeout(indicatorTimer);
  indicatorTimer = setTimeout(() => {
    el.classList.add('fade');
    setTimeout(() => el.classList.add('hidden'), 260);
  }, 600);
}

/* ════════════════════════════
   Search
════════════════════════════ */
function setupSearch() {
  const input = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear');

  input.addEventListener('input', () => {
    searchQuery = input.value.trim();
    clearBtn.classList.toggle('hidden', !searchQuery);
    renderLibrary();
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    searchQuery = '';
    clearBtn.classList.add('hidden');
    renderLibrary();
    input.focus();
  });
}

/* ════════════════════════════
   Scanner
   Tries native BarcodeDetector first (iOS 17+, hardware-accelerated),
   falls back to html5-qrcode for older devices.
════════════════════════════ */
let nativeStream    = null;
let nativeScanLoop  = false;

async function startScanner() {
  if (nativeStream || html5QrCode?.isScanning) return;
  if (await startNativeScanner()) return;
  await startFallbackScanner();
}

/* ── Native BarcodeDetector (fast path) ── */
async function startNativeScanner() {
  if (!('BarcodeDetector' in window)) return false;

  try {
    const supported = await BarcodeDetector.getSupportedFormats();
    const wanted    = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];
    const formats   = wanted.filter(f => supported.includes(f));
    if (!formats.includes('ean_13')) return false;

    nativeStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: 1920 },
        height: { ideal: 1080 },
      }
    });

    const readerDiv = document.getElementById('qr-reader');
    readerDiv.innerHTML = '';
    const video = Object.assign(document.createElement('video'), {
      playsInline: true, muted: true, autoplay: true,
    });
    video.style.cssText = 'width:100%;height:auto;display:block;';
    video.srcObject = nativeStream;
    readerDiv.appendChild(video);
    await video.play();

    const detector = new BarcodeDetector({ formats });
    nativeScanLoop  = true;

    const tick = async () => {
      if (!nativeScanLoop) return;
      try {
        if (video.readyState >= 2) {
          const hits = await detector.detect(video);
          if (hits.length) { await onScanSuccess(hits[0].rawValue); return; }
        }
      } catch (_) {}
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return true;

  } catch (err) {
    console.warn('Native BarcodeDetector failed:', err);
    stopNativeStream();
    return false;
  }
}

function stopNativeStream() {
  nativeScanLoop = false;
  if (nativeStream) {
    nativeStream.getTracks().forEach(t => t.stop());
    nativeStream = null;
    document.getElementById('qr-reader').innerHTML = '';
  }
}

/* ── html5-qrcode fallback ── */
async function startFallbackScanner() {
  html5QrCode = new Html5Qrcode('qr-reader', { verbose: false });
  const config = {
    fps: 15,
    qrbox: (w) => ({ width: Math.min(280, Math.floor(w * 0.78)), height: 90 }),
    formatsToSupport: [
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.CODE_128,
    ],
  };
  try {
    await html5QrCode.start({ facingMode: 'environment' }, config, onScanSuccess, () => {});
  } catch (err) {
    console.warn('Fallback scanner failed:', err);
    document.getElementById('scanner-message').textContent =
      'Camera unavailable — enter the ISBN below instead.';
  }
}

async function stopScanner() {
  stopNativeStream();
  if (html5QrCode?.isScanning) {
    try { await html5QrCode.stop(); } catch (_) {}
  }
}

async function onScanSuccess(raw) {
  if (isLookingUp) return;
  isLookingUp = true;
  await stopScanner();
  document.getElementById('scanner-message').textContent = 'Looking up book…';
  await lookupAndShowBook(raw);
}

/* ════════════════════════════
   ISBN Lookup
════════════════════════════ */
function setupScannerISBNInput() {
  const input  = document.getElementById('isbn-manual');
  const button = document.getElementById('isbn-lookup-btn');

  button.addEventListener('click', async () => {
    const val = input.value.trim();
    if (!val) return;
    await stopScanner();
    isLookingUp = true;
    await lookupAndShowBook(val);
  });

  input.addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      const val = input.value.trim();
      if (!val) return;
      await stopScanner();
      isLookingUp = true;
      await lookupAndShowBook(val);
    }
  });
}

async function lookupAndShowBook(raw) {
  const isbn = raw.replace(/[^0-9X]/gi, '');

  if (books.find(b => b.isbn === isbn)) {
    showToast('Already in your library!');
    resumeScanner();
    return;
  }

  showPreviewLoading();

  try {
    const book = await fetchByISBN(isbn);
    if (book) {
      pendingBook = book;
      showPreviewContent(book);
    } else {
      hidePreviewModal();
      showToast('Book not found — try adding manually.');
      resumeScanner();
    }
  } catch (err) {
    console.error(err);
    hidePreviewModal();
    showToast('Network error. Check your connection.');
    resumeScanner();
  }
}

async function fetchByISBN(isbn) {
  /* Google Books (primary) */
  try {
    const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    const d = await r.json();
    if (d.items?.length) {
      const v = d.items[0].volumeInfo;
      return {
        id:          Date.now().toString(),
        title:       v.title || 'Unknown Title',
        author:      v.authors?.join(', ') || '',
        isbn,
        cover:       (v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail || '')
                       .replace('http:', 'https:')
                       .replace('zoom=1', 'zoom=2'),
        year:        (v.publishedDate || '').slice(0, 4),
        publisher:   v.publisher || '',
        description: v.description || '',
        addedDate:   new Date().toISOString(),
      };
    }
  } catch (_) {}

  /* Open Library (fallback) */
  try {
    const r = await fetch(`https://openlibrary.org/isbn/${isbn}.json`);
    if (r.ok) {
      const d = await r.json();
      let author = '';
      if (d.authors?.[0]?.key) {
        try {
          const ar = await fetch(`https://openlibrary.org${d.authors[0].key}.json`);
          const ad = await ar.json();
          author = ad.name || '';
        } catch (_) {}
      }
      return {
        id:          Date.now().toString(),
        title:       d.title || 'Unknown Title',
        author,
        isbn,
        cover:       `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg`,
        year:        (d.publish_date || '').replace(/\D.*/, ''),
        publisher:   d.publishers?.[0] || '',
        description: '',
        addedDate:   new Date().toISOString(),
      };
    }
  } catch (_) {}

  return null;
}

function resumeScanner() {
  isLookingUp = false;
  if (currentView === 'scanner') {
    document.getElementById('scanner-message').textContent =
      'Point camera at the barcode on the back of a book';
    setTimeout(startScanner, 800);
  }
}

/* ════════════════════════════
   Preview Modal
════════════════════════════ */
function setupPreviewModal() {
  document.getElementById('preview-add-btn').addEventListener('click', () => {
    if (!pendingBook) return;
    const book = pendingBook;
    pendingBook = null;
    addBook(book);
    hidePreviewModal();
    showToast(`"${book.title}" added!`);
    switchView('library');
  });

  document.getElementById('preview-cancel-btn').addEventListener('click', () => {
    pendingBook = null;
    hidePreviewModal();
    resumeScanner();
  });

  document.getElementById('book-preview-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) {
      pendingBook = null;
      hidePreviewModal();
      resumeScanner();
    }
  });
}

function showPreviewLoading() {
  const modal = document.getElementById('book-preview-modal');
  document.getElementById('preview-loading').classList.remove('hidden');
  document.getElementById('preview-content').classList.add('hidden');
  modal.classList.remove('hidden');
}

function showPreviewContent(book) {
  document.getElementById('preview-loading').classList.add('hidden');

  const content = document.getElementById('preview-content');
  content.classList.remove('hidden');

  document.getElementById('preview-title').textContent  = book.title;
  document.getElementById('preview-author').textContent = book.author || 'Unknown Author';
  document.getElementById('preview-year').textContent   = book.year ? `Published ${book.year}` : '';

  const img      = document.getElementById('preview-cover');
  const fallback = document.getElementById('preview-cover-fallback');
  const letter   = getSortKey(book.title)[0]?.toUpperCase() || '?';

  fallback.textContent = letter;

  if (book.cover) {
    img.src = book.cover;
    img.style.display = 'block';
    fallback.style.display = 'none';
    img.onerror = () => { img.style.display = 'none'; fallback.style.display = 'flex'; };
  } else {
    img.style.display = 'none';
    fallback.style.display = 'flex';
  }
}

function hidePreviewModal() {
  document.getElementById('book-preview-modal').classList.add('hidden');
}

/* ════════════════════════════
   Detail Modal
════════════════════════════ */
function setupDetailModal() {
  document.getElementById('detail-close-btn').addEventListener('click', () => {
    document.getElementById('book-detail-modal').classList.add('hidden');
  });

  document.getElementById('detail-delete-btn').addEventListener('click', () => {
    const id = document.getElementById('book-detail-modal').dataset.bookId;
    if (!id) return;
    const book = books.find(b => b.id === id);
    if (!book) return;
    if (!confirm(`Remove "${book.title}" from your library?`)) return;
    removeBook(id);
    document.getElementById('book-detail-modal').classList.add('hidden');
  });

  document.getElementById('book-detail-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) {
      e.currentTarget.classList.add('hidden');
    }
  });
}

function showBookDetail(id) {
  const book = books.find(b => b.id === id);
  if (!book) return;

  const modal = document.getElementById('book-detail-modal');
  modal.dataset.bookId = id;

  /* Cover */
  const img      = document.getElementById('detail-cover');
  const fallback = document.getElementById('detail-cover-fallback');
  const letter   = getSortKey(book.title)[0]?.toUpperCase() || '?';

  fallback.textContent = letter;

  if (book.cover) {
    img.src = book.cover;
    img.style.display = 'block';
    fallback.style.display = 'none';
    img.onerror = () => { img.style.display = 'none'; fallback.style.display = 'flex'; };
  } else {
    img.style.display = 'none';
    fallback.style.display = 'flex';
  }

  document.getElementById('detail-title').textContent  = book.title;
  document.getElementById('detail-author').textContent = book.author || '';

  /* Meta pills */
  const metaItems = [];
  if (book.year)      metaItems.push({ label: 'Year',      value: book.year });
  if (book.publisher) metaItems.push({ label: 'Publisher', value: book.publisher });
  if (book.isbn)      metaItems.push({ label: 'ISBN',      value: book.isbn });

  document.getElementById('detail-meta').innerHTML = metaItems.map(m => `
    <div class="meta-item">
      <div class="meta-label">${escHtml(m.label)}</div>
      <div class="meta-value">${escHtml(m.value)}</div>
    </div>`).join('');

  document.getElementById('detail-description').textContent = book.description || '';

  modal.classList.remove('hidden');
}

/* ════════════════════════════
   Manual Add Form
════════════════════════════ */
function setupManualAdd() {
  document.getElementById('manual-add-form').addEventListener('submit', e => {
    e.preventDefault();

    const title     = document.getElementById('input-title').value.trim();
    const author    = document.getElementById('input-author').value.trim();
    const year      = document.getElementById('input-year').value.trim();
    const isbn      = document.getElementById('input-isbn').value.trim().replace(/[^0-9X]/gi, '');
    const publisher = document.getElementById('input-publisher').value.trim();

    if (!title)  { highlight('input-title');  return; }
    if (!author) { highlight('input-author'); return; }

    /* If ISBN provided and already owned */
    if (isbn && books.find(b => b.isbn === isbn)) {
      showToast('That ISBN is already in your library.');
      return;
    }

    const book = {
      id:          Date.now().toString(),
      title,
      author,
      isbn,
      cover:       isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg` : '',
      year,
      publisher,
      description: '',
      addedDate:   new Date().toISOString(),
    };

    addBook(book);
    showToast(`"${title}" added!`);
    document.getElementById('manual-add-form').reset();
    switchView('library');
  });
}

function highlight(id) {
  const el = document.getElementById(id);
  el.classList.add('invalid');
  el.focus();
  el.addEventListener('input', () => el.classList.remove('invalid'), { once: true });
}

/* ════════════════════════════
   CRUD
════════════════════════════ */
function addBook(book) {
  books.push(book);
  persist();
  renderLibrary();
}

function removeBook(id) {
  books = books.filter(b => b.id !== id);
  persist();
  renderLibrary();
  showToast('Removed from library.');
}

function persist() {
  localStorage.setItem('bt_books', JSON.stringify(books));
}

/* ════════════════════════════
   Toast
════════════════════════════ */
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden', 'fade');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add('fade');
    setTimeout(() => el.classList.add('hidden'), 320);
  }, 2600);
}

/* ════════════════════════════
   Utilities
════════════════════════════ */
function escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
