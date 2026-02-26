// メインアプリ初期化・UI制御

(function () {
  'use strict';

  let canvasManager;
  let frameFactory;
  let snapAlign;
  let exporter;
  let currentMaker = 'karafuruya';

  // 初期化 - window.onloadでレイアウト完了後に実行
  window.addEventListener('load', () => {
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
    _setupHint();
  });

  // === 使い方ヒント ===
  function _setupHint() {
    const hint = document.getElementById('usage-hint');
    const hideBtn = document.getElementById('hide-hint');
    if (hint && hideBtn) {
      hideBtn.addEventListener('click', () => {
        hint.classList.add('hidden');
      });
    }
  }

  // === メーカータブ切り替え ===
  function _setupMakerTabs() {
    document.querySelectorAll('.maker-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const maker = tab.dataset.maker;
        if (!maker || maker === currentMaker) return;

        currentMaker = maker;

        // 全タブのアクティブ状態を更新
        document.querySelectorAll('.maker-tab').forEach(t => {
          if (t.dataset.maker) {
            t.classList.toggle('active', t.dataset.maker === maker);
          }
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
    if (pcContainer) {
      pcContainer.innerHTML = '';

      maker.categories.forEach(cat => {
        const section = document.createElement('div');
        section.className = 'stamp-category';

        const nameEl = document.createElement('div');
        nameEl.className = 'stamp-category-name';
        nameEl.textContent = cat.name;
        section.appendChild(nameEl);

        const grid = document.createElement('div');
        grid.className = 'stamp-grid';

        cat.stamps.forEach(stamp => {
          const btn = document.createElement('button');
          btn.className = 'stamp-btn';
          btn.innerHTML = `<span class="stamp-id">${stamp.id}</span><span class="stamp-size">${stamp.width}x${stamp.height}</span>`;

          // 外枠色をトップバーに反映
          btn.style.setProperty('--accent', cat.outerStroke);
          btn.style.cssText += `border-top: 2px solid ${cat.outerStroke};`;

          btn.addEventListener('click', () => {
            frameFactory.createFrame(stamp, cat);
            _updateEmptyMsg();
            // ヒントを自動的に閉じる
            const hint = document.getElementById('usage-hint');
            if (hint) hint.classList.add('hidden');
          });
          grid.appendChild(btn);
        });

        section.appendChild(grid);
        pcContainer.appendChild(section);
      });
    }

    // モバイル用
    const mobileContainer = document.getElementById('mobile-stamp-list');
    if (mobileContainer) {
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
          btn.innerHTML = `<span class="stamp-id">${stamp.id}</span><span class="stamp-size">${stamp.width}x${stamp.height}</span>`;
          btn.style.cssText += `border-top: 2px solid ${cat.outerStroke};`;
          btn.addEventListener('click', () => {
            frameFactory.createFrame(stamp, cat);
            _updateEmptyMsg();
          });
          scroll.appendChild(btn);
        });

        mobileContainer.appendChild(scroll);
      });
    }
  }

  // === 空状態メッセージの表示/非表示 ===
  function _updateEmptyMsg() {
    const msg = document.getElementById('canvas-empty-msg');
    if (!msg) return;
    const hasFrames = canvasManager.getStampFrames().length > 0;
    msg.classList.toggle('hidden', hasFrames);
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
      btnDeleteSelected.addEventListener('click', () => {
        frameFactory.deleteSelected();
        _updateEmptyMsg();
      });
    }

    // 全削除
    const btnDeleteAll = document.getElementById('btn-delete-all');
    if (btnDeleteAll) {
      btnDeleteAll.addEventListener('click', () => {
        if (canvasManager.getStampFrames().length === 0) return;
        if (confirm('全てのスタンプ枠を削除しますか？')) {
          frameFactory.deleteAll();
          _updateEmptyMsg();
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

    // 回転（縦横切替）
    const btnRotate = document.getElementById('btn-rotate');
    if (btnRotate) {
      btnRotate.addEventListener('click', () => {
        frameFactory.rotateSelected();
      });
    }

    // モバイル用ボタン
    const mobileRotate = document.getElementById('mobile-btn-rotate');
    if (mobileRotate) {
      mobileRotate.addEventListener('click', () => {
        frameFactory.rotateSelected();
      });
    }

    const mobileDelete = document.getElementById('mobile-btn-delete');
    if (mobileDelete) {
      mobileDelete.addEventListener('click', () => {
        frameFactory.deleteSelected();
        _updateEmptyMsg();
      });
    }

    const mobileClear = document.getElementById('mobile-btn-clear');
    if (mobileClear) {
      mobileClear.addEventListener('click', () => {
        if (canvasManager.getStampFrames().length === 0) return;
        if (confirm('全てのスタンプ枠を削除しますか？')) {
          frameFactory.deleteAll();
          _updateEmptyMsg();
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

  // === 選択イベント ===
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

    document.getElementById('canvas-area').addEventListener('click', () => {
      if (!panel.classList.contains('collapsed')) {
        panel.classList.add('collapsed');
      }
    });
  }

  // === キーボードショートカット ===
  function _setupKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      // Delete / Backspace: 選択削除
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        frameFactory.deleteSelected();
        _updateEmptyMsg();
      }

      // Ctrl+A: 全選択
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        const canvas = canvasManager.getCanvas();
        const frames = canvasManager.getStampFrames();
        if (frames.length > 0) {
          const sel = new fabric.ActiveSelection(frames, { canvas });
          canvas.setActiveObject(sel);
          canvas.requestRenderAll();
        }
      }

      // R: 選択枠を回転（縦横切替）
      if (e.key === 'r' || e.key === 'R') {
        frameFactory.rotateSelected();
      }

      // Escape: 選択解除
      if (e.key === 'Escape') {
        canvasManager.getCanvas().discardActiveObject();
        canvasManager.getCanvas().requestRenderAll();
      }
    });
  }

})();
