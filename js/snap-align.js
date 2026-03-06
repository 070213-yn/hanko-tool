// グリッドスナップ・8種類の整列ツール

class SnapAlign {
  constructor(canvasManager) {
    this.cm = canvasManager;
  }

  // 選択中のスタンプ枠を取得
  _getSelectedFrames() {
    const canvas = this.cm.getCanvas();
    const active = canvas.getActiveObjects();
    return active.filter(o => o.isStampFrame);
  }

  // 左揃え
  alignLeft() {
    const frames = this._getSelectedFrames();
    if (frames.length < 2) return;
    const minLeft = Math.min(...frames.map(f => f.left));
    frames.forEach(f => {
      f.set({ left: minLeft });
      f.setCoords();
    });
    this.cm.getCanvas().requestRenderAll();
  }

  // 右揃え
  alignRight() {
    const frames = this._getSelectedFrames();
    if (frames.length < 2) return;
    const maxRight = Math.max(...frames.map(f => f.left + f.width * (f.scaleX || 1)));
    frames.forEach(f => {
      f.set({ left: maxRight - f.width * (f.scaleX || 1) });
      f.setCoords();
    });
    this.cm.getCanvas().requestRenderAll();
  }

  // 上揃え
  alignTop() {
    const frames = this._getSelectedFrames();
    if (frames.length < 2) return;
    const minTop = Math.min(...frames.map(f => f.top));
    frames.forEach(f => {
      f.set({ top: minTop });
      f.setCoords();
    });
    this.cm.getCanvas().requestRenderAll();
  }

  // 下揃え
  alignBottom() {
    const frames = this._getSelectedFrames();
    if (frames.length < 2) return;
    const maxBottom = Math.max(...frames.map(f => f.top + f.height * (f.scaleY || 1)));
    frames.forEach(f => {
      f.set({ top: maxBottom - f.height * (f.scaleY || 1) });
      f.setCoords();
    });
    this.cm.getCanvas().requestRenderAll();
  }

  // 水平中央揃え
  alignCenterH() {
    const frames = this._getSelectedFrames();
    if (frames.length < 2) return;
    const centers = frames.map(f => f.left + (f.width * (f.scaleX || 1)) / 2);
    const avgCenter = centers.reduce((a, b) => a + b, 0) / centers.length;
    frames.forEach(f => {
      f.set({ left: this.cm.snapToGrid(avgCenter - (f.width * (f.scaleX || 1)) / 2) });
      f.setCoords();
    });
    this.cm.getCanvas().requestRenderAll();
  }

  // 垂直中央揃え
  alignCenterV() {
    const frames = this._getSelectedFrames();
    if (frames.length < 2) return;
    const centers = frames.map(f => f.top + (f.height * (f.scaleY || 1)) / 2);
    const avgCenter = centers.reduce((a, b) => a + b, 0) / centers.length;
    frames.forEach(f => {
      f.set({ top: this.cm.snapToGrid(avgCenter - (f.height * (f.scaleY || 1)) / 2) });
      f.setCoords();
    });
    this.cm.getCanvas().requestRenderAll();
  }

  // 水平均等分布
  distributeH() {
    const frames = this._getSelectedFrames();
    if (frames.length < 3) return;

    // 左端順にソート
    frames.sort((a, b) => a.left - b.left);

    const first = frames[0];
    const last = frames[frames.length - 1];
    const totalWidth = frames.reduce((sum, f) => sum + f.width * (f.scaleX || 1), 0);
    const totalSpace = (last.left + last.width * (last.scaleX || 1)) - first.left - totalWidth;
    const gap = totalSpace / (frames.length - 1);

    let currentX = first.left;
    frames.forEach((f, i) => {
      if (i === 0) {
        currentX += f.width * (f.scaleX || 1) + gap;
        return;
      }
      f.set({ left: this.cm.snapToGrid(currentX) });
      f.setCoords();
      currentX += f.width * (f.scaleX || 1) + gap;
    });
    this.cm.getCanvas().requestRenderAll();
  }

  // 垂直均等分布
  distributeV() {
    const frames = this._getSelectedFrames();
    if (frames.length < 3) return;

    // 上端順にソート
    frames.sort((a, b) => a.top - b.top);

    const first = frames[0];
    const last = frames[frames.length - 1];
    const totalHeight = frames.reduce((sum, f) => sum + f.height * (f.scaleY || 1), 0);
    const totalSpace = (last.top + last.height * (last.scaleY || 1)) - first.top - totalHeight;
    const gap = totalSpace / (frames.length - 1);

    let currentY = first.top;
    frames.forEach((f, i) => {
      if (i === 0) {
        currentY += f.height * (f.scaleY || 1) + gap;
        return;
      }
      f.set({ top: this.cm.snapToGrid(currentY) });
      f.setCoords();
      currentY += f.height * (f.scaleY || 1) + gap;
    });
    this.cm.getCanvas().requestRenderAll();
  }

  // 整列コマンドを実行
  execute(type) {
    switch (type) {
      case 'left':        this.alignLeft(); break;
      case 'right':       this.alignRight(); break;
      case 'top':         this.alignTop(); break;
      case 'bottom':      this.alignBottom(); break;
      case 'centerH':     this.alignCenterH(); break;
      case 'centerV':     this.alignCenterV(); break;
      case 'distributeH': this.distributeH(); break;
      case 'distributeV': this.distributeV(); break;
    }
  }
}
