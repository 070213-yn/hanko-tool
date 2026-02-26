// 複数画像対応 二値化ツール

(function () {
  'use strict';

  // 画像データを管理する配列
  const images = [];
  let nextId = 1;

  document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');

    // ファイル選択（複数対応）
    fileInput.addEventListener('change', (e) => {
      _handleFiles(e.target.files);
      fileInput.value = ''; // リセットして同じファイルを再選択可能に
    });

    // ドラッグ&ドロップ
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      _handleFiles(e.dataTransfer.files);
    });
    dropZone.addEventListener('click', () => fileInput.click());

    // 画像追加ボタン
    document.getElementById('btn-add-more').addEventListener('click', () => {
      fileInput.click();
    });

    // 全て自動しきい値
    document.getElementById('btn-auto-all').addEventListener('click', () => {
      images.forEach(img => {
        const threshold = _otsuThreshold(img.originalImageData);
        img.threshold = threshold;
        _applyBinarize(img);
        _updateSliderUI(img);
      });
    });

    // 一括ダウンロード（ZIP）
    document.getElementById('btn-download-all').addEventListener('click', _downloadAllAsZip);
  });

  // 複数ファイルを処理
  function _handleFiles(fileList) {
    const imageFiles = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    imageFiles.forEach(file => _loadImage(file));
  }

  // 1枚の画像を読み込んで追加
  function _loadImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // 元画像のキャンバスを作成
        const origCanvas = document.createElement('canvas');
        origCanvas.width = img.width;
        origCanvas.height = img.height;
        const origCtx = origCanvas.getContext('2d');
        origCtx.drawImage(img, 0, 0);
        const imageData = origCtx.getImageData(0, 0, img.width, img.height);

        // プレビューキャンバスを作成
        const prevCanvas = document.createElement('canvas');
        prevCanvas.width = img.width;
        prevCanvas.height = img.height;

        // 自動しきい値を計算
        const threshold = _otsuThreshold(imageData);

        // 画像オブジェクトを作成
        const imageObj = {
          id: nextId++,
          fileName: file.name,
          originalImageData: imageData,
          originalCanvas: origCanvas,
          previewCanvas: prevCanvas,
          threshold: threshold,
          width: img.width,
          height: img.height,
        };

        // 二値化を適用
        _applyBinarize(imageObj);

        // 配列に追加
        images.push(imageObj);

        // UIにカードを追加
        _renderCard(imageObj);
        _updateToolbar();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // 画像カードをDOMに追加
  function _renderCard(imageObj) {
    const list = document.getElementById('image-list');

    const card = document.createElement('div');
    card.className = 'image-card';
    card.id = `card-${imageObj.id}`;

    card.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-sm font-semibold text-gray-700 truncate">${_escapeHtml(imageObj.fileName)}</span>
          <span class="text-xs text-gray-400">${imageObj.width} x ${imageObj.height}px</span>
        </div>
        <button class="btn-sm btn-remove" data-action="remove" data-id="${imageObj.id}">
          <svg viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd"/></svg>
          削除
        </button>
      </div>
      <div class="flex gap-3 mb-3" style="flex-direction: ${window.innerWidth < 640 ? 'column' : 'row'};">
        <div class="flex-1 min-w-0">
          <div class="text-xs font-medium text-gray-400 mb-1">元画像</div>
          <div class="preview-wrap" id="orig-wrap-${imageObj.id}"></div>
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-xs font-medium text-gray-400 mb-1">二値化後（白=透明）</div>
          <div class="preview-wrap" id="prev-wrap-${imageObj.id}"></div>
        </div>
      </div>
      <div class="flex items-center gap-3 flex-wrap">
        <label class="text-xs font-medium text-gray-500 whitespace-nowrap">しきい値:</label>
        <input type="range" id="slider-${imageObj.id}" min="0" max="255" value="${imageObj.threshold}"
               class="flex-1 min-w-[100px] cursor-pointer">
        <span id="val-${imageObj.id}" class="text-xs font-mono text-gray-600 w-7 text-right">${imageObj.threshold}</span>
        <button class="btn-sm btn-auto" data-action="auto" data-id="${imageObj.id}">自動</button>
        <button class="btn-sm btn-dl" data-action="download" data-id="${imageObj.id}">
          <svg viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5"><path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z"/><path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z"/></svg>
          PNG
        </button>
      </div>
    `;

    list.appendChild(card);

    // キャンバスをDOMに挿入
    document.getElementById(`orig-wrap-${imageObj.id}`).appendChild(imageObj.originalCanvas);
    document.getElementById(`prev-wrap-${imageObj.id}`).appendChild(imageObj.previewCanvas);

    // イベント: しきい値スライダー
    const slider = document.getElementById(`slider-${imageObj.id}`);
    slider.addEventListener('input', () => {
      imageObj.threshold = parseInt(slider.value);
      document.getElementById(`val-${imageObj.id}`).textContent = imageObj.threshold;
      _applyBinarize(imageObj);
    });

    // イベント: ボタン（イベント委譲）
    card.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const id = parseInt(btn.dataset.id);

      if (action === 'auto') {
        const img = images.find(i => i.id === id);
        if (img) {
          img.threshold = _otsuThreshold(img.originalImageData);
          _applyBinarize(img);
          _updateSliderUI(img);
        }
      } else if (action === 'download') {
        const img = images.find(i => i.id === id);
        if (img) _downloadSingle(img);
      } else if (action === 'remove') {
        _removeImage(id);
      }
    });
  }

  // スライダーUIを更新
  function _updateSliderUI(imageObj) {
    const slider = document.getElementById(`slider-${imageObj.id}`);
    const valEl = document.getElementById(`val-${imageObj.id}`);
    if (slider) slider.value = imageObj.threshold;
    if (valEl) valEl.textContent = imageObj.threshold;
  }

  // 画像を削除
  function _removeImage(id) {
    const idx = images.findIndex(i => i.id === id);
    if (idx === -1) return;
    images.splice(idx, 1);

    const card = document.getElementById(`card-${id}`);
    if (card) {
      card.style.transition = 'opacity 0.2s, transform 0.2s';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.95)';
      setTimeout(() => card.remove(), 200);
    }

    setTimeout(() => _updateToolbar(), 220);
  }

  // ツールバーの表示更新
  function _updateToolbar() {
    const toolbar = document.getElementById('toolbar');
    const dropZone = document.getElementById('drop-zone');
    const countEl = document.getElementById('image-count');
    const dlBtn = document.getElementById('btn-download-all');

    if (images.length > 0) {
      toolbar.style.display = 'flex';
      dropZone.style.display = 'none';
      countEl.textContent = `${images.length}枚の画像`;
      dlBtn.disabled = false;
    } else {
      toolbar.style.display = 'none';
      dropZone.style.display = '';
      dlBtn.disabled = true;
    }
  }

  // 1枚ダウンロード
  function _downloadSingle(imageObj) {
    const dataURL = imageObj.previewCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = _makeFileName(imageObj.fileName);
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // 一括ダウンロード（ZIP）
  async function _downloadAllAsZip() {
    if (images.length === 0) return;

    const btn = document.getElementById('btn-download-all');
    const origText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span> 作成中...';

    try {
      const zip = new JSZip();

      for (const img of images) {
        // Canvas → Blob に変換
        const blob = await new Promise(resolve => {
          img.previewCanvas.toBlob(resolve, 'image/png');
        });
        zip.file(_makeFileName(img.fileName), blob);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const zipName = `二値化_${y}_${m}_${d}.zip`;

      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.download = zipName;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('ZIPエクスポートエラー:', e);
      alert('ZIPファイルの作成に失敗しました。個別にダウンロードしてください。');
    } finally {
      btn.disabled = false;
      btn.innerHTML = origText;
    }
  }

  // ファイル名を生成（拡張子をpngに変換）
  function _makeFileName(originalName) {
    const baseName = originalName.replace(/\.[^.]+$/, '');
    return `${baseName}_二値化.png`;
  }

  // HTMLエスケープ
  function _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // === 二値化処理 ===

  // 大津の方法でしきい値を計算
  function _otsuThreshold(imageData) {
    const data = imageData.data;
    const histogram = new Array(256).fill(0);
    const total = imageData.width * imageData.height;

    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      histogram[gray]++;
    }

    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * histogram[i];

    let sumB = 0, wB = 0, maxVariance = 0, threshold = 0;

    for (let t = 0; t < 256; t++) {
      wB += histogram[t];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += t * histogram[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const variance = wB * wF * (mB - mF) * (mB - mF);
      if (variance > maxVariance) {
        maxVariance = variance;
        threshold = t;
      }
    }

    return threshold;
  }

  // 二値化を適用（白→透明）
  function _applyBinarize(imageObj) {
    const src = imageObj.originalImageData.data;
    const ctx = imageObj.previewCanvas.getContext('2d');
    const output = ctx.createImageData(imageObj.width, imageObj.height);
    const dst = output.data;
    const threshold = imageObj.threshold;

    for (let i = 0; i < src.length; i += 4) {
      const gray = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
      if (gray >= threshold) {
        dst[i] = 0; dst[i + 1] = 0; dst[i + 2] = 0; dst[i + 3] = 0;
      } else {
        dst[i] = 0; dst[i + 1] = 0; dst[i + 2] = 0; dst[i + 3] = 255;
      }
    }

    ctx.putImageData(output, 0, 0);
  }

})();
