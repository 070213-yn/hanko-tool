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
  let currentProjectId = null; // 読み込み中のプロジェクトID
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

    // IndexedDB初期化
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
    const SHAPE_MAX_PX = 48; // 最大48px
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

  // === スタンプボタンにイベントを設定（クリック＋長押し対応） ===
  function _setupStampBtn(btn, stamp, cat) {
    let pressTimer = null;
    let longPressTriggered = false;

    // タッチデバイス: 長押し(500ms)で差し替え
    btn.addEventListener('touchstart', () => {
      longPressTriggered = false;
      pressTimer = setTimeout(() => {
        longPressTriggered = true;
        _handleStampClick(stamp, cat, { shiftKey: true });
      }, 500);
    }, { passive: true });

    btn.addEventListener('touchend', () => {
      clearTimeout(pressTimer);
    });

    btn.addEventListener('touchmove', () => {
      clearTimeout(pressTimer);
    }, { passive: true });

    // クリック: 通常追加 / Shift+クリックで差し替え（PC）
    btn.addEventListener('click', (e) => {
      if (longPressTriggered) {
        longPressTriggered = false;
        return; // 長押し後のクリックは無視
      }
      _handleStampClick(stamp, cat, e);
    });
  }

  // === スタンプボタンクリック処理 ===
  // 通常クリック/タップ: 新規追加（連続でどんどん追加可能）
  // Shift+クリック / 長押し: 選択中の枠を差し替え
  function _handleStampClick(stamp, cat, event) {
    const canvas = canvasManager.getCanvas();
    const activeObjects = canvas.getActiveObjects();
    const selectedFrames = activeObjects.filter(o => o.isStampFrame);

    // Shift+クリック: 選択中の枠を差し替え
    if (event && event.shiftKey && selectedFrames.length === 1) {
      canvas.discardActiveObject();
      frameFactory.replaceFrame(selectedFrames[0], stamp, cat);
      _updateEmptyMsg();
      historyManager.saveState();
      return;
    }

    // 通常クリック: 選択を解除して新規追加
    canvas.discardActiveObject();
    frameFactory.createFrame(stamp, cat);
    _updateEmptyMsg();
    historyManager.saveState();
    const hint = document.getElementById('usage-hint');
    if (hint) hint.classList.add('hidden');
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

    // 回転（縦横切替）
    const btnRotate = document.getElementById('btn-rotate');
    if (btnRotate) {
      btnRotate.addEventListener('click', () => {
        frameFactory.rotateSelected();
        historyManager.saveState();
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
      const singleFrame = selectedFrames.length === 1;

      // 削除ボタンの有効/無効
      const btn = document.getElementById('btn-delete-selected');
      if (btn) btn.disabled = !hasSelection;
      const mobileBtn = document.getElementById('mobile-btn-delete');
      if (mobileBtn) mobileBtn.disabled = !hasSelection;

      // 差し替えヒントの表示/非表示
      const hint = document.getElementById('replace-hint');
      if (hint) {
        hint.classList.toggle('hidden', !singleFrame);
      }
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

    // タイトルにテキストを追記するヘルパー
    function appendToTitle(text) {
      if (input.value && input.value.trim()) {
        input.value += ' ' + text;
      } else {
        input.value = text;
      }
      syncTitle();
    }

    // 「はんこどり」ボタン
    const btnHankodori = document.getElementById('title-btn-hankodori');
    if (btnHankodori) {
      btnHankodori.addEventListener('click', () => appendToTitle('はんこどり'));
    }

    // 「新作」ボタン（年月ドロップダウンの値を使う）
    const btnShinsaku = document.getElementById('title-btn-shinsaku');
    const yearSelect = document.getElementById('title-year');
    const monthSelect = document.getElementById('title-month');
    if (btnShinsaku && yearSelect && monthSelect) {
      btnShinsaku.addEventListener('click', () => {
        const text = `${yearSelect.value}年${monthSelect.value}月新作`;
        appendToTitle(text);
      });
    }
  }

  // === 保存/読込 ===
  function _setupStorage() {
    const btnSave = document.getElementById('btn-save');
    const btnLoad = document.getElementById('btn-load');
    const modal = document.getElementById('load-modal');
    const closeBtn = document.getElementById('load-modal-close');

    if (btnSave) btnSave.addEventListener('click', _saveProject);
    if (btnLoad) btnLoad.addEventListener('click', _openLoadModal);
    if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('show'));
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('show');
      });
    }
  }

  // プロジェクトを保存
  async function _saveProject() {
    if (!storageManager || !storageManager.db) {
      alert('保存機能の初期化に失敗しました。ページを再読み込みしてください。');
      return;
    }

    const titleInput = document.getElementById('title-input');
    const title = (titleInput && titleInput.value.trim()) || '入稿データ';

    // 現在のキャンバス状態をキャプチャ
    const snapshot = historyManager._capture();
    const serialized = snapshot.map(entry => ({
      stampId: entry.stampId,
      stampWidth: entry.stampWidth,
      stampHeight: entry.stampHeight,
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
    }));

    const project = {
      title: title,
      timestamp: Date.now(),
      frameCount: serialized.length,
      maker: currentMaker,
      data: {
        frames: serialized,
        images: images,
        nextId: imagePlacer.nextId,
      },
    };

    try {
      if (currentProjectId) {
        // 上書き保存
        project.id = currentProjectId;
        await storageManager.update(project);
      } else {
        // 新規保存
        const newId = await storageManager.save(project);
        currentProjectId = newId;
      }
      _showSaveNotice(title);
    } catch (e) {
      console.error('保存エラー:', e);
      alert('保存に失敗しました。');
    }
  }

  // 保存完了通知（一時表示）
  function _showSaveNotice(title) {
    const btn = document.getElementById('btn-save');
    if (!btn) return;
    const orig = btn.innerHTML;
    btn.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd"/></svg> 保存済み';
    btn.style.color = '#059669';
    setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; }, 1500);
  }

  // 読込モーダルを開く
  async function _openLoadModal() {
    const modal = document.getElementById('load-modal');
    const list = document.getElementById('load-list');
    const empty = document.getElementById('load-empty');
    if (!modal || !list) return;

    list.innerHTML = '';

    try {
      const projects = await storageManager.getAll();

      if (projects.length === 0) {
        empty.classList.add('show');
        list.style.display = 'none';
      } else {
        empty.classList.remove('show');
        list.style.display = 'block';

        projects.forEach(proj => {
          const d = new Date(proj.timestamp);
          const dateStr = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;

          const item = document.createElement('div');
          item.className = 'load-item';
          item.innerHTML = `
            <div class="load-item-info">
              <span class="load-item-title">${_escapeHtml(proj.title)}</span>
              <span class="load-item-meta">${dateStr} - ${proj.frameCount || 0}枠</span>
            </div>
            <div class="load-item-actions">
              <button class="load-item-btn" data-load-id="${proj.id}">読込</button>
              <button class="load-item-delete" data-delete-id="${proj.id}">&times;</button>
            </div>
          `;

          item.querySelector('.load-item-btn').addEventListener('click', async () => {
            await _loadProject(proj.id);
            modal.classList.remove('show');
          });

          item.querySelector('.load-item-delete').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm(`「${proj.title}」を削除しますか？`)) {
              await storageManager.delete(proj.id);
              if (currentProjectId === proj.id) currentProjectId = null;
              item.remove();
              // リストが空になったら空メッセージ表示
              const remaining = await storageManager.getAll();
              if (remaining.length === 0) {
                empty.classList.add('show');
                list.style.display = 'none';
              }
            }
          });

          list.appendChild(item);
        });
      }

      modal.classList.add('show');
    } catch (e) {
      console.error('読込一覧エラー:', e);
      alert('保存データの読み取りに失敗しました。');
    }
  }

  // プロジェクトを読み込み
  async function _loadProject(id) {
    const project = await storageManager.get(id);
    if (!project) return;

    // 現在のキャンバスをクリア
    frameFactory.deleteAll();
    imagePlacer.images = [];
    imagePlacer.nextId = 1;
    imagePlacer.placements = {};
    imagePlacer.selectedId = null;
    imagePlacer.renderList();

    // タイトルを復元
    const titleInput = document.getElementById('title-input');
    if (titleInput) titleInput.value = project.title;
    const canvas = canvasManager.getCanvas();
    const titleObj = canvas.getObjects().find(o => o.isTitleText);
    if (titleObj) {
      titleObj.set('text', project.title);
    }

    // メーカータブを復元
    if (project.maker) {
      currentMaker = project.maker;
      document.querySelectorAll('.maker-tab').forEach(t => {
        if (t.dataset.maker) {
          t.classList.toggle('active', t.dataset.maker === currentMaker);
        }
      });
      _renderStampList(currentMaker);
    }

    const data = project.data;

    // 画像を復元
    const idMap = {};
    if (data.images && data.images.length > 0) {
      data.images.forEach(img => {
        const newId = imagePlacer._addImage(img.name, img.dataURL);
        idMap[img.id] = newId;
      });
      imagePlacer.renderList();
    }
    if (data.nextId) {
      imagePlacer.nextId = Math.max(imagePlacer.nextId, data.nextId);
    }

    // 枠を復元
    historyManager._isRestoring = true;
    data.frames.forEach(entry => {
      const category = historyManager._findCategory(entry.makerKey, entry.categoryName);
      if (!category) return;

      const stamp = { id: entry.stampId, width: entry.stampWidth, height: entry.stampHeight };
      const newFrame = frameFactory.createFrame(stamp, category, { left: entry.left, top: entry.top });

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

    // 現在のプロジェクトIDを記録（上書き保存用）
    currentProjectId = id;

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
