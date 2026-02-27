// 複数画像対応 二値化ツール（ノイズ除去・消しゴム付き）

(function () {
  'use strict';

  const images = [];
  let nextId = 1;

  document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');

    fileInput.addEventListener('change', (e) => {
      _handleFiles(e.target.files);
      fileInput.value = '';
    });

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

    document.getElementById('btn-add-more').addEventListener('click', () => fileInput.click());

    document.getElementById('btn-auto-all').addEventListener('click', () => {
      images.forEach(img => {
        img.threshold = _otsuThreshold(img.originalImageData);
        _applyAll(img);
        _updateSliderUI(img);
      });
    });

    document.getElementById('btn-download-all').addEventListener('click', _downloadAllAsZip);

    document.getElementById('btn-place-to-editor').addEventListener('click', _placeToEditor);
  });

  function _handleFiles(fileList) {
    const imageFiles = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    imageFiles.forEach(file => _loadImage(file));
  }

  function _loadImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const origCanvas = document.createElement('canvas');
        origCanvas.width = img.width;
        origCanvas.height = img.height;
        const origCtx = origCanvas.getContext('2d');
        origCtx.drawImage(img, 0, 0);
        const imageData = origCtx.getImageData(0, 0, img.width, img.height);

        const prevCanvas = document.createElement('canvas');
        prevCanvas.width = img.width;
        prevCanvas.height = img.height;

        const threshold = _otsuThreshold(imageData);

        const imageObj = {
          id: nextId++,
          fileName: file.name,
          originalImageData: imageData,
          originalCanvas: origCanvas,
          previewCanvas: prevCanvas,
          threshold: threshold,
          width: img.width,
          height: img.height,
          eraserActive: false,
          eraserSize: 20,
          noiseSize: 5,
        };

        _applyBinarize(imageObj);
        if (imageObj.noiseSize > 1) _removeNoise(imageObj);
        images.push(imageObj);
        _renderCard(imageObj);
        _updateToolbar();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // === カード描画 ===
  function _renderCard(imageObj) {
    const list = document.getElementById('image-list');
    const card = document.createElement('div');
    card.className = 'image-card';
    card.id = `card-${imageObj.id}`;

    card.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-sm font-semibold text-gray-700 truncate">${_escapeHtml(imageObj.fileName)}</span>
          <span class="text-xs text-gray-400" id="size-${imageObj.id}">${imageObj.width} x ${imageObj.height}px</span>
        </div>
        <div class="flex items-center gap-1.5">
          <button class="btn-sm btn-rotate" data-action="rotate" data-id="${imageObj.id}" title="90度回転">
            <svg viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5"><path fill-rule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.598a.75.75 0 00-.75.75v3.634a.75.75 0 001.5 0v-2.033l.312.311a7 7 0 0011.712-3.138.75.75 0 00-1.06-.179zm-1.624-7.848a7 7 0 00-11.712 3.138.75.75 0 001.06.179 5.5 5.5 0 019.201-2.466l.312.311H10.117a.75.75 0 000 1.5h3.634a.75.75 0 00.75-.75V1.854a.75.75 0 00-1.5 0v2.033l-.312-.311z" clip-rule="evenodd"/></svg>
            回転
          </button>
          <button class="btn-sm btn-remove" data-action="remove" data-id="${imageObj.id}">
            <svg viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd"/></svg>
            削除
          </button>
        </div>
      </div>
      <div class="flex gap-3 mb-3" style="flex-direction: ${window.innerWidth < 640 ? 'column' : 'row'};">
        <div class="flex-1 min-w-0">
          <div class="text-xs font-medium text-gray-400 mb-1">元画像</div>
          <div class="preview-wrap" id="orig-wrap-${imageObj.id}"></div>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs font-medium text-gray-400">二値化後</span>
            <button class="eraser-toggle" id="eraser-btn-${imageObj.id}" data-action="toggle-eraser" data-id="${imageObj.id}" title="消しゴムモード">
              <svg viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5"><path d="M8.106 4.086a1.5 1.5 0 012.122 0l4.688 4.686a1.5 1.5 0 010 2.122L9.728 16.08a1.5 1.5 0 01-1.06.44H5.106a1.5 1.5 0 01-1.06-.44L2.106 14.14a1.5 1.5 0 010-2.122L8.106 4.086z"/></svg>
              消しゴム
            </button>
          </div>
          <div class="preview-wrap eraser-canvas-wrap" id="prev-wrap-${imageObj.id}"></div>
          <div class="eraser-controls" id="eraser-controls-${imageObj.id}" style="display:none;">
            <label class="text-xs text-gray-500">サイズ:</label>
            <input type="range" id="eraser-size-${imageObj.id}" min="5" max="100" value="${imageObj.eraserSize}" class="eraser-size-slider">
            <span id="eraser-size-val-${imageObj.id}" class="text-xs font-mono text-gray-500 w-6 text-right">${imageObj.eraserSize}</span>
          </div>
        </div>
      </div>
      <div class="controls-row">
        <div class="flex items-center gap-3 flex-wrap flex-1">
          <label class="text-xs font-medium text-gray-500 whitespace-nowrap">しきい値:</label>
          <input type="range" id="slider-${imageObj.id}" min="0" max="255" value="${imageObj.threshold}"
                 class="flex-1 min-w-[80px] cursor-pointer">
          <span id="val-${imageObj.id}" class="text-xs font-mono text-gray-600 w-7 text-right">${imageObj.threshold}</span>
          <button class="btn-sm btn-auto" data-action="auto" data-id="${imageObj.id}">自動</button>
        </div>
        <div class="controls-divider"></div>
        <div class="flex items-center gap-2 flex-wrap">
          <label class="text-xs font-medium text-gray-500 whitespace-nowrap">ノイズ除去:</label>
          <input type="range" id="noise-${imageObj.id}" min="0" max="50" value="${imageObj.noiseSize}"
                 class="cursor-pointer noise-slider">
          <span id="noise-val-${imageObj.id}" class="text-xs font-mono text-gray-500 w-10 text-right">${imageObj.noiseSize}px</span>
        </div>
        <div class="controls-divider"></div>
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

    // しきい値スライダー → 二値化+ノイズ除去を同時適用
    const slider = document.getElementById(`slider-${imageObj.id}`);
    slider.addEventListener('input', () => {
      imageObj.threshold = parseInt(slider.value);
      document.getElementById(`val-${imageObj.id}`).textContent = imageObj.threshold;
      _applyAll(imageObj);
    });

    // ノイズ除去スライダー → リアルタイムで反映
    const noiseSlider = document.getElementById(`noise-${imageObj.id}`);
    noiseSlider.addEventListener('input', () => {
      imageObj.noiseSize = parseInt(noiseSlider.value);
      document.getElementById(`noise-val-${imageObj.id}`).textContent = imageObj.noiseSize + 'px';
      _applyAll(imageObj);
    });

    // 消しゴムサイズスライダー
    const eraserSizeSlider = document.getElementById(`eraser-size-${imageObj.id}`);
    eraserSizeSlider.addEventListener('input', () => {
      imageObj.eraserSize = parseInt(eraserSizeSlider.value);
      document.getElementById(`eraser-size-val-${imageObj.id}`).textContent = imageObj.eraserSize;
    });

    // 消しゴムのイベント設定
    _setupEraser(imageObj);

    // ボタンイベント（イベント委譲）
    card.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = parseInt(btn.dataset.id);

      if (action === 'auto') {
        const img = images.find(i => i.id === id);
        if (img) {
          img.threshold = _otsuThreshold(img.originalImageData);
          _applyAll(img);
          _updateSliderUI(img);
        }
      } else if (action === 'download') {
        const img = images.find(i => i.id === id);
        if (img) _downloadSingle(img);
      } else if (action === 'rotate') {
        const img = images.find(i => i.id === id);
        if (img) _rotateImage(img);
      } else if (action === 'remove') {
        _removeImage(id);
      } else if (action === 'toggle-eraser') {
        const img = images.find(i => i.id === id);
        if (img) _toggleEraser(img);
      }
    });
  }

  // === 画像回転（時計回り90度） ===

  function _rotateImage(imageObj) {
    const oldW = imageObj.width;
    const oldH = imageObj.height;
    const newW = oldH;
    const newH = oldW;

    // 元画像キャンバスを回転して新しいキャンバスを作成
    const newOrigCanvas = document.createElement('canvas');
    newOrigCanvas.width = newW;
    newOrigCanvas.height = newH;
    const ctx = newOrigCanvas.getContext('2d');

    ctx.translate(newW, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(imageObj.originalCanvas, 0, 0);

    // 新しいImageDataを取得
    const newImageData = ctx.getImageData(0, 0, newW, newH);

    // プレビューキャンバスのサイズ変更
    imageObj.previewCanvas.width = newW;
    imageObj.previewCanvas.height = newH;

    // DOMの元画像キャンバスを差し替え
    const origWrap = document.getElementById(`orig-wrap-${imageObj.id}`);
    origWrap.removeChild(imageObj.originalCanvas);
    origWrap.appendChild(newOrigCanvas);

    // imageObj を更新
    imageObj.originalCanvas = newOrigCanvas;
    imageObj.originalImageData = newImageData;
    imageObj.width = newW;
    imageObj.height = newH;

    // サイズ表示を更新
    const sizeEl = document.getElementById(`size-${imageObj.id}`);
    if (sizeEl) sizeEl.textContent = `${newW} x ${newH}px`;

    // 消しゴムモードを解除（キャンバスが変わるので）
    if (imageObj.eraserActive) {
      _toggleEraser(imageObj);
    }

    // 消しゴムイベントを再設定（新しいキャンバスに対して）
    _setupEraser(imageObj);

    // 二値化 + ノイズ除去を再適用
    _applyBinarize(imageObj);
    if (imageObj.noiseSize > 1) _removeNoise(imageObj);
  }

  // === 消しゴム ===

  function _toggleEraser(imageObj) {
    imageObj.eraserActive = !imageObj.eraserActive;
    const btn = document.getElementById(`eraser-btn-${imageObj.id}`);
    const controls = document.getElementById(`eraser-controls-${imageObj.id}`);
    const wrap = document.getElementById(`prev-wrap-${imageObj.id}`);

    if (imageObj.eraserActive) {
      btn.classList.add('active');
      controls.style.display = 'flex';
      wrap.classList.add('eraser-mode');
    } else {
      btn.classList.remove('active');
      controls.style.display = 'none';
      wrap.classList.remove('eraser-mode');
    }
  }

  function _setupEraser(imageObj) {
    const canvas = imageObj.previewCanvas;
    let isDrawing = false;

    // マウス座標 → キャンバスピクセル座標に変換
    function _getCanvasPos(e) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      let clientX, clientY;
      if (e.touches) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    }

    function _erase(e) {
      if (!imageObj.eraserActive || !isDrawing) return;
      e.preventDefault();

      const pos = _getCanvasPos(e);
      const ctx = canvas.getContext('2d');
      const r = imageObj.eraserSize * (canvas.width / canvas.getBoundingClientRect().width);

      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function _startDraw(e) {
      if (!imageObj.eraserActive) return;
      isDrawing = true;
      _erase(e);
    }

    function _stopDraw() {
      isDrawing = false;
    }

    // マウス
    canvas.addEventListener('mousedown', _startDraw);
    canvas.addEventListener('mousemove', _erase);
    canvas.addEventListener('mouseup', _stopDraw);
    canvas.addEventListener('mouseleave', _stopDraw);

    // タッチ
    canvas.addEventListener('touchstart', _startDraw, { passive: false });
    canvas.addEventListener('touchmove', _erase, { passive: false });
    canvas.addEventListener('touchend', _stopDraw);
    canvas.addEventListener('touchcancel', _stopDraw);
  }

  // === ノイズ除去（連結成分分析） ===

  function _removeNoise(imageObj) {
    const canvas = imageObj.previewCanvas;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const minSize = imageObj.noiseSize * imageObj.noiseSize;

    // 不透明ピクセルのマスクを作成 (alpha > 0 = 黒ピクセル)
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < mask.length; i++) {
      mask[i] = data[i * 4 + 3] > 0 ? 1 : 0;
    }

    // 連結成分ラベリング（4連結）
    const labels = new Int32Array(w * h);
    let labelCount = 0;
    const componentSizes = [0]; // labelCount=0は未使用

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (mask[idx] === 1 && labels[idx] === 0) {
          // 新しい連結成分をBFSで探索
          labelCount++;
          let size = 0;
          const queue = [idx];
          labels[idx] = labelCount;

          while (queue.length > 0) {
            const cur = queue.pop();
            size++;
            const cx = cur % w;
            const cy = (cur - cx) / w;

            // 上下左右を確認
            const neighbors = [];
            if (cx > 0) neighbors.push(cur - 1);
            if (cx < w - 1) neighbors.push(cur + 1);
            if (cy > 0) neighbors.push(cur - w);
            if (cy < h - 1) neighbors.push(cur + w);

            for (const n of neighbors) {
              if (mask[n] === 1 && labels[n] === 0) {
                labels[n] = labelCount;
                queue.push(n);
              }
            }
          }

          componentSizes.push(size);
        }
      }
    }

    // 小さい成分を削除
    let removed = 0;
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i];
      if (label > 0 && componentSizes[label] < minSize) {
        // 透明にする
        const pi = i * 4;
        data[pi] = 0;
        data[pi + 1] = 0;
        data[pi + 2] = 0;
        data[pi + 3] = 0;
        removed++;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // 除去した成分数を表示
    const removedComponents = componentSizes.filter((s, i) => i > 0 && s < minSize).length;
    const statusEl = document.getElementById(`noise-val-${imageObj.id}`);
    if (statusEl) {
      if (removedComponents > 0) {
        statusEl.textContent = `${imageObj.noiseSize}px (${removedComponents}個除去)`;
      } else {
        statusEl.textContent = imageObj.noiseSize + 'px';
      }
    }
  }

  // === UI更新 ===

  function _updateSliderUI(imageObj) {
    const slider = document.getElementById(`slider-${imageObj.id}`);
    const valEl = document.getElementById(`val-${imageObj.id}`);
    if (slider) slider.value = imageObj.threshold;
    if (valEl) valEl.textContent = imageObj.threshold;
  }

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

  // === 入稿シートに配置 ===

  function _placeToEditor() {
    if (images.length === 0) {
      alert('配置する画像がありません。先に画像を二値化してください。');
      return;
    }

    // 全画像のpreviewCanvasをトリミングしてdataURLに変換
    const items = images.map(img => {
      const trimmed = _trimTransparent(img.previewCanvas);
      return {
        name: _makeFileName(img.fileName),
        dataURL: trimmed.toDataURL('image/png'),
      };
    });

    try {
      const json = JSON.stringify(items);
      sessionStorage.setItem('hankodori_binarized_images', json);
      window.location.href = 'index.html';
    } catch (e) {
      console.error('sessionStorage保存エラー:', e);
      alert('画像データの転送に失敗しました。画像サイズが大きすぎる可能性があります。');
    }
  }

  // === ダウンロード ===

  function _downloadSingle(imageObj) {
    const trimmed = _trimTransparent(imageObj.previewCanvas);
    const dataURL = trimmed.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = _makeFileName(imageObj.fileName);
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function _downloadAllAsZip() {
    if (images.length === 0) return;
    const btn = document.getElementById('btn-download-all');
    const origText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span> 作成中...';

    try {
      const zip = new JSZip();
      for (const img of images) {
        const trimmed = _trimTransparent(img.previewCanvas);
        const blob = await new Promise(resolve => trimmed.toBlob(resolve, 'image/png'));
        zip.file(_makeFileName(img.fileName), blob);
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.download = `二値化_${y}_${m}_${d}.zip`;
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

  function _makeFileName(originalName) {
    const baseName = originalName.replace(/\.[^.]+$/, '');
    return `${baseName}_二値化.png`;
  }

  // === 透明部分をトリミング（描画部分だけの最小キャンバスを返す） ===
  function _trimTransparent(sourceCanvas) {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const ctx = sourceCanvas.getContext('2d');
    const data = ctx.getImageData(0, 0, w, h).data;

    let minX = w, minY = h, maxX = 0, maxY = 0;
    let hasContent = false;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const alpha = data[(y * w + x) * 4 + 3];
        if (alpha > 0) {
          hasContent = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    // 描画部分がなければ元のキャンバスをそのまま返す
    if (!hasContent) return sourceCanvas;

    const trimW = maxX - minX + 1;
    const trimH = maxY - minY + 1;
    const trimmed = document.createElement('canvas');
    trimmed.width = trimW;
    trimmed.height = trimH;
    const trimCtx = trimmed.getContext('2d');
    trimCtx.drawImage(sourceCanvas, minX, minY, trimW, trimH, 0, 0, trimW, trimH);
    return trimmed;
  }

  function _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // === 二値化 + ノイズ除去をまとめて実行（デバウンス付き） ===

  function _applyAll(imageObj) {
    // 前回のタイマーがあればキャンセル（スライダー操作中の連続呼び出しを間引く）
    if (imageObj._denoiseTimer) {
      clearTimeout(imageObj._denoiseTimer);
      imageObj._denoiseTimer = null;
    }

    // まず二値化を即座に反映（軽い処理なので）
    _applyBinarize(imageObj);

    // ノイズ除去はBFS処理が重いのでデバウンス（80ms待って実行）
    if (imageObj.noiseSize > 1) {
      imageObj._denoiseTimer = setTimeout(() => {
        _removeNoise(imageObj);
        imageObj._denoiseTimer = null;
      }, 80);
    }
  }

  // === 二値化処理 ===

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
      if (variance > maxVariance) { maxVariance = variance; threshold = t; }
    }
    return threshold;
  }

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
