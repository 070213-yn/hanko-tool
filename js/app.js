// メインアプリ初期化・UI制御

(function () {
  'use strict';

  let canvasManager;
  let frameFactory;
  let snapAlign;
  let exporter;
  let psdHandler;
  let currentMaker = 'karafuruya';
  let selectedFrame = null; // 現在選択中の枠

  // 初期化
  document.addEventListener('DOMContentLoaded', () => {
    try {
      canvasManager = new CanvasManager('main-canvas');
    } catch (e) {
      console.error('キャンバス初期化エラー:', e);
      return;
    }
    frameFactory = new FrameFactory(canvasManager);
    snapAlign = new SnapAlign(canvasManager);
    psdHandler = new PsdHandler(canvasManager);
    exporter = new Exporter(canvasManager);
    exporter.psdHandler = psdHandler;

    _setupMakerTabs();
    _renderStampList(currentMaker);
    _setupAlignButtons();
    _setupActionButtons();
    _setupZoomControls();
    _setupSelectionEvents();
    _setupMobilePanel();
    _setupKeyboard();
    _setupPSDImport();
    _setupMemoInput();
    _setupFrameStateEvents();
  });

  // === メーカータブ切り替え ===
  function _setupMakerTabs() {
    document.querySelectorAll('.maker-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const maker = tab.dataset.maker;
        if (maker === currentMaker) return;
        currentMaker = maker;
        document.querySelectorAll('.maker-tab').forEach(t => {
          t.classList.toggle('active', t.dataset.maker === maker);
        });
        _renderStampList(maker);
      });
    });
  }

  // === スタンプ一覧を描画 ===
  function _renderStampList(makerKey) {
    const maker = FRAME_DATA.makers[makerKey];
    if (!maker) return;

    // PC用
    const pcContainer = document.getElementById('stamp-list');
    pcContainer.innerHTML = '';
    maker.categories.forEach(cat => {
      const header = document.createElement('div');
      header.className = 'category-header';
      header.textContent = cat.name;
      pcContainer.appendChild(header);

      const grid = document.createElement('div');
      grid.className = 'flex flex-wrap gap-1.5 mb-4';
      cat.stamps.forEach(stamp => {
        const btn = document.createElement('button');
        btn.className = 'stamp-btn';
        btn.innerHTML = `${stamp.id}<span class="stamp-size">${stamp.width}x${stamp.height}</span>`;
        btn.style.borderLeftWidth = '3px';
        btn.style.borderLeftColor = cat.outerStroke;
        btn.addEventListener('click', () => frameFactory.createFrame(stamp, cat));
        grid.appendChild(btn);
      });
      pcContainer.appendChild(grid);
    });

    // モバイル用
    const mobileContainer = document.getElementById('mobile-stamp-list');
    if (!mobileContainer) return;
    mobileContainer.innerHTML = '';
    maker.categories.forEach(cat => {
      const label = document.createElement('div');
      label.className = 'text-xs text-gray-500 font-semibold mb-1';
      label.textContent = cat.name;
      mobileContainer.appendChild(label);

      const scroll = document.createElement('div');
      scroll.className = 'mobile-stamp-scroll mb-2';
      cat.stamps.forEach(stamp => {
        const btn = document.createElement('button');
        btn.className = 'stamp-btn';
        btn.innerHTML = `${stamp.id}<span class="stamp-size">${stamp.width}x${stamp.height}</span>`;
        btn.style.borderLeftWidth = '3px';
        btn.style.borderLeftColor = cat.outerStroke;
        btn.addEventListener('click', () => frameFactory.createFrame(stamp, cat));
        scroll.appendChild(btn);
      });
      mobileContainer.appendChild(scroll);
    });
  }

  // === 整列ボタン ===
  function _setupAlignButtons() {
    document.querySelectorAll('[data-align]').forEach(btn => {
      btn.addEventListener('click', () => snapAlign.execute(btn.dataset.align));
    });
  }

  // === PSD読み込み ===
  function _setupPSDImport() {
    const fileInput = document.getElementById('psd-file-input');
    const btnImport = document.getElementById('btn-import-psd');
    const mobileBtnImport = document.getElementById('mobile-btn-import-psd');

    if (btnImport) {
      btnImport.addEventListener('click', () => fileInput.click());
    }
    if (mobileBtnImport) {
      mobileBtnImport.addEventListener('click', () => fileInput.click());
    }

    fileInput.addEventListener('change', async (e) => {
      if (e.target.files.length === 0) return;
      const file = e.target.files[0];

      btnImport.textContent = '読み込み中...';
      btnImport.disabled = true;

      try {
        const layers = await psdHandler.importPSD(file);
        _renderLayerList(layers);
        if (layers.length === 0) {
          alert('有効なレイヤーが見つかりませんでした。');
        }
      } catch (err) {
        console.error('PSD読み込みエラー:', err);
        alert('PSDファイルの読み込みに失敗しました。\n' + err.message);
      } finally {
        btnImport.textContent = 'PSDファイルを選択...';
        btnImport.disabled = false;
        fileInput.value = '';
      }
    });
  }

  // PSDレイヤー一覧を描画
  function _renderLayerList(layers) {
    const pcList = document.getElementById('psd-layer-list');
    const mobileList = document.getElementById('mobile-psd-layer-list');

    [pcList, mobileList].forEach(container => {
      if (!container) return;
      container.innerHTML = '';

      layers.forEach((layer, idx) => {
        const item = document.createElement('div');
        item.className = 'psd-layer-item';

        // サムネイル
        const thumbWrap = document.createElement('div');
        thumbWrap.className = 'psd-layer-thumb';
        const thumbImg = document.createElement('img');
        thumbImg.src = psdHandler.createThumbnail(layer.canvas);
        thumbImg.alt = layer.name;
        thumbWrap.appendChild(thumbImg);

        // 情報
        const info = document.createElement('div');
        info.className = 'psd-layer-info';

        const name = document.createElement('div');
        name.className = 'psd-layer-name';
        name.textContent = layer.name;
        name.title = `${layer.name} (${layer.width}x${layer.height}px)`;

        // 配置ボタン - 明確な目印
        const placeBtn = document.createElement('button');
        placeBtn.className = 'psd-place-btn';
        placeBtn.textContent = '選択枠に配置';
        placeBtn.dataset.layerIndex = idx;

        placeBtn.addEventListener('click', () => {
          if (!selectedFrame) {
            alert('先にキャンバス上の枠を選択してください。');
            return;
          }
          frameFactory.placeImage(selectedFrame, layer.canvas);
          placeBtn.textContent = '配置済み';
          placeBtn.classList.add('placed');
        });

        info.appendChild(name);
        info.appendChild(placeBtn);
        item.appendChild(thumbWrap);
        item.appendChild(info);
        container.appendChild(item);
      });
    });
  }

  // === メモ入力 ===
  function _setupMemoInput() {
    const pcMemo = document.getElementById('memo-input');
    const mobileMemo = document.getElementById('mobile-memo-input');

    // PC用メモ入力
    if (pcMemo) {
      pcMemo.addEventListener('input', () => {
        if (selectedFrame) {
          frameFactory.setMemo(selectedFrame, pcMemo.value);
          // モバイル側も同期
          if (mobileMemo) mobileMemo.value = pcMemo.value;
        }
      });

      // タッチ時にフォーカスが当たるのを防止（明示的タップのみ）
      pcMemo.addEventListener('touchstart', (e) => {
        e.stopPropagation();
      });
    }

    // モバイル用メモ入力
    if (mobileMemo) {
      mobileMemo.addEventListener('input', () => {
        if (selectedFrame) {
          frameFactory.setMemo(selectedFrame, mobileMemo.value);
          if (pcMemo) pcMemo.value = mobileMemo.value;
        }
      });
    }
  }

  // === 2段階タッチの状態表示 ===
  function _setupFrameStateEvents() {
    const indicator = document.getElementById('frame-state-indicator');

    // 枠が移動可能になった時
    document.addEventListener('frame-activated', () => {
      if (indicator) {
        indicator.className = 'text-xs mb-2 state-moving';
      }
    });

    // 枠の選択が解除された時
    document.addEventListener('frame-deselected', () => {
      selectedFrame = null;
      _hideSelectedPanel();
    });
  }

  // === 選択イベント ===
  function _setupSelectionEvents() {
    const canvas = canvasManager.getCanvas();

    const updateUI = () => {
      const activeObjs = canvas.getActiveObjects().filter(o => o.isStampFrame);
      const hasSelection = activeObjs.length > 0;

      // 削除ボタン
      const btn = document.getElementById('btn-delete-selected');
      if (btn) btn.disabled = !hasSelection;
      const mobileBtn = document.getElementById('mobile-btn-delete');
      if (mobileBtn) mobileBtn.disabled = !hasSelection;

      // 選択パネル表示
      if (hasSelection && activeObjs.length === 1) {
        selectedFrame = activeObjs[0];
        _showSelectedPanel(selectedFrame);
      } else if (hasSelection) {
        selectedFrame = activeObjs[0]; // 複数選択時は先頭
        _hideSelectedPanel();
      } else {
        selectedFrame = null;
        _hideSelectedPanel();
      }
    };

    canvas.on('selection:created', updateUI);
    canvas.on('selection:updated', updateUI);
    canvas.on('selection:cleared', () => {
      selectedFrame = null;
      _hideSelectedPanel();
      const btn = document.getElementById('btn-delete-selected');
      if (btn) btn.disabled = true;
      const mobileBtn = document.getElementById('mobile-btn-delete');
      if (mobileBtn) mobileBtn.disabled = true;
    });
  }

  // 選択パネルの表示
  function _showSelectedPanel(frame) {
    // PC用
    const panel = document.getElementById('selected-frame-panel');
    const frameId = document.getElementById('selected-frame-id');
    const frameSize = document.getElementById('selected-frame-size');
    const memoInput = document.getElementById('memo-input');
    const indicator = document.getElementById('frame-state-indicator');

    if (panel) panel.classList.remove('hidden');
    if (frameId) frameId.textContent = `枠: ${frame.stampId}`;
    if (frameSize) frameSize.textContent = `${frame.stampWidth} x ${frame.stampHeight} mm`;
    if (memoInput) memoInput.value = frame.memoText || '';
    if (indicator) indicator.className = 'text-xs mb-2 state-selecting';

    // モバイル用
    const mobilePanel = document.getElementById('mobile-selected-panel');
    const mobileFrameId = document.getElementById('mobile-frame-id');
    const mobileMemo = document.getElementById('mobile-memo-input');
    if (mobilePanel) mobilePanel.classList.remove('hidden');
    if (mobileFrameId) mobileFrameId.textContent = `${frame.stampId}`;
    if (mobileMemo) mobileMemo.value = frame.memoText || '';
  }

  // 選択パネルを非表示
  function _hideSelectedPanel() {
    const panel = document.getElementById('selected-frame-panel');
    if (panel) panel.classList.add('hidden');
    const mobilePanel = document.getElementById('mobile-selected-panel');
    if (mobilePanel) mobilePanel.classList.add('hidden');
  }

  // === アクションボタン ===
  function _setupActionButtons() {
    // 選択削除
    const btnDeleteSelected = document.getElementById('btn-delete-selected');
    if (btnDeleteSelected) {
      btnDeleteSelected.addEventListener('click', () => frameFactory.deleteSelected());
    }

    // 全削除
    const btnDeleteAll = document.getElementById('btn-delete-all');
    if (btnDeleteAll) {
      btnDeleteAll.addEventListener('click', () => {
        if (canvasManager.getStampFrames().length === 0) return;
        if (confirm('全てのスタンプ枠を削除しますか？')) {
          frameFactory.deleteAll();
        }
      });
    }

    // PSD書出し
    const btnExportPSD = document.getElementById('btn-export-psd');
    if (btnExportPSD) {
      btnExportPSD.addEventListener('click', () => {
        const title = document.getElementById('title-input').value;
        exporter.exportPSD(frameFactory, title);
      });
    }

    // PNG書出し
    const btnExportPNG = document.getElementById('btn-export-png');
    if (btnExportPNG) {
      btnExportPNG.addEventListener('click', () => exporter.exportPNG());
    }

    // SVG書出し
    const btnExportSVG = document.getElementById('btn-export-svg');
    if (btnExportSVG) {
      btnExportSVG.addEventListener('click', () => exporter.exportSVG());
    }

    // グリッド表示切替
    const gridToggle = document.getElementById('grid-toggle');
    if (gridToggle) {
      gridToggle.addEventListener('change', () => canvasManager.toggleGrid());
    }

    // モバイル用
    const mobileDelete = document.getElementById('mobile-btn-delete');
    if (mobileDelete) {
      mobileDelete.addEventListener('click', () => frameFactory.deleteSelected());
    }

    const mobileClear = document.getElementById('mobile-btn-clear');
    if (mobileClear) {
      mobileClear.addEventListener('click', () => {
        if (canvasManager.getStampFrames().length === 0) return;
        if (confirm('全てのスタンプ枠を削除しますか？')) {
          frameFactory.deleteAll();
        }
      });
    }

    const mobileExport = document.getElementById('mobile-btn-export');
    if (mobileExport) {
      mobileExport.addEventListener('click', () => {
        const title = document.getElementById('title-input').value;
        exporter.exportPSD(frameFactory, title);
      });
    }
  }

  // === ズーム制御 ===
  function _setupZoomControls() {
    const slider = document.getElementById('zoom-slider');
    const label = document.getElementById('zoom-label');
    const btnIn = document.getElementById('zoom-in');
    const btnOut = document.getElementById('zoom-out');
    const btnFit = document.getElementById('zoom-fit');

    if (slider) {
      slider.addEventListener('input', () => {
        canvasManager.setZoomPercent(parseInt(slider.value));
      });
    }

    if (btnIn) {
      btnIn.addEventListener('click', () => {
        const newVal = Math.min(500, parseInt(slider.value) + 25);
        slider.value = newVal;
        canvasManager.setZoomPercent(newVal);
      });
    }
    if (btnOut) {
      btnOut.addEventListener('click', () => {
        const newVal = Math.max(10, parseInt(slider.value) - 25);
        slider.value = newVal;
        canvasManager.setZoomPercent(newVal);
      });
    }

    if (btnFit) {
      btnFit.addEventListener('click', () => {
        canvasManager.resetView();
        if (slider) slider.value = 100;
      });
    }

    document.addEventListener('zoom-change', (e) => {
      const pct = e.detail.percent;
      if (label) label.textContent = pct + '%';
      if (slider) slider.value = Math.max(10, Math.min(500, pct));
    });
  }

  // === モバイル下部パネル ===
  function _setupMobilePanel() {
    const panel = document.getElementById('mobile-panel');
    const handle = document.getElementById('mobile-panel-handle');
    if (!panel || !handle) return;

    handle.addEventListener('click', () => panel.classList.toggle('collapsed'));

    document.getElementById('canvas-area').addEventListener('click', () => {
      if (!panel.classList.contains('collapsed')) {
        panel.classList.add('collapsed');
      }
    });
  }

  // === キーボードショートカット ===
  function _setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        frameFactory.deleteSelected();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        const canvas = canvasManager.getCanvas();
        const frames = canvasManager.getStampFrames();
        if (frames.length > 0) {
          const sel = new fabric.ActiveSelection(frames, { canvas });
          canvas.setActiveObject(sel);
          canvas.requestRenderAll();
        }
      }

      if (e.key === 'Escape') {
        canvasManager.getCanvas().discardActiveObject();
        canvasManager.getCanvas().requestRenderAll();
      }
    });
  }

})();
