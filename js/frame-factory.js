// 枠オブジェクト生成（外枠+内枠+ラベルのグループ）

class FrameFactory {
  constructor(canvasManager) {
    this.cm = canvasManager;
    this.nextX = 5;  // 次に配置するX座標（mm）
    this.nextY = 10; // 次に配置するY座標（mm）タイトル分の余白確保
    this.rowMaxHeight = 0; // 現在行の最大高さ
    this.padding = 3; // 枠間の余白（mm）
  }

  // スタンプ枠を作成してキャンバスに追加
  // posOverride: { left, top } を渡すと自動配置の代わりにその位置に配置
  createFrame(stamp, category, posOverride) {
    const { width, height } = stamp;
    // スタンプ個別の余白があればそちらを優先、なければカテゴリの余白を使用
    const margin = (stamp.margin !== undefined && stamp.margin !== null) ? stamp.margin : category.margin;

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

    // サイズ表記（外枠の右下外側に表示）
    const sizeDisplay = new fabric.Text(`${stamp.id} ${width}×${height}`, {
      fontSize: 2.5,
      fill: category.labelColor,
      fontFamily: 'sans-serif',
      fontWeight: '500',
      selectable: false,
      evented: false,
      originX: 'right',
      originY: 'top',
      left: width,
      top: height + 0.3,
      opacity: 0.55,
      isSizeLabel: true,
    });

    // メモ表示（サイズ表記の左側に配置）
    const memoDisplay = new fabric.Text('', {
      fontSize: 2.2,
      fill: '#6366f1',
      fontFamily: 'sans-serif',
      fontWeight: '400',
      selectable: false,
      evented: false,
      originX: 'left',
      originY: 'top',
      left: 0,
      top: height + 0.3,
      opacity: 0.7,
      isMemoLabel: true,
    });

    // グループ化
    const group = new fabric.Group([outerRect, innerRect, sizeDisplay, memoDisplay], {
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
      stampMargin: margin,
      stampMemo: '',
      categoryName: category.name,
      _category: category,
    });

    // 配置位置を計算（位置指定がある場合はそちらを使用）
    if (posOverride && posOverride.left !== undefined) {
      group.set({ left: posOverride.left, top: posOverride.top });
    } else {
      const pos = this._getNextPosition(width, height);
      group.set({ left: pos.x, top: pos.y });
    }

    // キャンバスに追加
    const canvas = this.cm.getCanvas();
    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.requestRenderAll();

    // グリッドスナップイベント
    this._setupSnap(group);

    // 画像配置の枠追従イベントを設定
    if (window.imagePlacer) {
      window.imagePlacer.setupFrameTracking(group);
    }

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
      this.nextY = 10;
      this.rowMaxHeight = 0;
    }

    const x = this.cm.snapToGrid(this.nextX);
    const y = this.cm.snapToGrid(this.nextY);

    // 次の位置を更新
    this.nextX += width + this.padding;
    this.rowMaxHeight = Math.max(this.rowMaxHeight, height + 1); // サイズ表記分の高さを加算

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

  // 選択中のスタンプ枠を別のスタンプに差し替え
  replaceFrame(oldFrame, newStamp, newCategory) {
    const canvas = this.cm.getCanvas();
    const oldLeft = oldFrame.left;
    const oldTop = oldFrame.top;

    // 配置済み画像情報を保存
    let placementInfo = null;
    if (window.imagePlacer) {
      placementInfo = window.imagePlacer.getPlacementInfo(oldFrame);
    }

    // 古い枠を削除
    canvas.remove(oldFrame);

    // 同じ位置に新しいスタンプ枠を作成
    const newFrame = this.createFrame(newStamp, newCategory, { left: oldLeft, top: oldTop });

    // 画像を新しい枠に再配置（自動的に新しい内枠サイズにフィット）
    if (window.imagePlacer && placementInfo) {
      window.imagePlacer.restorePlacement(newFrame, placementInfo);
    }

    // 重なり解消のため全枠を自動整列
    this.rearrangeAll();

    // 差し替えた枠を選択状態に
    canvas.setActiveObject(newFrame);

    return newFrame;
  }

