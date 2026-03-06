// Fabric.jsキャンバス管理（ズーム、パン、グリッド）

class CanvasManager {
  constructor(canvasId) {
    this.canvasEl = document.getElementById(canvasId);
    this.canvas = null;
    this.zoom = 1;
    this.minZoom = 0.15;
    this.maxZoom = 5;
    this.isPanning = false;
    this.lastPanPoint = null;
    this.gridLines = [];
    this.gridVisible = true;
    this.gridSpacing = 5; // 5mmグリッド表示
    this.snapGrid = 1;    // 1mmスナップ（デフォルト）
    this.snapToGridEnabled = false; // グリッドスナップ（5mm）のON/OFF
    this.activatedFrame = null; // 2段階タッチで移動可能になった枠

    // Fabric.jsがキャンバスをラップする前にコンテナを記録
    this.containerEl = document.getElementById('canvas-container') || this.canvasEl.parentElement;

    this._init();
  }

  _init() {
    // Fabric.js v5 キャンバス初期化
    this.canvas = new fabric.Canvas(this.canvasEl, {
      backgroundColor: '#FFFFFF',
      selection: true,
      preserveObjectStacking: true,
      stopContextMenu: true,
      fireRightClick: true,
      fireMiddleClick: true,  // 中ボタンイベントを有効化（パン用）
    });

    this._fitToContainer();
    this._drawA4Border();
    this._drawGrid();
    this._setupZoom();
    this._setupPan();
    this._setupResize();
    this._setupTouch();
    this._setupTwoStepTouch();
  }

  // コンテナに合わせてキャンバスサイズを設定
  _fitToContainer() {
    const containerW = this.containerEl.clientWidth;
    const containerH = this.containerEl.clientHeight;

    // コンテナサイズが0の場合はフォールバック
    if (containerW === 0 || containerH === 0) {
      setTimeout(() => this._fitToContainer(), 50);
      return;
    }

    // A4のアスペクト比を維持してフィット
    const scaleX = containerW / FRAME_DATA.A4_WIDTH;
    const scaleY = containerH / FRAME_DATA.A4_HEIGHT;
    this.zoom = Math.min(scaleX, scaleY) * 0.9;

    this.canvas.setDimensions({
      width: containerW,
      height: containerH,
    });

    // ビューポートを中央に配置
    const vpt = this.canvas.viewportTransform;
    vpt[0] = this.zoom;
    vpt[3] = this.zoom;
    vpt[4] = (containerW - FRAME_DATA.A4_WIDTH * this.zoom) / 2;
    vpt[5] = (containerH - FRAME_DATA.A4_HEIGHT * this.zoom) / 2;
    this.canvas.setViewportTransform(vpt);
  }

  // A4外枠を描画（非選択可能）
  _drawA4Border() {
    const border = new fabric.Rect({
      left: 0,
      top: 0,
      width: FRAME_DATA.A4_WIDTH,
      height: FRAME_DATA.A4_HEIGHT,
      fill: '#FFFFFF',
      stroke: '#cbd5e1',
      strokeWidth: 0.3,
      selectable: false,
      evented: false,
      excludeFromExport: false,
      isA4Border: true,
    });

    // A4枠にドロップシャドウ風の効果
    const shadow = new fabric.Rect({
      left: 1,
      top: 1,
      width: FRAME_DATA.A4_WIDTH,
      height: FRAME_DATA.A4_HEIGHT,
      fill: 'rgba(0,0,0,0.06)',
      selectable: false,
      evented: false,
      excludeFromExport: true,
      isA4Shadow: true,
    });

    this.canvas.add(shadow);
    this.canvas.add(border);
    this.canvas.sendToBack(border);
    this.canvas.sendToBack(shadow);
  }

