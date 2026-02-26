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
    this.gridSpacing = 5; // 5mmグリッド表示（スナップは1mm）
    this.snapGrid = 1;    // 1mmスナップ

    // Fabric.jsがキャンバスをラップする前にコンテナを記録
    this.containerEl = this.canvasEl.parentElement;

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
    });

    this._fitToContainer();
    this._drawA4Border();
    this._drawGrid();
    this._setupZoom();
    this._setupPan();
    this._setupResize();
    this._setupTouch();
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

  // ピンチズーム・2本指パン（タッチ対応）
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
          Math.pow(t2.clientX - t1.clientX, 2) +
          Math.pow(t2.clientY - t1.clientY, 2)
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

    // タッチ終了時のリセット
    const canvasWrapper = this.canvas.wrapperEl || this.containerEl;
    const resetTouch = () => {
      if (touching) {
        lastDist = 0;
        lastCenter = null;
        touching = false;
        this.canvas.selection = true;
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

  // スナップ処理（1mm単位）
  snapToGrid(value) {
    return Math.round(value / this.snapGrid) * this.snapGrid;
  }

  // 全オブジェクトのスタンプ枠を取得
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
