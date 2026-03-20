// 複数画像対応 二値化ツール（ペン・消しゴム・投げ縄・ノイズ除去・PSD書出し付き）

(function () {
  'use strict';

  const images = [];
  let nextId = 1;
  let selectedImageId = null; // 現在選択中の画像ID

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
        if (img.applied) return; // 変更適用済みはスキップ
        img.threshold = _otsuThreshold(img.originalImageData);
        _applyAll(img);
      });
      _syncBottomBar();
    });

    document.getElementById('btn-download-all').addEventListener('click', _downloadAllAsZip);

    document.getElementById('btn-place-to-editor').addEventListener('click', _placeToEditor);

    // PSDボタン（600DPIのみ、上限超えは分割）
    document.getElementById('btn-psd-600').addEventListener('click', () => _downloadPSD600());

    // 下部バーのスライダーイベント
    _setupBottomBar();
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
          penActive: false,
          lassoActive: false,
          toolSize: 20,
          noiseSize: 5,
          applied: false, // 変更適用済みフラグ
          memo: '',  // メモ（入稿ツールに転送される）
          undoStack: [],  // アンドゥ用スナップショット
          redoStack: [],  // リドゥ用スナップショット
        };

        _applyBinarize(imageObj);
        if (imageObj.noiseSize > 1) _removeNoise(imageObj);
        images.push(imageObj);
        _renderCard(imageObj);
        _updateToolbar();

        // 画像が1枚の場合は自動選択
        if (images.length === 1) {
          _selectImage(imageObj.id);
        }
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
            <button class="pen-toggle" id="pen-btn-${imageObj.id}" data-action="toggle-pen" data-id="${imageObj.id}" title="ペンモード">
              <svg viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5"><path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z"/></svg>
              ペン
            </button>
            <button class="eraser-toggle" id="eraser-btn-${imageObj.id}" data-action="toggle-eraser" data-id="${imageObj.id}" title="消しゴムモード">
              <svg viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5"><path d="M8.106 4.086a1.5 1.5 0 012.122 0l4.688 4.686a1.5 1.5 0 010 2.122L9.728 16.08a1.5 1.5 0 01-1.06.44H5.106a1.5 1.5 0 01-1.06-.44L2.106 14.14a1.5 1.5 0 010-2.122L8.106 4.086z"/></svg>
              消しゴム
            </button>
            <button class="lasso-toggle" id="lasso-btn-${imageObj.id}" data-action="toggle-lasso" data-id="${imageObj.id}" title="投げ縄モード">
              <svg viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12z" clip-rule="evenodd"/></svg>
              投げ縄
            </button>
          </div>
          <div class="preview-wrap eraser-canvas-wrap" id="prev-wrap-${imageObj.id}" style="position:relative;">
            <div class="tool-cursor" id="tool-cursor-${imageObj.id}"></div>
            <div class="size-indicator" id="size-indicator-${imageObj.id}">
              <div class="size-indicator-circle" id="size-indicator-circle-${imageObj.id}"></div>
              <div class="size-indicator-text" id="size-indicator-text-${imageObj.id}"></div>
            </div>
          </div>
          <div style="margin-top:6px;">
            <button class="btn-sm btn-apply" data-action="apply" data-id="${imageObj.id}">
              <svg viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5"><path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd"/></svg>
              変更適用
            </button>
            <span class="text-xs text-gray-400 ml-2" id="apply-hint-${imageObj.id}">ペン/消しゴム編集後は「変更適用」を押してから閾値を変更してください</span>
          </div>
        </div>
      </div>
      <div style="margin-top:6px; display:flex; align-items:center; gap:6px;">
        <span class="text-xs text-gray-400 font-medium" style="white-space:nowrap;">メモ:</span>
        <input type="text" class="memo-input" id="memo-input-${imageObj.id}" data-id="${imageObj.id}"
          placeholder="メモを入力..." value="${_escapeHtml(imageObj.memo)}"
          style="flex:1; padding:4px 8px; font-size:12px; border:1px solid rgba(0,0,0,0.1); border-radius:6px; outline:none; background:rgba(255,255,255,0.6); font-family:'Noto Sans JP',sans-serif;">
      </div>
      <div class="controls-row" style="display:none;">
      </div>
    `;

    list.appendChild(card);

    // キャンバスをDOMに挿入
    document.getElementById(`orig-wrap-${imageObj.id}`).appendChild(imageObj.originalCanvas);
    document.getElementById(`prev-wrap-${imageObj.id}`).appendChild(imageObj.previewCanvas);

    // 投げ縄用オーバーレイcanvasを作成
    const lassoCanvas = document.createElement('canvas');
    lassoCanvas.width = imageObj.width;
    lassoCanvas.height = imageObj.height;
    lassoCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    lassoCanvas.id = `lasso-canvas-${imageObj.id}`;
    document.getElementById(`prev-wrap-${imageObj.id}`).appendChild(lassoCanvas);
    imageObj.lassoCanvas = lassoCanvas;

    // ツールイベントの設定
    _setupDrawingTools(imageObj);

    // メモ入力イベント
    const memoInput = card.querySelector('.memo-input');
    if (memoInput) {
      memoInput.addEventListener('input', (e) => {
        imageObj.memo = e.target.value;
      });
      // クリック時にカード選択を防止
      memoInput.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    // カードクリックで選択
    card.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn) {
        const action = btn.dataset.action;
        const id = parseInt(btn.dataset.id);

        if (action === 'auto') {
          const img = images.find(i => i.id === id);
          if (img && !img.applied) {
            img.threshold = _otsuThreshold(img.originalImageData);
            _applyAll(img);
            _syncBottomBar();
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
          if (img) _activateTool(img, 'eraser');
        } else if (action === 'toggle-pen') {
          const img = images.find(i => i.id === id);
          if (img) _activateTool(img, 'pen');
        } else if (action === 'toggle-lasso') {
          const img = images.find(i => i.id === id);
          if (img) _activateTool(img, 'lasso');
        } else if (action === 'apply') {
          const img = images.find(i => i.id === id);
          if (img) _applyChanges(img);
        }
        return;
      }

      // カード自体のクリックで選択
      _selectImage(imageObj.id);
    });
  }

  // === ツール切り替え ===
  function _activateTool(imageObj, tool) {
    const wrap = document.getElementById(`prev-wrap-${imageObj.id}`);
    const penBtn = document.getElementById(`pen-btn-${imageObj.id}`);
    const eraserBtn = document.getElementById(`eraser-btn-${imageObj.id}`);
    const lassoBtn = document.getElementById(`lasso-btn-${imageObj.id}`);

    // 同じツールを押したらOFF、違うツールならそちらをON
    const wasActive = (tool === 'pen' && imageObj.penActive) ||
                      (tool === 'eraser' && imageObj.eraserActive) ||
                      (tool === 'lasso' && imageObj.lassoActive);

    // 全部OFF
    imageObj.penActive = false;
    imageObj.eraserActive = false;
    imageObj.lassoActive = false;
    penBtn.classList.remove('active');
    eraserBtn.classList.remove('active');
    lassoBtn.classList.remove('active');
    wrap.classList.remove('eraser-mode', 'pen-mode', 'lasso-mode');

    if (!wasActive) {
      // 指定ツールをON
      if (tool === 'pen') {
        imageObj.penActive = true;
        penBtn.classList.add('active');
        wrap.classList.add('pen-mode');
      } else if (tool === 'eraser') {
        imageObj.eraserActive = true;
        eraserBtn.classList.add('active');
        wrap.classList.add('eraser-mode');
      } else if (tool === 'lasso') {
        imageObj.lassoActive = true;
        lassoBtn.classList.add('active');
        wrap.classList.add('lasso-mode');
      }
    }

    // カーソル色を更新
    const cursor = document.getElementById(`tool-cursor-${imageObj.id}`);
    if (cursor) {
      cursor.style.borderColor = imageObj.penActive ? '#000' : '#f59e0b';
      cursor.style.display = 'none';
    }
  }

  // === カード選択 ===
  function _selectImage(id) {
    selectedImageId = id;

    // カードハイライト更新
    images.forEach(img => {
      const card = document.getElementById(`card-${img.id}`);
      if (card) card.classList.toggle('selected', img.id === id);
    });

    _syncBottomBar();
  }

  // === 固定下部バーの同期 ===
  function _syncBottomBar() {
    const bar = document.getElementById('bottom-bar');
    const img = images.find(i => i.id === selectedImageId);

    if (!img || images.length === 0) {
      bar.style.display = 'none';
      return;
    }

    bar.style.display = 'block';
    document.getElementById('bottom-bar-title').textContent = img.fileName;

    const thSlider = document.getElementById('bar-threshold');
    const noiseSlider = document.getElementById('bar-noise');
    const toolSlider = document.getElementById('bar-tool-size');

    thSlider.value = img.threshold;
    thSlider.disabled = img.applied;
    document.getElementById('bar-threshold-val').textContent = img.threshold;

    noiseSlider.value = img.noiseSize;
    document.getElementById('bar-noise-val').textContent = img.noiseSize + 'px';

    toolSlider.value = img.toolSize;
    document.getElementById('bar-tool-size-val').textContent = img.toolSize;

    // 下部バーのツールボタン状態を同期
    const barPen = document.getElementById('bar-pen-btn');
    const barEraser = document.getElementById('bar-eraser-btn');
    const barLasso = document.getElementById('bar-lasso-btn');
    if (barPen) barPen.classList.toggle('active', !!img.penActive);
    if (barEraser) barEraser.classList.toggle('active', !!img.eraserActive);
    if (barLasso) barLasso.classList.toggle('active', !!img.lassoActive);

    // アンドゥ/リドゥボタン状態
    const undoBtn = document.getElementById('bar-undo-btn');
    const redoBtn = document.getElementById('bar-redo-btn');
    if (undoBtn) undoBtn.disabled = img.undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = img.redoStack.length === 0;
  }

  // === 下部バースライダーイベント ===
  function _setupBottomBar() {
    const thSlider = document.getElementById('bar-threshold');
    const noiseSlider = document.getElementById('bar-noise');
    const toolSlider = document.getElementById('bar-tool-size');

    thSlider.addEventListener('input', () => {
      const img = images.find(i => i.id === selectedImageId);
      if (!img || img.applied) return;
      img.threshold = parseInt(thSlider.value);
      document.getElementById('bar-threshold-val').textContent = img.threshold;
      _applyAll(img);
    });

    noiseSlider.addEventListener('input', () => {
      const img = images.find(i => i.id === selectedImageId);
      if (!img) return;
      img.noiseSize = parseInt(noiseSlider.value);
      document.getElementById('bar-noise-val').textContent = img.noiseSize + 'px';
      _applyAll(img);
    });

    toolSlider.addEventListener('input', () => {
      const img = images.find(i => i.id === selectedImageId);
      if (!img) return;
      img.toolSize = parseInt(toolSlider.value);
      document.getElementById('bar-tool-size-val').textContent = img.toolSize;
      // 太さインジケーター表示
      _showSizeIndicator(img);
    });

    // 下部バーのツールボタンイベント
    document.getElementById('bar-pen-btn').addEventListener('click', () => {
      const img = images.find(i => i.id === selectedImageId);
      if (img) { _activateTool(img, 'pen'); _syncBottomBar(); }
    });
    document.getElementById('bar-eraser-btn').addEventListener('click', () => {
      const img = images.find(i => i.id === selectedImageId);
      if (img) { _activateTool(img, 'eraser'); _syncBottomBar(); }
    });
    document.getElementById('bar-lasso-btn').addEventListener('click', () => {
      const img = images.find(i => i.id === selectedImageId);
      if (img) { _activateTool(img, 'lasso'); _syncBottomBar(); }
    });

    // アンドゥ/リドゥボタン
    document.getElementById('bar-undo-btn').addEventListener('click', () => _undo());
    document.getElementById('bar-redo-btn').addEventListener('click', () => _redo());
  }

  // === アンドゥ/リドゥ ===
  function _saveUndoState(imageObj) {
    const canvas = imageObj.previewCanvas;
    const ctx = canvas.getContext('2d');
    imageObj.undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    // 上限30ステップ
    if (imageObj.undoStack.length > 30) imageObj.undoStack.shift();
    // 新しい操作でredoスタックをクリア
    imageObj.redoStack = [];
    _syncBottomBar();
  }

  function _undo() {
    const img = images.find(i => i.id === selectedImageId);
    if (!img || img.undoStack.length === 0) return;
    const canvas = img.previewCanvas;
    const ctx = canvas.getContext('2d');
    // 現在の状態をredoに保存
    img.redoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    // undoスタックから復元
    ctx.putImageData(img.undoStack.pop(), 0, 0);
    _syncBottomBar();
  }

  function _redo() {
    const img = images.find(i => i.id === selectedImageId);
    if (!img || img.redoStack.length === 0) return;
    const canvas = img.previewCanvas;
    const ctx = canvas.getContext('2d');
    // 現在の状態をundoに保存
    img.undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    // redoスタックから復元
    ctx.putImageData(img.redoStack.pop(), 0, 0);
    _syncBottomBar();
  }

  // キーボードショートカット
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      if (e.shiftKey) {
        e.preventDefault();
        _redo();
      } else {
        e.preventDefault();
        _undo();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      _redo();
    }
  });

  // === 太さインジケーター表示 ===
  function _showSizeIndicator(imageObj) {
    const indicator = document.getElementById(`size-indicator-${imageObj.id}`);
    const circle = document.getElementById(`size-indicator-circle-${imageObj.id}`);
    const text = document.getElementById(`size-indicator-text-${imageObj.id}`);
    if (!indicator || !circle || !text) return;

    const canvas = imageObj.previewCanvas;
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / canvas.width;
    const displaySize = Math.max(4, imageObj.toolSize * scale);

    circle.style.width = displaySize + 'px';
    circle.style.height = displaySize + 'px';
    text.textContent = imageObj.toolSize + 'px';

    indicator.style.opacity = '1';

    // 既存タイマーをクリア
    if (imageObj._indicatorTimer) clearTimeout(imageObj._indicatorTimer);
    imageObj._indicatorTimer = setTimeout(() => {
      indicator.style.opacity = '0';
    }, 500);
  }

  // === 描画ツール（ペン・消しゴム・投げ縄）共通セットアップ ===
  function _setupDrawingTools(imageObj) {
    const canvas = imageObj.previewCanvas;
    const cursor = document.getElementById(`tool-cursor-${imageObj.id}`);
    let isDrawing = false;
    let lassoPoints = [];

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

    // カーソル表示の更新
    function _updateCursor(e) {
      if (!imageObj.penActive && !imageObj.eraserActive) {
        cursor.style.display = 'none';
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const wrapRect = canvas.parentElement.getBoundingClientRect();
      const scale = rect.width / canvas.width;
      const displaySize = imageObj.toolSize * scale;

      let clientX, clientY;
      if (e.touches) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      cursor.style.display = 'block';
      cursor.style.width = displaySize + 'px';
      cursor.style.height = displaySize + 'px';
      cursor.style.left = (clientX - wrapRect.left) + 'px';
      cursor.style.top = (clientY - wrapRect.top) + 'px';
      cursor.style.borderColor = imageObj.penActive ? '#000' : '#f59e0b';
    }

    // ペン/消しゴムの描画
    function _draw(e) {
      if (!isDrawing) return;
      if (!imageObj.penActive && !imageObj.eraserActive) return;
      e.preventDefault();

      const pos = _getCanvasPos(e);
      const ctx = canvas.getContext('2d');
      const r = imageObj.toolSize;

      ctx.save();
      if (imageObj.eraserActive) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (imageObj.penActive) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      _updateCursor(e);
    }

    // 投げ縄の描画（オーバーレイ）
    function _drawLassoOverlay() {
      const lCtx = imageObj.lassoCanvas.getContext('2d');
      const rect = canvas.getBoundingClientRect();
      // オーバーレイキャンバスサイズを合わせる
      if (imageObj.lassoCanvas.width !== canvas.width || imageObj.lassoCanvas.height !== canvas.height) {
        imageObj.lassoCanvas.width = canvas.width;
        imageObj.lassoCanvas.height = canvas.height;
      }
      lCtx.clearRect(0, 0, imageObj.lassoCanvas.width, imageObj.lassoCanvas.height);

      if (lassoPoints.length < 2) return;

      lCtx.beginPath();
      lCtx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
      for (let i = 1; i < lassoPoints.length; i++) {
        lCtx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
      }
      lCtx.strokeStyle = '#10b981';
      lCtx.lineWidth = 2;
      lCtx.setLineDash([6, 4]);
      lCtx.stroke();
    }

    function _startDraw(e) {
      if (imageObj.lassoActive) {
        _saveUndoState(imageObj); // 投げ縄開始前に保存
        isDrawing = true;
        lassoPoints = [];
        const pos = _getCanvasPos(e);
        lassoPoints.push(pos);
        // 投げ縄オーバーレイをイベント受付可能に
        imageObj.lassoCanvas.style.pointerEvents = 'auto';
        e.preventDefault();
        return;
      }

      if (!imageObj.penActive && !imageObj.eraserActive) return;
      _saveUndoState(imageObj); // ペン/消しゴム描画開始前に保存
      isDrawing = true;
      _draw(e);
    }

    function _moveDraw(e) {
      if (imageObj.lassoActive && isDrawing) {
        const pos = _getCanvasPos(e);
        lassoPoints.push(pos);
        _drawLassoOverlay();
        e.preventDefault();
        return;
      }

      _updateCursor(e);
      if (isDrawing) _draw(e);
    }

    function _stopDraw(e) {
      if (imageObj.lassoActive && isDrawing && lassoPoints.length >= 3) {
        // 投げ縄完了 → 囲んだ領域の外側を消去
        _applyLasso(imageObj, lassoPoints);
        lassoPoints = [];
        // オーバーレイをクリア
        const lCtx = imageObj.lassoCanvas.getContext('2d');
        lCtx.clearRect(0, 0, imageObj.lassoCanvas.width, imageObj.lassoCanvas.height);
        imageObj.lassoCanvas.style.pointerEvents = 'none';
      }
      isDrawing = false;
    }

    function _leaveDraw() {
      cursor.style.display = 'none';
      if (!imageObj.lassoActive) {
        isDrawing = false;
      }
    }

    // マウス
    canvas.addEventListener('mousedown', _startDraw);
    canvas.addEventListener('mousemove', _moveDraw);
    canvas.addEventListener('mouseup', _stopDraw);
    canvas.addEventListener('mouseleave', _leaveDraw);

    // タッチ
    canvas.addEventListener('touchstart', _startDraw, { passive: false });
    canvas.addEventListener('touchmove', _moveDraw, { passive: false });
    canvas.addEventListener('touchend', _stopDraw);
    canvas.addEventListener('touchcancel', _stopDraw);

    // 投げ縄オーバーレイにもイベント設定
    const lassoOv = imageObj.lassoCanvas;
    lassoOv.addEventListener('mousedown', _startDraw);
    lassoOv.addEventListener('mousemove', _moveDraw);
    lassoOv.addEventListener('mouseup', _stopDraw);
    lassoOv.addEventListener('mouseleave', _leaveDraw);
    lassoOv.addEventListener('touchstart', _startDraw, { passive: false });
    lassoOv.addEventListener('touchmove', _moveDraw, { passive: false });
    lassoOv.addEventListener('touchend', _stopDraw);
    lassoOv.addEventListener('touchcancel', _stopDraw);
  }

  // === 投げ縄適用: 囲んだ領域の外側を消去 ===
  function _applyLasso(imageObj, points) {
    const canvas = imageObj.previewCanvas;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // 現在の画像を一時キャンバスにコピー
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(canvas, 0, 0);

    // メインキャンバスをクリア
    ctx.clearRect(0, 0, w, h);

    // クリップパスを設定
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.clip();

    // クリップ領域内に画像を描画
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.restore();
  }

  // === 変更適用 ===
  function _applyChanges(imageObj) {
    // 1. 現在のプレビューキャンバスの内容をトリム
    const trimmed = _trimTransparent(imageObj.previewCanvas);

    // 2. トリム結果にノイズ除去を適用
    if (imageObj.noiseSize > 1) {
      const ctx = trimmed.getContext('2d');
      const w = trimmed.width;
      const h = trimmed.height;
      const imgData = ctx.getImageData(0, 0, w, h);
      _removeNoiseOnData(imgData, imageObj.noiseSize);
      ctx.putImageData(imgData, 0, 0);
    }

    // 3. 新しいoriginalImageDataとoriginalCanvasとして保存
    const newOrigCanvas = document.createElement('canvas');
    newOrigCanvas.width = trimmed.width;
    newOrigCanvas.height = trimmed.height;
    const newOrigCtx = newOrigCanvas.getContext('2d');
    newOrigCtx.drawImage(trimmed, 0, 0);
    const newImageData = newOrigCtx.getImageData(0, 0, trimmed.width, trimmed.height);

    imageObj.originalImageData = newImageData;

    // DOMの元画像キャンバスを差し替え
    const origWrap = document.getElementById(`orig-wrap-${imageObj.id}`);
    origWrap.removeChild(imageObj.originalCanvas);
    origWrap.appendChild(newOrigCanvas);
    imageObj.originalCanvas = newOrigCanvas;

    // 4. プレビューキャンバスのサイズを更新
    imageObj.previewCanvas.width = trimmed.width;
    imageObj.previewCanvas.height = trimmed.height;
    const prevCtx = imageObj.previewCanvas.getContext('2d');
    prevCtx.drawImage(trimmed, 0, 0);

    // 5. サイズ更新
    imageObj.width = trimmed.width;
    imageObj.height = trimmed.height;
    const sizeEl = document.getElementById(`size-${imageObj.id}`);
    if (sizeEl) sizeEl.textContent = `${trimmed.width} x ${trimmed.height}px`;

    // 6. フラグ設定
    imageObj.applied = true;

    // 7. 投げ縄キャンバスもサイズ更新
    if (imageObj.lassoCanvas) {
      imageObj.lassoCanvas.width = trimmed.width;
      imageObj.lassoCanvas.height = trimmed.height;
    }

    // 8. 下部バー更新（しきい値disabled）
    _syncBottomBar();
  }

  // === 画像回転（時計回り90度） ===
  function _rotateImage(imageObj) {
    const oldW = imageObj.width;
    const oldH = imageObj.height;
    const newW = oldH;
    const newH = oldW;

    const newOrigCanvas = document.createElement('canvas');
    newOrigCanvas.width = newW;
    newOrigCanvas.height = newH;
    const ctx = newOrigCanvas.getContext('2d');

    ctx.translate(newW, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(imageObj.originalCanvas, 0, 0);

    const newImageData = ctx.getImageData(0, 0, newW, newH);

    imageObj.previewCanvas.width = newW;
    imageObj.previewCanvas.height = newH;

    const origWrap = document.getElementById(`orig-wrap-${imageObj.id}`);
    origWrap.removeChild(imageObj.originalCanvas);
    origWrap.appendChild(newOrigCanvas);

    imageObj.originalCanvas = newOrigCanvas;
    imageObj.originalImageData = newImageData;
    imageObj.width = newW;
    imageObj.height = newH;

    const sizeEl = document.getElementById(`size-${imageObj.id}`);
    if (sizeEl) sizeEl.textContent = `${newW} x ${newH}px`;

    // ツールモードを解除
    _activateTool(imageObj, '');

    // 投げ縄キャンバスもサイズ更新
    if (imageObj.lassoCanvas) {
      imageObj.lassoCanvas.width = newW;
      imageObj.lassoCanvas.height = newH;
    }

    // applied をリセット
    imageObj.applied = false;

    _applyBinarize(imageObj);
    if (imageObj.noiseSize > 1) _removeNoise(imageObj);
    _syncBottomBar();
  }

  // === ノイズ除去（連結成分分析） ===
  function _removeNoise(imageObj) {
    const canvas = imageObj.previewCanvas;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);

    const removedComponents = _removeNoiseOnData(imgData, imageObj.noiseSize);
    ctx.putImageData(imgData, 0, 0);
  }

  // ImageDataに対してノイズ除去を行う（共通処理）
  function _removeNoiseOnData(imgData, noiseSize) {
    const data = imgData.data;
    const w = imgData.width;
    const h = imgData.height;
    const minSize = noiseSize * noiseSize;

    const mask = new Uint8Array(w * h);
    for (let i = 0; i < mask.length; i++) {
      mask[i] = data[i * 4 + 3] > 0 ? 1 : 0;
    }

    const labels = new Int32Array(w * h);
    let labelCount = 0;
    const componentSizes = [0];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (mask[idx] === 1 && labels[idx] === 0) {
          labelCount++;
          let size = 0;
          const queue = [idx];
          labels[idx] = labelCount;

          while (queue.length > 0) {
            const cur = queue.pop();
            size++;
            const cx = cur % w;
            const cy = (cur - cx) / w;

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

    let removedCount = 0;
    for (let i = 0; i < labels.length; i++) {
      const label = labels[i];
      if (label > 0 && componentSizes[label] < minSize) {
        const pi = i * 4;
        data[pi] = 0;
        data[pi + 1] = 0;
        data[pi + 2] = 0;
        data[pi + 3] = 0;
        removedCount++;
      }
    }

    return componentSizes.filter((s, i) => i > 0 && s < minSize).length;
  }

  // === UI更新 ===
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

    // 選択画像が削除された場合
    if (selectedImageId === id) {
      selectedImageId = images.length > 0 ? images[0].id : null;
      if (selectedImageId) _selectImage(selectedImageId);
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
      document.getElementById('bottom-bar').style.display = 'none';
    }
  }

  // === 入稿シートに配置 ===
  function _placeToEditor() {
    if (images.length === 0) {
      alert('配置する画像がありません。先に画像を二値化してください。');
      return;
    }

    const items = images.map(img => {
      const trimmed = _trimTransparent(img.previewCanvas);
      return {
        name: _makeFileName(img.fileName),
        dataURL: trimmed.toDataURL('image/png'),
        memo: img.memo || '',
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
    trimmed.toBlob((blob) => {
      _triggerDownload(blob, _makeFileName(imageObj.fileName));
    }, 'image/png');
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
      _triggerDownload(content, `二値化_${y}_${m}_${d}.zip`);
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

  // iPad Safari対応のダウンロードヘルパー
  function _triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    // iPad Safari対応: setTimeout で確実にクリックイベントを発火
    setTimeout(() => {
      link.click();
      // URL失効を遅延させてダウンロード完了を待つ
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 3000);
    }, 0);
  }

  // === PSD書出し（600DPI、上限超えは2ファイル分割） ===
  function _downloadPSD600() {
    const DPI = 600;
    const MAX_PX = 30000; // PSD形式の最大ピクセル数
    const GAP = 20;       // 画像間の隙間（ピクセル）

    if (typeof agPsd === 'undefined') {
      alert('PSDライブラリの読み込みに失敗しました。ページを再読み込みしてください。');
      return;
    }
    if (images.length === 0) {
      alert('書き出す画像がありません。');
      return;
    }

    // 全画像のプレビューキャンバスをトリム
    const trimmedImages = images.map(img => ({
      name: img.fileName.replace(/\.[^.]+$/, ''),
      canvas: _trimTransparent(img.previewCanvas),
    }));

    // 上限に収まるようにファイル単位で分割
    const fileGroups = []; // [ [img, img, ...], [img, img, ...], ... ]
    let currentGroup = [];
    let currentH = 0;

    for (const t of trimmedImages) {
      const addH = t.canvas.height + (currentH > 0 ? GAP : 0);

      if (currentH + addH <= MAX_PX) {
        currentGroup.push(t);
        currentH += addH;
      } else {
        // 現在のグループを確定して新しいグループを開始
        if (currentGroup.length > 0) {
          fileGroups.push(currentGroup);
        }
        currentGroup = [t];
        currentH = t.canvas.height;
      }
    }
    if (currentGroup.length > 0) {
      fileGroups.push(currentGroup);
    }

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const totalFiles = fileGroups.length;

    try {
      fileGroups.forEach((group, idx) => {
        const filename = totalFiles === 1
          ? `二値化_600DPI_${y}_${m}_${d}.psd`
          : `二値化_600DPI_${y}_${m}_${d}_${idx + 1}.psd`;

        // iPadでの連続ダウンロード安定のため遅延
        const delay = idx * 1500;
        if (delay === 0) {
          _writePsdFile(group, DPI, GAP, filename);
        } else {
          setTimeout(() => {
            _writePsdFile(group, DPI, GAP, filename);
          }, delay);
        }
      });

      if (totalFiles > 1) {
        alert(`画像数が多いため${totalFiles}ファイルに分割してダウンロードします。`);
      }
    } catch (e) {
      console.error('PSD書出しエラー:', e);
      alert('PSD書出しに失敗しました。\n' + e.message);
    }
  }

  // PSDファイル1つ分を生成してダウンロード
  function _writePsdFile(trimmedImages, dpi, gap, filename) {
    let totalW = 0;
    let totalH = 0;
    trimmedImages.forEach(t => {
      totalW = Math.max(totalW, t.canvas.width);
      totalH += t.canvas.height;
    });
    totalH += gap * (trimmedImages.length - 1);

    const children = [];
    let currentY = 0;
    for (const t of trimmedImages) {
      children.push({
        name: t.name,
        canvas: t.canvas,
        left: 0,
        top: currentY,
      });
      currentY += t.canvas.height + gap;
    }

    const psd = {
      width: totalW,
      height: totalH,
      imageResources: {
        resolutionInfo: {
          horizontalResolution: dpi,
          horizontalResolutionUnit: 1, // 1 = PPI（ag-psdの数値enum）
          widthUnit: 1,                // 1 = Inches
          verticalResolution: dpi,
          verticalResolutionUnit: 1,   // 1 = PPI
          heightUnit: 1,               // 1 = Inches
        },
      },
      children: children,
    };

    const result = agPsd.writePsd(psd);
    const blob = new Blob([result], { type: 'application/octet-stream' });
    _triggerDownload(blob, filename);
  }

  // === 透明部分をトリミング ===
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

  // === 二値化 + ノイズ除去をまとめて実行 ===
  function _applyAll(imageObj) {
    if (imageObj._denoiseTimer) {
      clearTimeout(imageObj._denoiseTimer);
      imageObj._denoiseTimer = null;
    }

    // 変更適用済みの場合は二値化をスキップ
    if (!imageObj.applied) {
      _applyBinarize(imageObj);
    }

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

  // === Visual Viewport API: iPad拡大時に下部バーを画面下部に固定 ===
  function _updateBottomBarPosition() {
    const bar = document.getElementById('bottom-bar');
    if (!bar || bar.style.display === 'none') return;

    if (window.visualViewport) {
      const vv = window.visualViewport;
      bar.style.position = 'fixed';
      bar.style.bottom = 'auto';
      bar.style.left = vv.offsetLeft + 'px';
      bar.style.top = (vv.offsetTop + vv.height - bar.offsetHeight) + 'px';
      bar.style.width = vv.width + 'px';
    }
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', _updateBottomBarPosition);
    window.visualViewport.addEventListener('scroll', _updateBottomBarPosition);
  }

})();
