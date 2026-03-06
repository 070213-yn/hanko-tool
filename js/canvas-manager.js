// Fabric.jsキャンバス管理（ズーム、パン、グリッド、2段階タッチ）

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
    this.snapGrid = 1;    // 1mmスナップ

    // 2段階タッチ: 1回目→選択、2回目→移動可能
    this.activatedFrame = null; // 移動が許可された（2回タッチされた）枠

    // Fabric.jsがキャンバスをラップする前にコンテナを記録
    this.containerEl = this.canvasEl.parentElement;

    this._init();
  }

  _init() {
    this.canvas = new fabric.Canvas(this.canvasEl, {
      backgroundColor: '#FFFFFF',
      selection: true,
      preserveObjectStacking: true,
      stopContextMenu: true,
      fireRightClick: true,
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
    const container = this.containerEl;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight;

    const scaleX = containerW / FRAME_DATA.A4_WIDTH;
    const scaleY = containerH / FRAME_DATA.A4_HEIGHT;
    this.zoom = Math.min(scaleX, scaleY) * 0.9;

    this.canvas.setDimensions({ width: containerW, height: containerH });

    const vpt = this.canvas.viewportTransform;
    vpt[0] = this.zoom;
    vpt[3] = this.zoom;
    vpt[4] = (containerW - FRAME_DATA.A4_WIDTH * this.zoom) / 2;
    vpt[5] = (containerH - FRAME_DATA.A4_HEIGHT * this.zoom) / 2;
    this.canvas.setViewportTransform(vpt);
  }

  // A4外枠を描画
  _drawA4Border() {
    const border = new fabric.Rect({
      left: 0,
      top: 0,
      width: FRAME_DATA.A4_WIDTH,
      height: FRAME_DATA.A4_HEIGHT,
      fill: '#FFFFFF',
      stroke: '#333333',
      strokeWidth: 0.5,
      selectable: false,
      evented: false,
      excludeFromExport: false,
      isA4Border: true,
    });
    this.canvas.add(border);
    this.canvas.sendToBack(border);
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
        stroke: '#E0E0E0', strokeWidth: 0.2,
        selectable: false, evented: false, excludeFromExport: true, isGrid: true,
      });
      this.gridLines.push(line);
      this.canvas.add(line);
    }

    for (let y = spacing; y < h; y += spacing) {
      const line = new fabric.Line([0, y, w, y], {
        stroke: '#E0E0E0', strokeWidth: 0.2,
        selectable: false, evented: false, excludeFromExport: true, isGrid: true,
      });
      this.gridLines.push(line);
      this.canvas.add(line);
    }

    this.gridLines.forEach(line => this.canvas.sendToBack(line));
    const a4Border = this.canvas.getObjects().find(o => o.isA4Border);
    if (a4Border) this.canvas.sendToBack(a4Border);
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

  // === 2段階タッチ ===
  // 1回目タッチ → 選択のみ（移動不可）
  // 2回目タッチ（同じ枠） → 移動可能になる
  _setupTwoStepTouch() {
    this.canvas.on('mouse:down', (opt) => {
      if (this.isPanning) return;
      const target = opt.target;

      if (target && target.isStampFrame) {
        if (this.activatedFrame === target) {
          // 2回目: すでにアクティブ → 移動許可（何もしない、ロック解除済み）
        } else {
          // 1回目: 選択だけして移動をロック
          target.set({ lockMovementX: true, lockMovementY: true });
          this.canvas.setActiveObject(target);

          // 前のアクティブ枠のロックを戻す
          if (this.activatedFrame) {
            this.activatedFrame.set({ lockMovementX: true, lockMovementY: true });
            this._updateFrameAppearance(this.activatedFrame, false);
          }

          this.activatedFrame = null;
          this.canvas.requestRenderAll();
        }
      }
    });

    // ダブルクリック / 2回目タッチで移動を有効化
    this.canvas.on('mouse:dblclick', (opt) => {
      const target = opt.target;
      if (target && target.isStampFrame) {
        this._activateFrame(target);
      }
    });

    // 選択済み枠をもう一度タップ → 移動有効化
    this.canvas.on('mouse:up', (opt) => {
      const target = opt.target;
      if (target && target.isStampFrame && !this.activatedFrame) {
        const active = this.canvas.getActiveObject();
        if (active === target) {
          // 既に選択されている枠をタップ → 次回から移動可能に
          this._activateFrame(target);
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
    this.canvas.on('selection:updated', (opt) => {
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

  // Alt+ドラッグでパン
  _setupPan() {
    this.canvas.on('mouse:down', (opt) => {
      if (opt.e.altKey || opt.e.button === 1) {
        this.isPanning = true;
        this.lastPanPoint = { x: opt.e.clientX, y: opt.e.clientY };
        this.canvas.selection = false;
        this.canvas.defaultCursor = 'grab';
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
      }
    });
  }

  // ピンチズーム・2本指パン
  _setupTouch() {
    let lastDist = 0;
    let lastCenter = null;
    let touching = false;

    this.canvas.on('touch:gesture', (opt) => {
      const e = opt.e;
      if (e.touches && e.touches.length === 2) {
        touching = true;
        this.canvas.selection = false;

        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const dist = Math.sqrt(
          Math.pow(t2.clientX - t1.clientX, 2) + Math.pow(t2.clientY - t1.clientY, 2)
        );
        const center = {
          x: (t1.clientX + t2.clientX) / 2,
          y: (t1.clientY + t2.clientY) / 2,
        };

        if (lastDist > 0) {
          const scale = dist / lastDist;
          let newZoom = this.zoom * scale;
          newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));

          const point = new fabric.Point(center.x, center.y);
          this.canvas.zoomToPoint(point, newZoom);
          this.zoom = newZoom;

          if (lastCenter) {
            const vpt = this.canvas.viewportTransform;
            vpt[4] += center.x - lastCenter.x;
            vpt[5] += center.y - lastCenter.y;
            this.canvas.setViewportTransform(vpt);
          }
          this._onZoomChange();
        }

        lastDist = dist;
        lastCenter = center;
      }
    });

    const resetTouch = () => {
      if (touching) {
        lastDist = 0;
        lastCenter = null;
        touching = false;
        this.canvas.selection = true;
      }
    };

    this.canvasEl.addEventListener('touchend', resetTouch);
    this.canvasEl.addEventListener('touchcancel', resetTouch);
  }

  // ウィンドウリサイズ対応
  _setupResize() {
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const container = this.containerEl;
        this.canvas.setDimensions({
          width: container.clientWidth,
          height: container.clientHeight,
        });
        this.canvas.requestRenderAll();
      }, 100);
    });
  }

  _onZoomChange() {
    const pct = Math.round(this.zoom / this._getBaseZoom() * 100);
    document.dispatchEvent(new CustomEvent('zoom-change', { detail: { percent: pct, zoom: this.zoom } }));
  }

  _getBaseZoom() {
    const container = this.containerEl;
    const scaleX = container.clientWidth / FRAME_DATA.A4_WIDTH;
    const scaleY = container.clientHeight / FRAME_DATA.A4_HEIGHT;
    return Math.min(scaleX, scaleY) * 0.9;
  }

  setZoomPercent(percent) {
    const baseZoom = this._getBaseZoom();
    const newZoom = baseZoom * (percent / 100);
    const capped = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));

    const container = this.containerEl;
    const center = new fabric.Point(container.clientWidth / 2, container.clientHeight / 2);
    this.canvas.zoomToPoint(center, capped);
    this.zoom = capped;
    this._onZoomChange();
  }

  resetView() {
    this._fitToContainer();
    this._onZoomChange();
    this.canvas.requestRenderAll();
  }

  snapToGrid(value) {
    return Math.round(value / this.snapGrid) * this.snapGrid;
  }

  getStampFrames() {
    return this.canvas.getObjects().filter(o => o.isStampFrame);
  }

  getCanvas() {
    return this.canvas;
  }

  destroy() {
    this.canvas.dispose();
  }
}
