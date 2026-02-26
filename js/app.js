// メインアプリ初期化・UI制御

(function () {
  'use strict';

  let canvasManager;
  let frameFactory;
  let snapAlign;
  let exporter;
  let currentMaker = 'karafuruya';

  // 初期化
  document.addEventListener('DOMContentLoaded', () => {
    canvasManager = new CanvasManager('main-canvas');
    frameFactory = new FrameFactory(canvasManager);
    snapAlign = new SnapAlign(canvasManager);
    exporter = new Exporter(canvasManager);

    _setupMakerTabs();
    _renderStampList(currentMaker);
    _setupAlignButtons();
    _setupActionButtons();
    _setupZoomControls();
    _setupSelectionEvents();
    _setupMobilePanel();
    _setupKeyboard();
  });

  // === メーカータブ切り替え ===
  function _setupMakerTabs() {
    document.querySelectorAll('.maker-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const maker = tab.dataset.maker;
        if (maker === currentMaker) return;

        currentMaker = maker;

        // 全タブのアクティブ状態を更新（PC用・モバイル用の両方）
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

    // PC用サイドバー
    const pcContainer = document.getElementById('stamp-list');
    pcContainer.innerHTML = '';

    maker.categories.forEach(cat => {
      // カテゴリヘッダー
      const header = document.createElement('div');
      header.className = 'category-header';
      header.textContent = cat.name;
      pcContainer.appendChild(header);

      // スタンプボタン群
      const grid = document.createElement('div');
      grid.className = 'flex flex-wrap gap-1.5 mb-4';

      cat.stamps.forEach(stamp => {
        const btn = document.createElement('button');
        btn.className = 'stamp-btn';
        btn.innerHTML = `${stamp.id}<span class="stamp-size">${stamp.width}x${stamp.height}</span>`;

        // 外枠色をボーダーに反映
        btn.style.borderLeftWidth = '3px';
        btn.style.borderLeftColor = cat.outerStroke;

        btn.addEventListener('click', () => {
          frameFactory.createFrame(stamp, cat);
        });
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
        btn.addEventListener('click', () => {
          frameFactory.createFrame(stamp, cat);
        });
        scroll.appendChild(btn);
      });

      mobileContainer.appendChild(scroll);
    });
  }

  // === 整列ボタン ===
  function _setupAlignButtons() {
    document.querySelectorAll('[data-align]').forEach(btn => {
      btn.addEventListener('click', () => {
        snapAlign.execute(btn.dataset.align);
      });
    });
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
      gridToggle.addEventListener('change', () => {
        canvasManager.toggleGrid();
      });
    }

    // モバイル用ボタン
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
      mobileExport.addEventListener('click', () => exporter.exportPNG());
    }
  }

  // === ズーム制御 ===
  function _setupZoomControls() {
    const slider = document.getElementById('zoom-slider');
    const label = document.getElementById('zoom-label');
    const btnIn = document.getElementById('zoom-in');
    const btnOut = document.getElementById('zoom-out');
    const btnFit = document.getElementById('zoom-fit');

    // スライダー操作
    if (slider) {
      slider.addEventListener('input', () => {
        const pct = parseInt(slider.value);
        canvasManager.setZoomPercent(pct);
      });
    }

    // +-ボタン
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

    // フィットボタン
    if (btnFit) {
      btnFit.addEventListener('click', () => {
        canvasManager.resetView();
        if (slider) slider.value = 100;
      });
    }

    // ズーム変更イベントをリッスン（ホイール/ピンチ連動）
    document.addEventListener('zoom-change', (e) => {
      const pct = e.detail.percent;
      if (label) label.textContent = pct + '%';
      if (slider) slider.value = Math.max(10, Math.min(500, pct));
    });
  }

  // === 選択イベント（削除ボタンの有効/無効） ===
  function _setupSelectionEvents() {
    const canvas = canvasManager.getCanvas();

    const updateDeleteBtn = () => {
      const hasSelection = canvas.getActiveObjects().filter(o => o.isStampFrame).length > 0;
      const btn = document.getElementById('btn-delete-selected');
      if (btn) btn.disabled = !hasSelection;
      const mobileBtn = document.getElementById('mobile-btn-delete');
      if (mobileBtn) mobileBtn.disabled = !hasSelection;
    };

    canvas.on('selection:created', updateDeleteBtn);
    canvas.on('selection:updated', updateDeleteBtn);
    canvas.on('selection:cleared', updateDeleteBtn);
  }

  // === モバイル下部パネル ===
  function _setupMobilePanel() {
    const panel = document.getElementById('mobile-panel');
    const handle = document.getElementById('mobile-panel-handle');
    if (!panel || !handle) return;

    handle.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
    });

    // パネル外クリックで閉じる
    document.getElementById('canvas-area').addEventListener('click', () => {
      if (!panel.classList.contains('collapsed')) {
        panel.classList.add('collapsed');
      }
    });
  }

  // === キーボードショートカット ===
  function _setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      // Delete / Backspace: 選択削除
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // テキスト入力中は無視
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        frameFactory.deleteSelected();
      }

      // Ctrl+A: 全選択
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

      // Ctrl+Z: 元に戻す（将来実装予定のプレースホルダ）
      // Escape: 選択解除
      if (e.key === 'Escape') {
        canvasManager.getCanvas().discardActiveObject();
        canvasManager.getCanvas().requestRenderAll();
      }
    });
  }

})();
