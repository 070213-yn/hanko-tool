// 枠オブジェクト生成（外枠+内枠+ラベルのグループ）
// メモテキスト・画像配置対応

class FrameFactory {
  constructor(canvasManager) {
    this.cm = canvasManager;
    this.nextX = 5;
    this.nextY = 10; // タイトル分の余白
    this.rowMaxHeight = 0;
    this.padding = 3;
    this.memoObjects = new Map(); // frameUniqueId → fabric.Text
    this.imageObjects = new Map(); // frameUniqueId → fabric.Image
    this._frameCounter = 0;
  }

  // スタンプ枠を作成してキャンバスに追加
  createFrame(stamp, category) {
    const { width, height } = stamp;
    const margin = category.margin;
    this._frameCounter++;
    const uniqueId = `${stamp.id}_${this._frameCounter}`;

    // 内枠（印面サイズ）
    const innerW = width - margin * 2;
    const innerH = height - margin * 2;

    const innerRect = new fabric.Rect({
      width: innerW, height: innerH, left: margin, top: margin,
      fill: 'transparent',
      stroke: category.innerStroke,
      strokeWidth: 0.3,
      strokeDashArray: category.innerStrokeDash,
      selectable: false, evented: false,
    });

    // 外枠
    const outerRect = new fabric.Rect({
      width: width, height: height, left: 0, top: 0,
      fill: 'rgba(255, 255, 255, 0.5)',
      stroke: category.outerStroke,
      strokeWidth: 0.4,
      strokeDashArray: category.outerStrokeDash,
      selectable: false, evented: false,
    });

    // ラベル
    const fontSize = Math.max(3, Math.min(8, Math.min(width, height) * 0.3));
    const label = new fabric.Text(stamp.id, {
      fontSize: fontSize,
      fill: category.labelColor,
      fontFamily: 'sans-serif',
      fontWeight: 'bold',
      selectable: false, evented: false,
      originX: 'center', originY: 'center',
      left: width / 2, top: height / 2,
      opacity: 0.4,
    });

    // グループ化
    const group = new fabric.Group([outerRect, innerRect, label], {
      left: 0, top: 0,
      // 初期状態: 移動ロック（2段階タッチの1回目で選択だけ）
      lockMovementX: true,
      lockMovementY: true,
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true,
      hasControls: false,
      hasBorders: true,
      borderColor: '#2563eb',
      borderScaleFactor: 1.5,
      // カスタムプロパティ
      isStampFrame: true,
      frameUniqueId: uniqueId,
      stampId: stamp.id,
      stampWidth: width,
      stampHeight: height,
      stampMargin: margin,
      categoryName: category.name,
      // PSD書き出し用の色情報
      outerStrokeColor: category.outerStroke,
      outerStrokeDashPx: category.outerStrokeDash,
      innerStrokeColor: category.innerStroke,
      // メモ・画像
      memoText: '',
      placedImage: null, // Canvasオブジェクト（エクスポート用）
    });

    // 配置位置を計算
    const pos = this._getNextPosition(width, height);
    group.set({ left: pos.x, top: pos.y });

    const canvas = this.cm.getCanvas();
    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.requestRenderAll();

    // グリッドスナップイベント
    this._setupSnap(group);

    this._updateFrameCount();
    return group;
  }

  // 次の配置位置を計算
  _getNextPosition(width, height) {
    // メモ用余白（5mm）を考慮
    const effectiveH = height + 5;

    if (this.nextX + width > FRAME_DATA.A4_WIDTH - 3) {
      this.nextX = 5;
      this.nextY += this.rowMaxHeight + this.padding;
      this.rowMaxHeight = 0;
    }

    if (this.nextY + height > FRAME_DATA.A4_HEIGHT - 3) {
      this.nextX = 5;
      this.nextY = 10;
      this.rowMaxHeight = 0;
    }

    const x = this.cm.snapToGrid(this.nextX);
    const y = this.cm.snapToGrid(this.nextY);

    this.nextX += width + this.padding;
    this.rowMaxHeight = Math.max(this.rowMaxHeight, effectiveH);

    return { x, y };
  }

  // ドラッグ時のグリッドスナップ
  _setupSnap(obj) {
    obj.on('moving', () => {
      const snappedLeft = this.cm.snapToGrid(obj.left);
      const snappedTop = this.cm.snapToGrid(obj.top);
      obj.set({ left: snappedLeft, top: snappedTop });

      // メモテキストも追従
      this._updateMemoPosition(obj);
      // 画像も追従
      this._updateImagePosition(obj);
    });

    obj.on('modified', () => {
      let left = obj.left;
      let top = obj.top;
      const w = obj.stampWidth;
      const h = obj.stampHeight;

      left = Math.max(0, Math.min(left, FRAME_DATA.A4_WIDTH - w));
      top = Math.max(0, Math.min(top, FRAME_DATA.A4_HEIGHT - h));

      obj.set({
        left: this.cm.snapToGrid(left),
        top: this.cm.snapToGrid(top),
      });
      obj.setCoords();

      this._updateMemoPosition(obj);
      this._updateImagePosition(obj);
      this.cm.getCanvas().requestRenderAll();
    });
  }

  // === メモ機能 ===