  // 全枠を自動整列（重なりを解消して詰め直す）
  rearrangeAll() {
    const canvas = this.cm.getCanvas();
    const frames = this.cm.getStampFrames();
    if (frames.length === 0) return;

    // キャンバス上の配置済み画像を取得（_linkedFrameUidで枠と紐づいている）
    const placedImages = canvas.getObjects().filter(o => o.isPlacedImage);

    // 現在の位置順でソート（上→下、同じ行なら左→右）
    frames.sort((a, b) => {
      if (Math.abs(a.top - b.top) > 5) return a.top - b.top;
      return a.left - b.left;
    });

    // 配置位置をリセット
    this.nextX = 5;
    this.nextY = 10;
    this.rowMaxHeight = 0;

    // 各枠を再配置
    frames.forEach(frame => {
      const oldLeft = frame.left;
      const oldTop = frame.top;
      const pos = this._getNextPosition(frame.stampWidth, frame.stampHeight);
      frame.set({ left: pos.x, top: pos.y });
      frame.setCoords();

      const dx = pos.x - oldLeft;
      const dy = pos.y - oldTop;
      if (dx === 0 && dy === 0) return;

      // この枠に紐づく画像をキャンバスから直接探して移動
      const frameUid = frame._placerUid;
      if (!frameUid) return;

      placedImages.forEach(img => {
        if (img._linkedFrameUid === frameUid) {
          img.set({
            left: img.left + dx,
            top: img.top + dy,
          });
          // clipPathも同じ距離だけ移動
          if (img.clipPath) {
            img.clipPath.set({
              left: img.clipPath.left + dx,
              top: img.clipPath.top + dy,
            });
          }
          img.setCoords();
          img.dirty = true; // Fabric.jsに再描画を強制
        }
      });
    });

    canvas.renderAll();
  }

  // 選択中のスタンプ枠を90度回転（縦横切替）
  rotateSelected() {
    const canvas = this.cm.getCanvas();
    const active = canvas.getActiveObjects();
    const frames = active.filter(o => o.isStampFrame);
    if (frames.length === 0) return;

    canvas.discardActiveObject();

    const newFrames = [];

    frames.forEach(frame => {
      const oldLeft = frame.left;
      const oldTop = frame.top;
      const cat = frame._category;

      // 配置済み画像情報を保存
      let placementInfo = null;
      if (window.imagePlacer) {
        placementInfo = window.imagePlacer.getPlacementInfo(frame);
      }

      // 幅と高さを入れ替えた新しいスタンプ定義
      const swappedStamp = {
        id: frame.stampId,
        width: frame.stampHeight,
        height: frame.stampWidth,
      };

      // 古い枠を削除
      canvas.remove(frame);

      // 同じ位置に縦横入替えた新しい枠を作成
      const newFrame = this.createFrame(swappedStamp, cat, { left: oldLeft, top: oldTop });

      // 画像を再配置
      if (window.imagePlacer && placementInfo) {
        window.imagePlacer.restorePlacement(newFrame, placementInfo);
      }

      newFrames.push(newFrame);
    });

    // 新しい枠を選択状態に
    if (newFrames.length === 1) {
      canvas.setActiveObject(newFrames[0]);
    } else if (newFrames.length > 1) {
      const sel = new fabric.ActiveSelection(newFrames, { canvas });
      canvas.setActiveObject(sel);
    }

    canvas.requestRenderAll();
  }

  // 選択中のスタンプ枠を複製（自動配置位置に新しい枠を作成）
  duplicateSelected() {
    const canvas = this.cm.getCanvas();
    const activeObjects = canvas.getActiveObjects();
    const frames = activeObjects.filter(o => o.isStampFrame);
    if (frames.length === 0) return;

    canvas.discardActiveObject();

    const newFrames = [];
    frames.forEach(frame => {
      const stamp = {
        id: frame.stampId,
        width: frame.stampWidth,
        height: frame.stampHeight,
      };
      const cat = frame._category;
      // 自動配置位置に新しい枠を作成（posOverrideなし）
      const newFrame = this.createFrame(stamp, cat);
      newFrames.push(newFrame);
    });

    // 新しい枠を選択状態に
    if (newFrames.length === 1) {
      canvas.setActiveObject(newFrames[0]);
    } else if (newFrames.length > 1) {
      const sel = new fabric.ActiveSelection(newFrames, { canvas });
      canvas.setActiveObject(sel);
    }

    canvas.requestRenderAll();
  }

  // 選択中のオブジェクトを削除
  deleteSelected() {
    const canvas = this.cm.getCanvas();
    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length === 0) return;

    activeObjects.forEach(obj => {
      if (obj.isStampFrame) {
        // 配置済み画像のクリーンアップ
        if (window.imagePlacer) {
          window.imagePlacer.onFrameRemoved(obj);
        }
        canvas.remove(obj);
      }
    });
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    this._updateFrameCount();
  }

  // スタンプ枠のメモを更新
  updateMemo(frame, text) {
    frame.stampMemo = text || '';
    const objects = frame.getObjects();
    const memoObj = objects.find(o => o.isMemoLabel);
    if (memoObj) {
      memoObj.set('text', text || '');
      frame.dirty = true;
      this.cm.getCanvas().requestRenderAll();
    }
  }

  // 全スタンプ枠を削除
  deleteAll() {
    const canvas = this.cm.getCanvas();
    const frames = this.cm.getStampFrames();
    frames.forEach(f => {
      // 配置済み画像のクリーンアップ
      if (window.imagePlacer) {
        window.imagePlacer.onFrameRemoved(f);
      }
      canvas.remove(f);
    });
    canvas.discardActiveObject();
    canvas.requestRenderAll();

    // 配置位置をリセット
    this.nextX = 5;
    this.nextY = 10;
    this.rowMaxHeight = 0;
    this._updateFrameCount();
  }
}
