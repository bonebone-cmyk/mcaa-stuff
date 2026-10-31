// Reusable "import from anything" widget: drop/choose an image (OCR), a text/CSV file, or paste text.
import { esc, icon, toast } from '../core.js';

const TESSERACT_SRC = [
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
  'https://unpkg.com/tesseract.js@5/dist/tesseract.min.js',
];

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = resolve; s.onerror = () => reject(new Error('load failed'));
    document.head.appendChild(s);
  });
}
async function ensureTesseract() {
  if (window.Tesseract) return window.Tesseract;
  for (const src of TESSERACT_SRC) {
    try { await loadScript(src); if (window.Tesseract) return window.Tesseract; } catch {}
  }
  throw new Error('Could not load the image reader. Check your internet connection, or paste the text instead.');
}

/** Upscale + grayscale + auto-invert (dark screenshots) for better OCR. */
function preprocess(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.max(1, Math.min(3, 2000 / img.width));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      let sum = 0;
      for (let i = 0; i < d.data.length; i += 4) {
        const g = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
        d.data[i] = d.data[i + 1] = d.data[i + 2] = g;
        sum += g;
      }
      const invert = sum / (d.data.length / 4) < 120;
      for (let i = 0; i < d.data.length; i += 4) {
        let g = d.data[i];
        if (invert) g = 255 - g;
        g = Math.max(0, Math.min(255, (g - 128) * 1.35 + 128)); // contrast
        d.data[i] = d.data[i + 1] = d.data[i + 2] = g;
      }
      ctx.putImageData(d, 0, 0);
      URL.revokeObjectURL(img.src);
      resolve(c);
    };
    img.onerror = () => reject(new Error('Could not open that image'));
    img.src = URL.createObjectURL(file);
  });
}

export async function ocrImage(file, onProgress) {
  const T = await ensureTesseract();
  const canvas = await preprocess(file);
  const { data } = await T.recognize(canvas, 'eng', {
    logger: (m) => { if (m.status === 'recognizing text') onProgress?.(m.progress); },
  });
  return { text: data.text || '', confidence: Math.round(data.confidence || 0) };
}

/**
 * Mount an importer into `el`.
 * opts: { placeholder, sample (string), accept, onPreview(text, meta) }
 * meta = { source: 'image'|'file'|'paste', confidence }
 */
export function mountImporter(el, { placeholder = 'Paste here…', sample = '', onPreview, extra = '', previewLabel = 'Preview import' }) {
  let meta = { source: 'paste', confidence: null };
  el.innerHTML = `
    <div class="col" style="gap:12px">
      <label class="drop" tabindex="0">
        <input type="file" accept="image/*,.txt,.csv,.tsv,text/plain,text/csv" multiple hidden>
        ${icon('upload')}
        <div class="bold" style="color:var(--text)">Drop a screenshot, photo, CSV or text file</div>
        <div class="small">or click to choose · you can also paste text (or an image with Ctrl/⌘+V) below</div>
      </label>
      <div class="ocr-status hide"><div class="row between small"><span data-ocr-label>Reading image…</span><span data-ocr-pct>0%</span></div><div class="progress mt" style="margin-top:6px"><div style="width:0%"></div></div></div>
      <div data-ocr-note></div>
      <textarea rows="10" placeholder="${esc(placeholder)}" spellcheck="false"></textarea>
      ${sample ? `<details class="small"><summary class="muted" style="cursor:pointer">Show example formats</summary><pre class="sample">${esc(sample)}</pre></details>` : ''}
      ${extra}
      <div class="row wrap"><button class="btn primary" data-preview>${icon('eye')} ${previewLabel}</button><button class="btn ghost" data-clear>Clear</button></div>
    </div>`;
  const ta = el.querySelector('textarea');
  const fileIn = el.querySelector('input[type=file]');
  const drop = el.querySelector('.drop');
  const status = el.querySelector('.ocr-status');
  const note = el.querySelector('[data-ocr-note]');

  async function handleFiles(files) {
    const texts = [];
    let confs = [];
    for (const f of files) {
      if (f.type.startsWith('image/')) {
        status.classList.remove('hide');
        el.querySelector('[data-ocr-label]').textContent = `Reading ${f.name || 'image'}…`;
        try {
          const r = await ocrImage(f, (p) => {
            el.querySelector('[data-ocr-pct]').textContent = Math.round(p * 100) + '%';
            status.querySelector('.progress > div').style.width = Math.round(p * 100) + '%';
          });
          texts.push(r.text.trim());
          confs.push(r.confidence);
        } catch (e) {
          note.innerHTML = `<div class="callout err">${icon('warn')}<div>${esc(e.message)}</div></div>`;
        } finally { status.classList.add('hide'); }
      } else {
        texts.push((await f.text()).trim());
      }
    }
    if (!texts.length) return;
    ta.value = (ta.value.trim() ? ta.value.trim() + '\n' : '') + texts.join('\n');
    if (confs.length) {
      const c = Math.round(confs.reduce((a, b) => a + b, 0) / confs.length);
      meta = { source: 'image', confidence: c };
      note.innerHTML = c < 60
        ? `<div class="callout warn">${icon('warn')}<div><b>I'm having a hard time reading this image</b> (clarity ${c}%). Please upload another version — a sharper screenshot, a tighter crop, or a higher-resolution image — or paste the schedule as text. You can also fix the text below by hand.</div></div>`
        : `<div class="callout ok">${icon('check')}<div>Read the image (clarity ${c}%). Double-check the text below, fix anything that looks off, then preview.</div></div>`;
    } else {
      meta = { source: 'file', confidence: null };
      note.innerHTML = '';
    }
    onPreview?.(ta.value, meta);
  }

  fileIn.addEventListener('change', () => { handleFiles([...fileIn.files]); fileIn.value = ''; });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); handleFiles([...e.dataTransfer.files]); });
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); } });
  ta.addEventListener('paste', (e) => {
    const imgs = [...(e.clipboardData?.items || [])].filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile());
    if (imgs.length) { e.preventDefault(); handleFiles(imgs); }
  });
  ta.addEventListener('input', () => { if (meta.source === 'image') meta = { ...meta, edited: true }; });
  el.querySelector('[data-preview]').addEventListener('click', () => {
    if (!ta.value.trim()) return toast('Add an image, a file, or paste some text first', 'err');
    onPreview?.(ta.value, meta);
  });
  el.querySelector('[data-clear]').addEventListener('click', () => { ta.value = ''; note.innerHTML = ''; meta = { source: 'paste', confidence: null }; onPreview?.('', meta); });
  return { get text() { return ta.value; }, set text(v) { ta.value = v; } };
}

/** Standard "please send another version" callout used by parsers when the result looks unreliable. */
export function anotherVersionCallout(reason) {
  return `<div class="callout warn">${icon('warn')}<div><b>I couldn't confidently read this.</b> ${reason}<br>
    Please upload <b>another version</b>: a clearer/cropped screenshot, a CSV/spreadsheet export, or paste it as plain text (one game per line, like <span class="kbd">Week 1: Team A @ Team B 7:00 PM</span>).</div></div>`;
}
