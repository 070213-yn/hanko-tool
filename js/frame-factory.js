// 枠オブジェクト生成（外枠+内枠+ラベルのグループ）

class FrameFactory {
  constructor(canvasManager) {
    this.cm = canvasManager;
    this.nextX = 5;  // 次に配置するX座標（mm）
    this.nextY = 5;  // 次に配置するY座標（mm）
    this.rowMaxHeight = 0; // 現在行の最大高さ
    this.padding = 3; // 枠間の余白（mm）
  }

  // スタンプ枠を作成してキャンバスに追加
  createFrame(stamp, category) {
    const { width, height } = stamp;
    const margin = category.margin;

    // 内枠（印面サイズ）- 赤破線
    const innerW = width - margin * 2;
    const innerH = height - margin * 2;

    const innerRect = new fabric.Rect({
      width: innerW,
      height: innerH,
      left: margin,
      top: margin,
      fill: 'transparent',
      stroke: category.innerStroke,
      strokeWidth: 0.3,
      strokeDashArray: category.innerStrokeDash,
      selectable: false,
      evented: false,
    });

    // 外枠 - メーカー色
    const outerRect = new fabric.Rect({
      width: width,
      height: height,
      left: 0,
      top: 0,
      fill: 'rgba(255, 255, 255, 0.5)',
      stroke: category.outerStroke,
      strokeWidth: 0.4,
      strokeDashArray: category.outerStrokeDash,
      selectable: false,
      evented: false,
    });

    // ラベル（サイズ名）
    const fontSize = Math.min(width, height) * 0.3;
    const clampedSize = Math.max(3, Math.min(8, fontSize));
    const label = new fabric.Text(stamp.id, {
      fontSize: clampedSize,
      fill: category.labelColor,
      fontFamily: 'sans-serif',
      fontWeight: 'bold',
      selectable: false,
      evented: false,
      originX: 'center',
      originY: 'center',
      left: width / 2,
      top: height / 2,
      opacity: 0.4,
    });

    // グループ化
    const group = new fabric.Group([outerRect, innerRect, label], {
      left: 0,
      top: 0,
      // 拡縮・回転をロック
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true,
      hasControls: false,
      hasBorders: true,
      borderColor: '#2563eb',
      borderScaleFactor: 1.5,
      // カスタムプロパティ
      isStampFrame: true,
      stampId: stamp.id,
      stampWidth: width,
      stampHeight: height,
      categoryName: category.name,
    });

    // 配置位置を計算
    const pos = this._getNextPosition(width, height);
    group.set({ left: pos.x, top: pos.y });

    // キャンバスに追加
    const canvas = this.cm.getCanvas();
    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.requestRenderAll();

    // グリッドスナップイベント
    this._setupSnap(group);

    // 配置数を更新
    this._updateFrameCount();

    return group;
  }

  // 次の配置位置を計算（横方向に並べ、はみ出したら改行）
  _getNextPosition(width, height) {
    const maxX = FRAME_DATA.A4_WIDTH - width;
    const maxY = FRAME_DATA.A4_HEIGHT - height;

    // 横方向に入らなければ改行
    if (this.nextX + width > FRAME_DATA.A4_WIDTH - 3) {
      this.nextX = 5;
      this.nextY += this.rowMaxHeight + this.padding;
      this.rowMaxHeight = 0;
    }

    // 縦方向もはみ出す場合は左上に戻す
    if (this.nextY + height > FRAME_DATA.A4_HEIGHT - 3) {
      this.nextX = 5;
      this.nextY = 5;
      this.rowMaxHeight = 0;
    }

    const x = this.cm.snapToGrid(this.nextX);
    const y = this.cm.snapToGrid(this.nextY);

    // 次の位置を更新
    this.nextX += width + this.padding;
    this.rowMaxHeight = Math.max(this.rowMaxHeight, height);

    return { x, y };
  }

  // ドラッグ時のグリッドスナップ
  _setupSnap(obj) {
    obj.on('moving', () => {
      const snappedLeft = this.cm.snapToGrid(obj.left);
      const snappedTop = this.cm.snapToGrid(obj.top);
      obj.set({ left: snappedLeft, top: snappedTop });
    });

    // 移動後にA4内に収まるようクランプ
    obj.on('modified', () => {
      let left = obj.left;
      let top = obj.top;
      const w = obj.width * (obj.scaleX || 1);
      const h = obj.height * (obj.scaleY || 1);

      left = Math.max(0, Math.min(left, FRAME_DATA.A4_WIDTH - w));
      top = Math.max(0, Math.min(top, FRAME_DATA.A4_HEIGHT - h));

      obj.set({
        left: this.cm.snapToGrid(left),
        top: this.cm.snapToGrid(top),
      });
      obj.setCoords();
      this.cm.getCanvas().requestRenderAll();
    });
  }

  // 配置数表示を更新
  _updateFrameCount() {
    const count = this.cm.getStampFrames().length;
    const el = document.getElementById('frame-count');
    if (el) {
      const numEl = el.querySelector('.frame-counter-num');
      if (numEl) {
        numEl.textContent = count;
      } else {
        el.textContent = `配置数: ${count}`;
      }
    }
  }

  // 選択中のオブジェクトを削除
  deleteSelected() {
    const canvas = this.cm.getCanvas();
    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length === 0) return;

    activeObjects.forEach(obj => {
      if (obj.isStampFrame) {
        canvas.remove(obj);
      }
    });
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    this._updateFrameCount();
  }

  // 全スタンプ枠を削除
  deleteAll() {
    const canvas = this.cm.getCanvas();
    const frames = this.cm.getStampFrames();
    frames.forEach(f => canvas.remove(f));
    canvas.discardActiveObject();
    canvas.requestRenderAll();

    // 配置位置をリセット
    this.nextX = 5;
    this.nextY = 5;
    this.rowMaxHeight = 0;
    this._updateFrameCount();
  }
}
