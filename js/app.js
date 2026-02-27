// メインアプリ初期化・UI制御

(function () {
  'use strict';

  let canvasManager;
  let frameFactory;
  let snapAlign;
  let exporter;
  let imagePlacer;
  let historyManager;
  let storageManager;
  let currentMaker = 'karafuruya';
  let stampViewMode = 'shape'; // 'text' or 'shape'

  // 初期化 - window.onloadでレイアウト完了後に実行
  window.addEventListener('load', async () => {
    canvasManager = new CanvasManager('main-canvas');
    frameFactory = new FrameFactory(canvasManager);
    snapAlign = new SnapAlign(canvasManager);
    exporter = new Exporter(canvasManager);
    imagePlacer = new ImagePlacer(canvasManager);
    historyManager = new HistoryManager();
    historyManager.init(canvasManager, frameFactory, imagePlacer);
    historyManager.onRestore = _updateEmptyMsg;

    // IndexedDB初期化（フォールバック用）
    storageManager = new StorageManager();
    try { await storageManager.init(); } catch (e) { console.error('DB初期化エラー:', e); }

    // グローバル公開（frame-factory等から参照）
    window.imagePlacer = imagePlacer;

    // Googleスプレッドシートからスタンプ枠データを取得
    if (FRAME_DATA.sheetId && FRAME_DATA.sheetMakers) {
      try {
        const fetcher = new SheetFetcher(FRAME_DATA.sheetId);
        const sheetData = await fetcher.fetchAll(FRAME_DATA.sheetMakers);
        const totalStamps = Object.values(sheetData).reduce((sum, arr) => sum + arr.length, 0);
        if (totalStamps > 0) {
          FRAME_DATA.buildFromSheet(sheetData);
          console.log('スプレッドシートからデータ取得成功:', totalStamps, '件');
        }
      } catch (e) {
        console.warn('スプレッドシート取得失敗、デフォルトデータを使用:', e);
      }
    }

    // メーカータブを動的生成（スプレッドシートで追加されたメーカーにも対応）
    _buildMakerTabs();
    _setupMakerTabs();
    _renderStampList(currentMaker);
    _setupAlignButtons();
    _setupActionButtons();
    _setupZoomControls();
    _setupSelectionEvents();
    _setupMobilePanel();
    _setupKeyboard();
    _setupHint();
    _setupStampToggle();
    _setupPanelCollapse();
    _setupFrameMemo();
    _setupImagePlacer();
    _setupHistory();
    _setupDragDrop();
    _setupNavigation();
    _setupTitle();
    _setupStorage();

    // セッションから復元を試みる（ページ遷移後の復帰）
    const restored = historyManager.restoreFromSession();
    if (restored) {
      _updateEmptyMsg();
    }

    // 初期状態を保存（復元しなかった場合のみ）
    if (!restored) {
      historyManager.saveState();
    }
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

  // === スタンプ枠セクション折りたたみ ===
  function _setupStampToggle() {
    const toggle = document.getElementById('stamp-section-toggle');
    const body = document.getElementById('stamp-section-body');
    if (!toggle || !body) return;

    toggle.addEventListener('click', () => {
      toggle.classList.toggle('collapsed');
      body.classList.toggle('collapsed');
    });
  }

  // === パネル折りたたみ ===
  function _setupPanelCollapse() {
    document.querySelectorAll('.panel-collapse-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const panel = document.getElementById(targetId);
        if (!panel) return;
        panel.classList.toggle('collapsed');
        // キャンバスリサイズ（トランジション完了後）
        setTimeout(() => {
          const area = document.getElementById('canvas-area');
          if (area) {
            canvasManager.getCanvas().setDimensions({
              width: area.clientWidth,
              height: area.clientHeight,
            });
            canvasManager.getCanvas().requestRenderAll();
          }
        }, 350);
      });
    });

    // 縦書きラベルクリックで展開
    document.querySelectorAll('.panel-collapsed-label').forEach(label => {
      label.addEventListener('click', () => {
        const panel = label.closest('.panel-collapsible');
        if (panel) {
          panel.classList.remove('collapsed');
          setTimeout(() => {
            const area = document.getElementById('canvas-area');
            if (area) {
              canvasManager.getCanvas().setDimensions({
                width: area.clientWidth,
                height: area.clientHeight,
              });
              canvasManager.getCanvas().requestRenderAll();
            }
          }, 350);
        }
      });
    });
  }

  // === スタンプ枠メモ（ダブルクリック編集） ===
  function _setupFrameMemo() {
    const canvas = canvasManager.getCanvas();
    canvas.on('mouse:dblclick', (opt) => {
      const target = opt.target;
      if (!target || !target.isStampFrame) return;

      const currentMemo = target.stampMemo || '';
      const newMemo = prompt('メモを入力してください:', currentMemo);
      if (newMemo !== null) {
        frameFactory.updateMemo(target, newMemo);
        historyManager.saveState();
      }
    });
  }

  // === 画像メモを枠に反映 ===
  function _syncImageMemosToFrames() {
    const frames = canvasManager.getStampFrames();
    let updated = 0;

    // 各枠に紐づいた画像のメモを取得して反映
    frames.forEach(frame => {
      const frameUid = frame._placerUid;
      if (!frameUid) return;

      const placement = imagePlacer.placements[frameUid];
      if (!placement) return;

      const imageData = imagePlacer.images.find(i => i.id === placement.imageId);
      if (!imageData) return;

      const memo = imageData.memo || '';
      if (memo !== (frame.stampMemo || '')) {
        frameFactory.updateMemo(frame, memo);
        updated++;
      }
    });

    if (updated > 0) {
      historyManager.saveState();
    }

    // 完了通知
    const btn = document.getElementById('btn-sync-memo');
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd"/></svg> ' + updated + '件反映';
      btn.style.color = '#059669';
      setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; }, 1500);
    }
  }

  // === メーカータブを動的生成（スプレッドシート連携対応） ===
  function _buildMakerTabs() {
    const makerKeys = Object.keys(FRAME_DATA.makers);
    if (makerKeys.length === 0) return;

    // currentMakerが存在しなければ最初のメーカーに切り替え
    if (!FRAME_DATA.makers[currentMaker]) {
      currentMaker = makerKeys[0];
    }

    // PC用サイドバーのタブ
    const pcTabs = document.querySelector('#sidebar .maker-tabs');
    if (pcTabs) {
      pcTabs.innerHTML = '';
      makerKeys.forEach(key => {
        const maker = FRAME_DATA.makers[key];
        const btn = document.createElement('button');
        btn.className = 'maker-tab' + (key === currentMaker ? ' active' : '');
        btn.dataset.maker = key;
        btn.innerHTML = `<span class="maker-tab-dot" style="background: ${maker.categories[0]?.outerStroke || '#000'}"></span>${maker.name}`;
        pcTabs.appendChild(btn);
      });
    }

    // モバイル用タブ
    const mobileTabs = document.querySelector('#mobile-panel-content .border-b');
    if (mobileTabs) {
      mobileTabs.innerHTML = '';
      makerKeys.forEach(key => {
        const maker = FRAME_DATA.makers[key];
        const btn = document.createElement('button');
        btn.className = 'maker-tab' + (key === currentMaker ? ' active' : '');
        btn.dataset.maker = key;
        btn.textContent = maker.name;
        mobileTabs.appendChild(btn);
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

    // カテゴリは1つだけ（カテゴリ名は表示しない）
    const cat = maker.categories[0];
    if (!cat) return;
    const stamps = cat.stamps;

    // 図形表示の基準サイズ計算
    const maxDim = Math.max(...stamps.map(s => Math.max(s.width, s.height)));
    const SHAPE_MAX_PX = 64; // 最大64px（48から拡大）
    const scale = SHAPE_MAX_PX / maxDim;

    // PC用サイドバー
    const pcContainer = document.getElementById('stamp-list');
    if (pcContainer) {
      pcContainer.innerHTML = '';

      // 表示切替ボタン
      const toggleWrap = document.createElement('div');
      toggleWrap.className = 'stamp-view-toggle';
      toggleWrap.innerHTML = `
        <button class="stamp-view-btn ${stampViewMode === 'shape' ? 'active' : ''}" data-mode="shape" title="図形表示">
          <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><rect x="3" y="3" width="14" height="14" rx="2"/></svg>
        </button>
        <button class="stamp-view-btn ${stampViewMode === 'text' ? 'active' : ''}" data-mode="text" title="テキスト表示">
          <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h8a1 1 0 110 2H4a1 1 0 01-1-1z"/></svg>
        </button>
      `;
      toggleWrap.querySelectorAll('.stamp-view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          stampViewMode = btn.dataset.mode;
          _renderStampList(currentMaker);
        });
      });
      pcContainer.appendChild(toggleWrap);

      const grid = document.createElement('div');
      grid.className = stampViewMode === 'shape' ? 'stamp-grid stamp-grid-shape' : 'stamp-grid';

      stamps.forEach(stamp => {
        const btn = document.createElement('button');
        btn.className = 'stamp-btn' + (stampViewMode === 'shape' ? ' stamp-btn-shape' : '');
        btn.style.cssText = `border-top: 2px solid ${cat.outerStroke};`;

        if (stampViewMode === 'shape') {
          const w = Math.round(stamp.width * scale);
          const h = Math.round(stamp.height * scale);
          btn.innerHTML = `
            <div class="stamp-shape" style="width:${w}px;height:${h}px;"></div>
            <span class="stamp-id">${stamp.id}</span>
            <span class="stamp-size">${stamp.width}x${stamp.height}</span>
          `;
        } else {
          btn.innerHTML = `<span class="stamp-id">${stamp.id}</span><span class="stamp-size">${stamp.width}x${stamp.height}</span>`;
        }

        _setupStampBtn(btn, stamp, cat);
        grid.appendChild(btn);
      });

      pcContainer.appendChild(grid);
    }

    // モバイル用
    const mobileContainer = document.getElementById('mobile-stamp-list');
    if (mobileContainer) {
      mobileContainer.innerHTML = '';

      const scroll = document.createElement('div');
      scroll.className = 'mobile-stamp-scroll mb-2';

      stamps.forEach(stamp => {
        const btn = document.createElement('button');
        btn.className = 'stamp-btn';
        btn.innerHTML = `<span class="stamp-id">${stamp.id}</span><span class="stamp-size">${stamp.width}x${stamp.height}</span>`;
        btn.style.cssText = `border-top: 2px solid ${cat.outerStroke};`;
        _setupStampBtn(btn, stamp, cat);
        scroll.appendChild(btn);
      });

      mobileContainer.appendChild(scroll);
    }
  }

  // === スタンプボタンにイベントを設定 ===
  function _setupStampBtn(btn, stamp, cat) {
    btn.addEventListener('click', () => {
      _handleStampClick(stamp, cat);
    });
  }

  // === スタンプボタンクリック処理 ===
  // 枠が1つ選択中 → 差し替え / それ以外 → 新規追加（追加後は選択解除）
  function _handleStampClick(stamp, cat) {
    const canvas = canvasManager.getCanvas();
    const activeObjects = canvas.getActiveObjects();
    const selectedFrames = activeObjects.filter(o => o.isStampFrame);

    if (selectedFrames.length === 1) {
      // 枠が1つ選択中 → 差し替え
      canvas.discardActiveObject();
      frameFactory.replaceFrame(selectedFrames[0], stamp, cat);
    } else {
      // 未選択 or 複数選択 → 新規追加、追加後は選択解除
      canvas.discardActiveObject();
      frameFactory.createFrame(stamp, cat);
      canvas.discardActiveObject();
    }

    canvas.requestRenderAll();
    _updateEmptyMsg();
    historyManager.saveState();
  }

  // === 空状態メッセージの表示/非表示 ===
  function _updateEmptyMsg() {
    const msg = document.getElementById('canvas-empty-msg');
    if (!msg) return;
    const hasFrames = canvasManager.getStampFrames().length > 0;
    msg.classList.toggle('hidden', hasFrames);
  }

  // === 画像を枠の中心に移動 ===
  function _centerImage() {
    const canvas = canvasManager.getCanvas();
    const active = canvas.getActiveObject();
    if (!active) return;

    let objects;
    if (active.isStampFrame || active.isPlacedImage) {
      // 単一の枠または画像が選択されている場合
      objects = [active];
    } else if (active.type === 'activeSelection') {
      // 複数選択の場合は各オブジェクトに対して実行
      objects = active.getObjects();
    } else {
      return;
    }

    let success = false;
    objects.forEach(obj => {
      if (imagePlacer.centerImageInFrame(obj)) {
        success = true;
      }
    });

    if (success) {
      historyManager.saveState();
    }
  }

  // === 整列ボタン ===
  function _setupAlignButtons() {
    document.querySelectorAll('[data-align]').forEach(btn => {
      btn.addEventListener('click', () => {
        snapAlign.execute(btn.dataset.align);
        historyManager.saveState();
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
        historyManager.saveState();
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
          historyManager.saveState();
        }
      });
    }

    // PNG書出し
    const btnExportPNG = document.getElementById('btn-export-png');
    if (btnExportPNG) {
      btnExportPNG.addEventListener('click', () => exporter.exportPNG());
    }

    // グリッド表示切替
    const gridToggle = document.getElementById('grid-toggle');
    if (gridToggle) {
      gridToggle.addEventListener('change', () => {
        canvasManager.toggleGrid();
      });
    }

    // 画像を枠の中心に移動
    const btnCenter = document.getElementById('btn-center-image');
    if (btnCenter) {
      btnCenter.addEventListener('click', _centerImage);
    }
    const mobileBtnCenter = document.getElementById('mobile-btn-center');
    if (mobileBtnCenter) {
      mobileBtnCenter.addEventListener('click', _centerImage);
    }

    // 回転（縦横切替）
    const btnRotate = document.getElementById('btn-rotate');
    if (btnRotate) {
      btnRotate.addEventListener('click', () => {
        frameFactory.rotateSelected();
        historyManager.saveState();
      });
    }

    // 複製
    const btnDuplicate = document.getElementById('btn-duplicate');
    if (btnDuplicate) {
      btnDuplicate.addEventListener('click', () => {
        frameFactory.duplicateSelected();
        _updateEmptyMsg();
        historyManager.saveState();
      });
    }

    // 配置画像削除ボタン: 選択枠の画像だけ削除（枠は残す）
    const btnRemovePlacedImage = document.getElementById('btn-remove-placed-image');
    if (btnRemovePlacedImage) {
      btnRemovePlacedImage.addEventListener('click', () => {
        const canvas = canvasManager.getCanvas();
        const active = canvas.getActiveObjects().filter(o => o.isStampFrame);
        if (active.length === 0) return;
        active.forEach(frame => {
          if (window.imagePlacer) {
            window.imagePlacer.removeFromFrame(frame);
          }
        });
        canvas.requestRenderAll();
        historyManager.saveState();
      });
    }

    // メモを反映ボタン: 画像のメモを紐づいた枠に反映
    const btnSyncMemo = document.getElementById('btn-sync-memo');
    if (btnSyncMemo) {
      btnSyncMemo.addEventListener('click', () => {
        _syncImageMemosToFrames();
      });
    }

    // 選択枠メモ入力欄: 選択状態に連動
    const memoEditInput = document.getElementById('memo-edit-input');
    const memoEditWrap = document.getElementById('memo-edit-wrap');
    if (memoEditInput && memoEditWrap) {
      memoEditInput.addEventListener('input', () => {
        const canvas = canvasManager.getCanvas();
        const active = canvas.getActiveObject();
        if (active && active.isStampFrame) {
          frameFactory.updateMemo(active, memoEditInput.value);
        }
      });
      // Enterキーでフォーカスを外す
      memoEditInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          memoEditInput.blur();
          historyManager.saveState();
        }
      });
      // フォーカスを外したら状態保存
      memoEditInput.addEventListener('blur', () => {
        historyManager.saveState();
      });

      // 選択変更時にメモ欄を同期
      canvasManager.getCanvas().on('selection:created', _syncMemoEditUI);
      canvasManager.getCanvas().on('selection:updated', _syncMemoEditUI);
      canvasManager.getCanvas().on('selection:cleared', () => {
        memoEditWrap.style.display = 'none';
      });
    }

    function _syncMemoEditUI() {
      const canvas = canvasManager.getCanvas();
      const active = canvas.getActiveObject();
      if (active && active.isStampFrame) {
        memoEditWrap.style.display = 'block';
        memoEditInput.value = active.stampMemo || '';
      } else {
        memoEditWrap.style.display = 'none';
      }
    }

    // グリッドスナップトグル
    const snapToggle = document.getElementById('snap-toggle');
    if (snapToggle) {
      snapToggle.addEventListener('change', () => {
        canvasManager.setSnapToGrid(snapToggle.checked);
      });
    }

    // モバイル用ボタン
    const mobileRotate = document.getElementById('mobile-btn-rotate');
    if (mobileRotate) {
      mobileRotate.addEventListener('click', () => {
        frameFactory.rotateSelected();
        historyManager.saveState();
      });
    }

    const mobileDelete = document.getElementById('mobile-btn-delete');
    if (mobileDelete) {
      mobileDelete.addEventListener('click', () => {
        frameFactory.deleteSelected();
        _updateEmptyMsg();
        historyManager.saveState();
      });
    }

    const mobileClear = document.getElementById('mobile-btn-clear');
    if (mobileClear) {
      mobileClear.addEventListener('click', () => {
        if (canvasManager.getStampFrames().length === 0) return;
        if (confirm('全てのスタンプ枠を削除しますか？')) {
          frameFactory.deleteAll();
          _updateEmptyMsg();
          historyManager.saveState();
        }
      });
    }

    const mobileExport = document.getElementById('mobile-btn-export');
    if (mobileExport) {
      mobileExport.addEventListener('click', () => exporter.exportPNG());
    }

    // PSD書出し
    const btnExportPSD = document.getElementById('btn-export-psd');
    if (btnExportPSD) {
      btnExportPSD.addEventListener('click', () => exporter.exportPSD());
    }

    // モバイル: PSD書出し
    const mobileExportPSD = document.getElementById('mobile-btn-export-psd');
    if (mobileExportPSD) {
      mobileExportPSD.addEventListener('click', () => exporter.exportPSD());
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

    const updateSelection = () => {
      const selectedFrames = canvas.getActiveObjects().filter(o => o.isStampFrame);
      const hasSelection = selectedFrames.length > 0;

      // 削除ボタンの有効/無効
      const btn = document.getElementById('btn-delete-selected');
      if (btn) btn.disabled = !hasSelection;
      const mobileBtn = document.getElementById('mobile-btn-delete');
      if (mobileBtn) mobileBtn.disabled = !hasSelection;
    };

    canvas.on('selection:created', updateSelection);
    canvas.on('selection:updated', updateSelection);
    canvas.on('selection:cleared', updateSelection);
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

      // Ctrl+Z: Undo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        historyManager.undo();
        return;
      }

      // Ctrl+Shift+Z / Ctrl+Y: Redo
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Z') {
        e.preventDefault();
        historyManager.redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        historyManager.redo();
        return;
      }

      // Delete / Backspace: 選択削除
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        frameFactory.deleteSelected();
        _updateEmptyMsg();
        historyManager.saveState();
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
        historyManager.saveState();
      }

      // Escape: 選択解除 + 画像配置モード解除
      if (e.key === 'Escape') {
        canvasManager.getCanvas().discardActiveObject();
        canvasManager.getCanvas().requestRenderAll();
        if (imagePlacer && imagePlacer.selectedId) {
          imagePlacer.deselect();
        }
      }
    });
  }

  // === 画像配置セットアップ ===
  function _setupImagePlacer() {
    // PC用: アップロードゾーンクリック → ファイル入力
    const uploadZone = document.getElementById('image-upload-zone');
    const fileInput = document.getElementById('placer-file-input');
    if (uploadZone && fileInput) {
      uploadZone.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => {
        imagePlacer.importFiles(fileInput.files);
        fileInput.value = '';
      });
    }

    // モバイル用: 画像追加ボタン
    const mobileUploadBtn = document.getElementById('mobile-image-upload-btn');
    if (mobileUploadBtn && fileInput) {
      mobileUploadBtn.addEventListener('click', () => fileInput.click());
    }

    // キャンバスクリック: 配置モード中なら枠に画像を配置
    const canvas = canvasManager.getCanvas();
    canvas.on('mouse:down', (opt) => {
      if (!imagePlacer.selectedId) return;

      const target = opt.target;
      if (target && target.isStampFrame) {
        const placed = imagePlacer.placeInFrame(target);
        if (placed) {
          // 配置成功
          canvas.discardActiveObject();
          canvas.requestRenderAll();
          historyManager.saveState();
        }
      }
    });

    // sessionStorageからの転送データをチェック
    imagePlacer.checkSessionStorage();
    imagePlacer.renderList();
  }

  // === 履歴管理（Undo/Redo）セットアップ ===
  function _setupHistory() {
    const canvas = canvasManager.getCanvas();

    // 枠または配置画像の変更完了時に状態を保存
    canvas.on('object:modified', (opt) => {
      if (opt.target && (opt.target.isStampFrame || opt.target.isPlacedImage)) {
        historyManager.saveState();
      }
      // ActiveSelection（複数選択で移動）の場合
      if (opt.target && opt.target.type === 'activeSelection') {
        const objs = opt.target.getObjects();
        if (objs.some(o => o.isStampFrame || o.isPlacedImage)) {
          historyManager.saveState();
        }
      }
    });

    // ActiveSelection移動中に配置画像を追従させる
    canvas.on('object:moving', (opt) => {
      if (opt.target && opt.target.type === 'activeSelection') {
        imagePlacer.syncAllFrameImages(opt.target);
      }
    });

    // undo/redoボタンのクリックイベント
    document.querySelectorAll('.undo-redo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'undo') historyManager.undo();
        if (action === 'redo') historyManager.redo();
      });
    });

    // iPad: 2本指タップでUndo
    _setupTwoFingerUndo();
  }

  // === iPad 2本指タップでUndo ===
  function _setupTwoFingerUndo() {
    let twoFingerStart = null; // { time, x1, y1, x2, y2 }
    let hasMoved = false;

    const canvasWrapper = canvasManager.getCanvas().wrapperEl || document.getElementById('canvas-area');

    canvasWrapper.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        twoFingerStart = {
          time: Date.now(),
          x1: e.touches[0].clientX,
          y1: e.touches[0].clientY,
          x2: e.touches[1].clientX,
          y2: e.touches[1].clientY,
        };
        hasMoved = false;
      }
    }, { passive: true });

    canvasWrapper.addEventListener('touchmove', (e) => {
      if (!twoFingerStart || e.touches.length !== 2) return;

      // 移動量をチェック（ピンチズームとの区別）
      const dx1 = e.touches[0].clientX - twoFingerStart.x1;
      const dy1 = e.touches[0].clientY - twoFingerStart.y1;
      const dx2 = e.touches[1].clientX - twoFingerStart.x2;
      const dy2 = e.touches[1].clientY - twoFingerStart.y2;
      const dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
      const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

      if (dist1 > 15 || dist2 > 15) {
        hasMoved = true;
      }
    }, { passive: true });

    canvasWrapper.addEventListener('touchend', () => {
      if (!twoFingerStart) return;

      const elapsed = Date.now() - twoFingerStart.time;

      // 300ms以内 かつ 移動なし → Undo
      if (elapsed < 300 && !hasMoved) {
        historyManager.undo();
      }

      twoFingerStart = null;
      hasMoved = false;
    }, { passive: true });
  }

  // === ドラッグ&ドロップで画像配置 ===
  function _setupDragDrop() {
    const canvasArea = document.getElementById('canvas-area');

    canvasArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      canvasArea.classList.add('drag-over');
    });

    canvasArea.addEventListener('dragleave', (e) => {
      // canvas-areaの外に出た場合のみクラスを除去
      if (!canvasArea.contains(e.relatedTarget)) {
        canvasArea.classList.remove('drag-over');
      }
    });

    canvasArea.addEventListener('drop', (e) => {
      e.preventDefault();
      canvasArea.classList.remove('drag-over');

      // ドロップ位置のキャンバス座標を取得
      const canvas = canvasManager.getCanvas();
      const canvasEl = canvas.getElement();
      const rect = canvasEl.getBoundingClientRect();
      const vpt = canvas.viewportTransform;
      const canvasX = (e.clientX - rect.left - vpt[4]) / vpt[0];
      const canvasY = (e.clientY - rect.top - vpt[5]) / vpt[3];

      // ドロップ位置にある枠を検出
      const frames = canvasManager.getStampFrames();
      let targetFrame = null;
      for (const frame of frames) {
        if (canvasX >= frame.left &&
            canvasX <= frame.left + frame.stampWidth &&
            canvasY >= frame.top &&
            canvasY <= frame.top + frame.stampHeight) {
          targetFrame = frame;
          break;
        }
      }

      // サイドバーからの画像ドラッグかチェック
      const internalData = e.dataTransfer.getData('text/plain');
      if (internalData && internalData.startsWith('placer-image:')) {
        const imageId = parseInt(internalData.split(':')[1]);
        if (targetFrame && imageId) {
          imagePlacer.selectedId = imageId;
          imagePlacer.placeInFrame(targetFrame);
          canvas.requestRenderAll();
          historyManager.saveState();
        }
        return;
      }

      // 外部ファイルのドロップ
      const files = e.dataTransfer.files;
      if (!files || files.length === 0) return;

      imagePlacer.importFilesWithCallback(files, (imageId) => {
        if (targetFrame && imageId) {
          imagePlacer.selectedId = imageId;
          imagePlacer.placeInFrame(targetFrame);
          canvas.requestRenderAll();
          historyManager.saveState();
        }
      });
    });
  }

  // === タイトル表示 ===
  function _setupTitle() {
    const input = document.getElementById('title-input');
    if (!input) return;

    // ページ読み込み時に今日の日付をドロップダウンにセット
    const now = new Date();
    const yearSel = document.getElementById('title-year');
    const monthSel = document.getElementById('title-month');
    const daySel = document.getElementById('title-day');
    if (yearSel) yearSel.value = String(now.getFullYear());
    if (monthSel) monthSel.value = String(now.getMonth() + 1);
    if (daySel) daySel.value = String(now.getDate());

    const canvas = canvasManager.getCanvas();

    // A4上部左揃えにタイトルテキストを作成（mm単位）
    const titleText = new fabric.Text(input.value || '入稿データ', {
      fontSize: 5,
      fontFamily: 'Noto Sans JP, sans-serif',
      fontWeight: 'bold',
      fill: '#000000',
      originX: 'left',
      originY: 'top',
      left: 5,
      top: 2,
      selectable: false,
      evented: false,
      isTitleText: true,
    });

    canvas.add(titleText);
    canvas.requestRenderAll();

    // 入力欄の変更をキャンバスに反映
    const syncTitle = () => {
      titleText.set('text', input.value || '入稿データ');
      canvas.requestRenderAll();
    };
    input.addEventListener('input', syncTitle);

    // 「適用」ボタン: 全ドロップダウンの値を組み合わせてタイトルに設定
    const btnApply = document.getElementById('title-btn-apply');
    if (btnApply) {
      btnApply.addEventListener('click', () => {
        const maker = document.getElementById('title-maker')?.value || '';
        const prefix = document.getElementById('title-prefix')?.value || '';
        const year = document.getElementById('title-year')?.value || '';
        const month = document.getElementById('title-month')?.value || '';
        const day = document.getElementById('title-day')?.value || '1';
        const parts = [maker, prefix, `${year}年${month}月${day}日`];
        input.value = parts.join('_');
        syncTitle();
      });
    }
  }

  // === 保存/読込（ファイルベース） ===
  function _setupStorage() {
    const btnSave = document.getElementById('btn-save');
    const btnLoad = document.getElementById('btn-load');

    if (btnSave) btnSave.addEventListener('click', _saveProject);
    if (btnLoad) btnLoad.addEventListener('click', _loadFromFile);
  }

  // プロジェクトをJSONファイルとしてダウンロード保存
  function _saveProject() {
    const titleInput = document.getElementById('title-input');
    const title = (titleInput && titleInput.value.trim()) || '入稿データ';

    // 現在のキャンバス状態をキャプチャ
    const snapshot = historyManager._capture();
    const serialized = snapshot.map(entry => ({
      stampId: entry.stampId,
      stampWidth: entry.stampWidth,
      stampHeight: entry.stampHeight,
      stampMemo: entry.stampMemo || '',
      left: entry.left,
      top: entry.top,
      makerKey: historyManager._findMakerKey(entry.category),
      categoryName: entry.category.name,
      placedImageId: entry.placedImageId,
      imageState: entry.imageState,
    }));

    const images = imagePlacer.images.map(img => ({
      id: img.id,
      name: img.name,
      dataURL: img.dataURL,
      memo: img.memo || '',
    }));

    const projectData = {
      title: title,
      maker: currentMaker,
      frames: serialized,
      images: images,
      nextId: imagePlacer.nextId,
    };

    // JSONファイルとしてダウンロード
    const json = JSON.stringify(projectData);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const fileName = (title.replace(/[\\/:*?"<>|]/g, '') || '入稿データ') + '.json';

    const link = document.createElement('a');
    link.download = fileName;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // 保存完了通知
    const btn = document.getElementById('btn-save');
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd"/></svg> 保存済み';
      btn.style.color = '#059669';
      setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; }, 1500);
    }
  }

  // ファイルを選択して読み込み
  function _loadFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const project = JSON.parse(ev.target.result);
          if (!project.frames || !Array.isArray(project.frames)) {
            alert('無効なファイルです。');
            return;
          }
          _loadProjectData(project);
        } catch (err) {
          console.error('読込エラー:', err);
          alert('ファイルの読み込みに失敗しました。');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  // プロジェクトデータからキャンバスを復元
  function _loadProjectData(project) {
    // 現在のキャンバスをクリア
    frameFactory.deleteAll();
    imagePlacer.images = [];
    imagePlacer.nextId = 1;
    imagePlacer.placements = {};
    imagePlacer.selectedId = null;
    imagePlacer.renderList();

    // タイトルを復元
    const title = project.title || '入稿データ';
    const titleInput = document.getElementById('title-input');
    if (titleInput) titleInput.value = title;
    const canvas = canvasManager.getCanvas();
    const titleObj = canvas.getObjects().find(o => o.isTitleText);
    if (titleObj) {
      titleObj.set('text', title);
    }

    // メーカータブを復元
    const maker = project.maker;
    if (maker) {
      currentMaker = maker;
      document.querySelectorAll('.maker-tab').forEach(t => {
        if (t.dataset.maker) {
          t.classList.toggle('active', t.dataset.maker === currentMaker);
        }
      });
      _renderStampList(currentMaker);
    }

    // 画像を復元
    const idMap = {};
    if (project.images && project.images.length > 0) {
      project.images.forEach(img => {
        const newId = imagePlacer._addImage(img.name, img.dataURL);
        idMap[img.id] = newId;
        // 画像メモを復元
        if (img.memo) {
          const addedImg = imagePlacer.images.find(i => i.id === newId);
          if (addedImg) addedImg.memo = img.memo;
        }
      });
      imagePlacer.renderList();
    }
    if (project.nextId) {
      imagePlacer.nextId = Math.max(imagePlacer.nextId, project.nextId);
    }

    // 枠を復元
    historyManager._isRestoring = true;
    project.frames.forEach(entry => {
      const category = historyManager._findCategory(entry.makerKey, entry.categoryName);
      if (!category) return;

      const stamp = { id: entry.stampId, width: entry.stampWidth, height: entry.stampHeight };
      const newFrame = frameFactory.createFrame(stamp, category, { left: entry.left, top: entry.top });

      // 枠メモの復元
      if (entry.stampMemo) {
        frameFactory.updateMemo(newFrame, entry.stampMemo);
      }

      // 配置画像の復元
      if (entry.placedImageId && imagePlacer) {
        const mappedId = idMap[entry.placedImageId] || entry.placedImageId;
        imagePlacer.restorePlacement(newFrame, {
          imageId: mappedId,
          imageState: entry.imageState || null,
        });
      }
    });
    historyManager._isRestoring = false;

    // 履歴をリセット
    historyManager.undoStack = [];
    historyManager.redoStack = [];
    historyManager.saveState();

    _updateEmptyMsg();
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }

  // HTMLエスケープ
  function _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // === ページ遷移時の枠データ保存 ===
  function _setupNavigation() {
    // 二値化ツールへのリンクをインターセプト（保存してから遷移）
    document.querySelectorAll('a[href="binarize.html"]').forEach(link => {
      link.addEventListener('click', () => {
        historyManager.saveToSession();
      });
    });
  }

})();