  // メモを設定/更新
  setMemo(frame, text) {
    frame.memoText = text;
    const canvas = this.cm.getCanvas();
    const uid = frame.frameUniqueId;

    if (!text) {
      const existing = this.memoObjects.get(uid);
      if (existing) {
        canvas.remove(existing);
        this.memoObjects.delete(uid);
      }
      canvas.requestRenderAll();
      return;
    }

    let memoObj = this.memoObjects.get(uid);
    if (memoObj) {
      memoObj.set({ text: text });
    } else {
      memoObj = new fabric.Text(text, {
        fontSize: 2.5,
        fill: '#555555',
        fontFamily: 'sans-serif',
        selectable: false,
        evented: false,
        isMemoText: true,
        linkedFrameId: uid,
      });
      canvas.add(memoObj);
      this.memoObjects.set(uid, memoObj);
    }

    memoObj.set({
      left: frame.left,
      top: frame.top + frame.stampHeight + 1,
    });
    canvas.requestRenderAll();
  }

  // メモの位置を枠に追従
  _updateMemoPosition(frame) {
    const memoObj = this.memoObjects.get(frame.frameUniqueId);
    if (memoObj) {
      memoObj.set({
        left: frame.left,
        top: frame.top + frame.stampHeight + 1,
      });
    }
  }

  // === 画像配置 ===

  // PSDレイヤー画像を枠に配置
  placeImage(frame, layerCanvas) {
    const canvas = this.cm.getCanvas();
    const uid = frame.frameUniqueId;
    const margin = frame.stampMargin;

    // エクスポート用に元画像を保持
    frame.placedImage = layerCanvas;

    // 既存画像を削除
    const existing = this.imageObjects.get(uid);
    if (existing) canvas.remove(existing);

    // 内枠サイズに合わせてスケーリング
    const innerW = frame.stampWidth - margin * 2;
    const innerH = frame.stampHeight - margin * 2;

    const imgElement = new Image();
    imgElement.onload = () => {
      const fabricImg = new fabric.Image(imgElement, {
        selectable: false,
        evented: false,
        isPlacedImage: true,
        linkedFrameId: uid,
      });

      const scaleX = innerW / fabricImg.width;
      const scaleY = innerH / fabricImg.height;
      const fitScale = Math.min(scaleX, scaleY);

      fabricImg.set({
        scaleX: fitScale,
        scaleY: fitScale,
        left: frame.left + margin + (innerW - fabricImg.width * fitScale) / 2,
        top: frame.top + margin + (innerH - fabricImg.height * fitScale) / 2,
      });

      canvas.add(fabricImg);
      // 画像を枠の下に（枠線が上に見える）
      const frameIdx = canvas.getObjects().indexOf(frame);
      if (frameIdx > 0) {
        canvas.moveTo(fabricImg, frameIdx);
      }

      this.imageObjects.set(uid, fabricImg);
      canvas.requestRenderAll();
    };
    imgElement.src = layerCanvas.toDataURL();
  }

  // 画像の位置を枠に追従
  _updateImagePosition(frame) {
    const imgObj = this.imageObjects.get(frame.frameUniqueId);
    if (imgObj) {
      const margin = frame.stampMargin;
      const innerW = frame.stampWidth - margin * 2;
      const innerH = frame.stampHeight - margin * 2;

      imgObj.set({
        left: frame.left + margin + (innerW - imgObj.width * imgObj.scaleX) / 2,
        top: frame.top + margin + (innerH - imgObj.height * imgObj.scaleY) / 2,
      });
    }
  }

  // 配置数表示を更新
  _updateFrameCount() {
    const count = this.cm.getStampFrames().length;
    const el = document.getElementById('frame-count');
    if (el) el.textContent = `配置数: ${count}`;
  }

  // 選択中のオブジェクトを削除
  deleteSelected() {
    const canvas = this.cm.getCanvas();
    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length === 0) return;

    activeObjects.forEach(obj => {
      if (obj.isStampFrame) {
        const uid = obj.frameUniqueId;
        const memo = this.memoObjects.get(uid);
        if (memo) { canvas.remove(memo); this.memoObjects.delete(uid); }
        const img = this.imageObjects.get(uid);
        if (img) { canvas.remove(img); this.imageObjects.delete(uid); }
        canvas.remove(obj);
      }
    });
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    this._updateFrameCount();
    document.dispatchEvent(new CustomEvent('frame-deselected'));
  }

  // 全スタンプ枠を削除
  deleteAll() {
    const canvas = this.cm.getCanvas();
    const frames = this.cm.getStampFrames();
    frames.forEach(f => {
      const uid = f.frameUniqueId;
      const memo = this.memoObjects.get(uid);
      if (memo) canvas.remove(memo);
      const img = this.imageObjects.get(uid);
      if (img) canvas.remove(img);
      canvas.remove(f);
    });
    this.memoObjects.clear();
    this.imageObjects.clear();
    canvas.discardActiveObject();
    canvas.requestRenderAll();

    this.nextX = 5;
    this.nextY = 10;
    this.rowMaxHeight = 0;
    this._updateFrameCount();
    document.dispatchEvent(new CustomEvent('frame-deselected'));
  }
}