  // グリッド描画
  _drawGrid() {
    this._removeGrid();
    if (!this.gridVisible) return;

    const w = FRAME_DATA.A4_WIDTH;
    const h = FRAME_DATA.A4_HEIGHT;
    const spacing = this.gridSpacing;

    for (let x = spacing; x < w; x += spacing) {
      const line = new fabric.Line([x, 0, x, h], {
        stroke: '#e2e8f0',
        strokeWidth: 0.15,
        selectable: false,
        evented: false,
        excludeFromExport: true,
        isGrid: true,
      });
      this.gridLines.push(line);
      this.canvas.add(line);
    }

    for (let y = spacing; y < h; y += spacing) {
      const line = new fabric.Line([0, y, w, y], {
        stroke: '#e2e8f0',
        strokeWidth: 0.15,
        selectable: false,
        evented: false,
        excludeFromExport: true,
        isGrid: true,
      });
      this.gridLines.push(line);
      this.canvas.add(line);
    }

    // グリッドを最背面に
    this.gridLines.forEach(line => this.canvas.sendToBack(line));

    // A4枠とシャドウを最背面に
    const a4Border = this.canvas.getObjects().find(o => o.isA4Border);
    const a4Shadow = this.canvas.getObjects().find(o => o.isA4Shadow);
    if (a4Border) this.canvas.sendToBack(a4Border);
    if (a4Shadow) this.canvas.sendToBack(a4Shadow);

    this.canvas.requestRenderAll();
  }

  _removeGrid() {
    this.gridLines.forEach(line => this.canvas.remove(line));
    this.gridLines = [];
  }

  toggleGrid() {
    this.gridVisible = !this.gridVisible;
    this._drawGrid();
    return this.gridVisible;
  }

  // マウスホイールでズーム
  _setupZoom() {
    this.canvas.on('mouse:wheel', (opt) => {
      const delta = opt.e.deltaY;
      let newZoom = this.zoom * (1 - delta * 0.001);
      newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));

      const point = new fabric.Point(opt.e.offsetX, opt.e.offsetY);
      this.canvas.zoomToPoint(point, newZoom);
      this.zoom = newZoom;

      opt.e.preventDefault();
      opt.e.stopPropagation();

      this._onZoomChange();
    });
  }

  // Alt+ドラッグ または 中ボタン+ドラッグでパン
  _setupPan() {
    this.canvas.on('mouse:down', (opt) => {
      if (opt.e.altKey || opt.e.button === 1) {
        this.isPanning = true;
        this.lastPanPoint = { x: opt.e.clientX, y: opt.e.clientY };
        this.canvas.selection = false;
        this.canvas.defaultCursor = 'grabbing';
        this.canvas.setCursor('grabbing');
        opt.e.preventDefault();  // 中ボタンの自動スクロールを防止
      }
    });

    this.canvas.on('mouse:move', (opt) => {
      if (this.isPanning && this.lastPanPoint) {
        const dx = opt.e.clientX - this.lastPanPoint.x;
        const dy = opt.e.clientY - this.lastPanPoint.y;
        const vpt = this.canvas.viewportTransform;
        vpt[4] += dx;
        vpt[5] += dy;
        this.canvas.setViewportTransform(vpt);
        this.lastPanPoint = { x: opt.e.clientX, y: opt.e.clientY };
      }
    });

    this.canvas.on('mouse:up', () => {
      if (this.isPanning) {
        this.isPanning = false;
        this.lastPanPoint = null;
        this.canvas.selection = true;
        this.canvas.defaultCursor = 'default';
        this.canvas.setCursor('default');
      }
    });

    // 中ボタンの自動スクロール防止（ブラウザのデフォルト動作を抑制）
    const wrapper = this.canvas.wrapperEl || this.containerEl;
    wrapper.addEventListener('mousedown', (e) => {
      if (e.button === 1) {
        e.preventDefault();
      }
    });
  }

  // ピンチズーム・2本指パン（タッチ対応 - ネイティブタッチイベント使用）
  _setupTouch() {
    const canvasWrapper = this.canvas.wrapperEl || this.containerEl;

    let lastDist = 0;
    let lastCenter = null;
    let isTwoFingerTouch = false;

    // 2本指の距離を計算
    const getTouchDist = (t1, t2) => {
      return Math.sqrt(
        (t2.clientX - t1.clientX) ** 2 +
        (t2.clientY - t1.clientY) ** 2
      );
    };

    // 2本指の中心を計算
    const getTouchCenter = (t1, t2) => {
      return {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
    };

    canvasWrapper.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        // 2本指タッチ開始 → キャンバス操作モードに入る
        isTwoFingerTouch = true;
        this.canvas.selection = false;
        // Fabric.jsのオブジェクトドラッグを一時無効化
        this.canvas.forEachObject(obj => { obj._touchEvented = obj.evented; obj.evented = false; });

        lastDist = getTouchDist(e.touches[0], e.touches[1]);
        lastCenter = getTouchCenter(e.touches[0], e.touches[1]);

        e.preventDefault();
      }
    }, { passive: false });

    canvasWrapper.addEventListener('touchmove', (e) => {
      if (!isTwoFingerTouch || e.touches.length < 2) return;

      e.preventDefault();

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = getTouchDist(t1, t2);
      const center = getTouchCenter(t1, t2);

      // --- ピンチズーム ---
      if (lastDist > 0) {
        const scale = dist / lastDist;
        let newZoom = this.zoom * scale;
        newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));

        // 2本指の中心を基準にズーム
        const canvasRect = canvasWrapper.getBoundingClientRect();
        const point = new fabric.Point(
          center.x - canvasRect.left,
          center.y - canvasRect.top
        );
        this.canvas.zoomToPoint(point, newZoom);
        this.zoom = newZoom;
      }

      // --- 2本指パン（移動） ---
      if (lastCenter) {
        const dx = center.x - lastCenter.x;
        const dy = center.y - lastCenter.y;
        const vpt = this.canvas.viewportTransform;
        vpt[4] += dx;
        vpt[5] += dy;
        this.canvas.setViewportTransform(vpt);
      }

      lastDist = dist;
      lastCenter = center;

      this._onZoomChange();
    }, { passive: false });

    const resetTouch = () => {
      if (isTwoFingerTouch) {
        isTwoFingerTouch = false;
        lastDist = 0;
        lastCenter = null;
        this.canvas.selection = true;
        // オブジェクトのevented状態を復元
        this.canvas.forEachObject(obj => {
          if (obj._touchEvented !== undefined) {
            obj.evented = obj._touchEvented;
            delete obj._touchEvented;
          }
        });
        this.canvas.requestRenderAll();
      }
    };

    canvasWrapper.addEventListener('touchend', resetTouch);
    canvasWrapper.addEventListener('touchcancel', resetTouch);
  }

  // ウィンドウリサイズ対応
  _setupResize() {
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        this.canvas.setDimensions({
          width: this.containerEl.clientWidth,
          height: this.containerEl.clientHeight,
        });
        this.canvas.requestRenderAll();
      }, 100);
    });
  }

  // ズーム変更コールバック
  _onZoomChange() {
    const pct = Math.round(this.zoom / this._getBaseZoom() * 100);
    document.dispatchEvent(new CustomEvent('zoom-change', { detail: { percent: pct, zoom: this.zoom } }));
  }

  _getBaseZoom() {
    const containerW = this.containerEl.clientWidth;
    const containerH = this.containerEl.clientHeight;
    if (containerW === 0 || containerH === 0) return 1;
    const scaleX = containerW / FRAME_DATA.A4_WIDTH;
    const scaleY = containerH / FRAME_DATA.A4_HEIGHT;
    return Math.min(scaleX, scaleY) * 0.9;
  }

  // ズームをパーセント指定で設定
  setZoomPercent(percent) {
    const baseZoom = this._getBaseZoom();
    const newZoom = baseZoom * (percent / 100);
    const capped = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));

    const center = new fabric.Point(
      this.containerEl.clientWidth / 2,
      this.containerEl.clientHeight / 2
    );
    this.canvas.zoomToPoint(center, capped);
    this.zoom = capped;

    this._onZoomChange();
  }

  // フィットに戻す
  resetView() {
    this._fitToContainer();
    this._onZoomChange();
    this.canvas.requestRenderAll();
  }

  // スナップ処理（グリッドスナップON時は5mm、OFF時は1mm）
  snapToGrid(value) {
    const grid = this.snapToGridEnabled ? this.gridSpacing : this.snapGrid;
    return Math.round(value / grid) * grid;
  }

  // グリッドスナップの切替
  setSnapToGrid(enabled) {
    this.snapToGridEnabled = enabled;
  }

  // 全オブジェクトのスタンプ枠を取得
  getStampFrames() {
    return this.canvas.getObjects().filter(o => o.isStampFrame);
  }

  // 配置済み画像オブジェクトを取得
  getPlacedImages() {
    return this.canvas.getObjects().filter(o => o.isPlacedImage);
  }

  getCanvas() {
    return this.canvas;
  }

  // === 2段階タッチ ===
  // 1回目タッチ → 選択のみ（移動不可、長押しドラッグも不可）
  // 2回目タッチ（同じ枠） → 移動可能になる
  _setupTwoStepTouch() {
    // Fabric.jsがmouse:downでオブジェクトを選択する前の状態を記録
    let activeBeforeDown = null;

    this.canvas.on('mouse:down:before', () => {
      // mouse:down:beforeはFabric.jsの内部選択処理より前に発火する
      activeBeforeDown = this.canvas.getActiveObject();
    });

    this.canvas.on('mouse:down', (opt) => {
      if (this.isPanning) return;
      if (opt.e.altKey || opt.e.button === 1) return;
      const target = opt.target;

      // スタンプ枠と配置済み画像の両方を2段階タッチ対象にする
      if (target && (target.isStampFrame || target.isPlacedImage)) {
        if (this.activatedFrame === target) {
          // 既にアクティブ → そのまま移動可能
        } else if (activeBeforeDown === target && !this.activatedFrame) {
          // mouse:down:beforeの時点で既に選択済み = 2回目タッチ → 移動許可
          this._activateFrame(target);
        } else {
          // 新規選択（1回目タッチ）: 移動をロック
          target.set({ lockMovementX: true, lockMovementY: true });
          // ドラッグ時のリセット用に元の位置を記録
          target._frozenLeft = target.left;
          target._frozenTop = target.top;

          // 前のアクティブをリセット
          if (this.activatedFrame) {
            this.activatedFrame.set({ lockMovementX: true, lockMovementY: true });
            this._updateFrameAppearance(this.activatedFrame, false);
            this.activatedFrame = null;
          }

          this.canvas.requestRenderAll();
        }
      } else {
        // 空白クリック: アクティブリセット
        if (this.activatedFrame) {
          this.activatedFrame.set({ lockMovementX: true, lockMovementY: true });
          this._updateFrameAppearance(this.activatedFrame, false);
          this.activatedFrame = null;
        }
      }
    });

    // 未アクティブのオブジェクトが移動しようとしたら強制的に元の位置に戻す（長押しドラッグ対策）
    this.canvas.on('object:moving', (opt) => {
      const target = opt.target;
      if (target && (target.isStampFrame || target.isPlacedImage) && this.activatedFrame !== target) {
        if (target._frozenLeft !== undefined) {
          target.set({ left: target._frozenLeft, top: target._frozenTop });
        }
      }
    });

    // 選択解除時にリセット
    this.canvas.on('selection:cleared', () => {
      if (this.activatedFrame) {
        this.activatedFrame.set({ lockMovementX: true, lockMovementY: true });
        this._updateFrameAppearance(this.activatedFrame, false);
        this.activatedFrame = null;
      }
    });

    // 別のオブジェクトに選択が変わった時
    this.canvas.on('selection:updated', () => {
      if (this.activatedFrame) {
        this.activatedFrame.set({ lockMovementX: true, lockMovementY: true });
        this._updateFrameAppearance(this.activatedFrame, false);
        this.activatedFrame = null;
      }
    });
  }

  // 枠を「移動可能」状態にする
  _activateFrame(frame) {
    frame.set({ lockMovementX: false, lockMovementY: false });
    this.activatedFrame = frame;
    this._updateFrameAppearance(frame, true);
    this.canvas.requestRenderAll();

    // 移動可能になったことを通知
    document.dispatchEvent(new CustomEvent('frame-activated', { detail: { frame } }));
  }

  // 枠の外見を移動可能/不可で切り替え
  _updateFrameAppearance(frame, activated) {
    if (activated) {
      frame.set({
        borderColor: '#10b981',     // 緑 = 移動OK
        borderScaleFactor: 2,
      });
    } else {
      frame.set({
        borderColor: '#2563eb',     // 青 = 選択のみ
        borderScaleFactor: 1.5,
      });
    }
  }

  destroy() {
    this.canvas.dispose();
  }
}
