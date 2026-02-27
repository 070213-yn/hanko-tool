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

  // 自動整列（同じ種類を横並び + 棚詰めでスペース有効活用）
  autoArrange() {
    const canvas = this.cm.getCanvas();
    const frames = this.cm.getStampFrames();
    if (frames.length === 0) return;

    const MARGIN = 5;       // A4端からの余白(mm)
    const TOP_MARGIN = 10;  // 上部余白（タイトル分）(mm)
    const GAP = 3;          // 枠同士の間隔(mm)
    const LABEL_H = 1;      // サイズ表記分の高さ(mm)
    const usableW = FRAME_DATA.A4_WIDTH - MARGIN * 2;

    // 画像追従のため移動前の位置を記録
    const oldPositions = new Map();
    frames.forEach(f => {
      oldPositions.set(f, { left: f.left, top: f.top });
    });

    // 1. スタンプID+寸法でグループ化（回転した枠は別グループとして扱う）
    const groups = new Map();
    frames.forEach(f => {
      const id = `${f.stampId}_${f.stampWidth}x${f.stampHeight}`;
      if (!groups.has(id)) {
        groups.set(id, {
          id: id,
          width: f.stampWidth,
          height: f.stampHeight,
          frames: []
        });
      }
      groups.get(id).frames.push(f);
    });

    // 2. 各グループを1行に収まるブロックに分割
    //    （同じ種類が多すぎて1行に入りきらない場合は複数ブロックに）
    const blocks = [];
    for (const group of groups.values()) {
      const maxPerRow = Math.max(1, Math.floor((usableW + GAP) / (group.width + GAP)));
      const remaining = [...group.frames];
      while (remaining.length > 0) {
        const chunk = remaining.splice(0, maxPerRow);
        blocks.push({
          id: group.id,
          itemWidth: group.width,
          height: group.height,
          totalWidth: chunk.length * group.width + (chunk.length - 1) * GAP,
          frames: chunk
        });
      }
    }

    // 3. ブロックを高さ降順でソート（大きい枠を先に配置するとスペース効率が上がる）
    //    同じ高さなら幅が大きいものを先に
    blocks.sort((a, b) => {
      if (b.height !== a.height) return b.height - a.height;
      return b.totalWidth - a.totalWidth;
    });

    // 4. 棚詰め（Shelf Packing）
    //    各棚は { y座標, 高さ, 残り幅 }
    const shelves = [];

    for (const block of blocks) {
      // 既存の棚で入る場所を探す
      // 優先順位: 高さの無駄が最も少ない棚 → 幅の無駄が最も少ない棚
      let bestShelf = null;
      let bestWaste = Infinity;

      for (const shelf of shelves) {
        if (shelf.height >= block.height + LABEL_H && shelf.remainingW >= block.totalWidth) {
          const heightWaste = shelf.height - block.height - LABEL_H;
          const widthWaste = shelf.remainingW - block.totalWidth;
          const waste = heightWaste * 10 + widthWaste;
          if (waste < bestWaste) {
            bestWaste = waste;
            bestShelf = shelf;
          }
        }
      }

      if (bestShelf) {
        // 既存の棚に配置
        const startX = MARGIN + (usableW - bestShelf.remainingW);
        block.frames.forEach((f, i) => {
          f.set({
            left: this.cm.snapToGrid(startX + i * (block.itemWidth + GAP)),
            top: this.cm.snapToGrid(bestShelf.y)
          });
          f.setCoords();
        });
        bestShelf.remainingW -= (block.totalWidth + GAP);
      } else {
        // 新しい棚を作成
        const y = shelves.length === 0
          ? TOP_MARGIN
          : shelves[shelves.length - 1].y + shelves[shelves.length - 1].height + GAP;

        // A4からはみ出す場合はそのまま配置（ユーザーが手動で調整できる）
        block.frames.forEach((f, i) => {
          f.set({
            left: this.cm.snapToGrid(MARGIN + i * (block.itemWidth + GAP)),
            top: this.cm.snapToGrid(y)
          });
          f.setCoords();
        });

        shelves.push({
          y: y,
          height: block.height + LABEL_H,  // サイズ表記分を加算
          remainingW: usableW - block.totalWidth - GAP
        });
      }
    }

    // 配置済み画像を枠の移動に追従させる
    const placedImages = canvas.getObjects().filter(o => o.isPlacedImage);
    frames.forEach(f => {
      const old = oldPositions.get(f);
      const dx = f.left - old.left;
      const dy = f.top - old.top;
      if (dx === 0 && dy === 0) return;

      const frameUid = f._placerUid;
      if (!frameUid) return;

      placedImages.forEach(img => {
        if (img._linkedFrameUid === frameUid) {
          img.set({
            left: img.left + dx,
            top: img.top + dy,
          });
          if (img.clipPath) {
            img.clipPath.set({
              left: img.clipPath.left + dx,
              top: img.clipPath.top + dy,
            });
          }
          img.setCoords();
          img.dirty = true;
        }
      });
    });

    canvas.discardActiveObject();
    canvas.renderAll();
  }

  // 配置順で自動整列（画像を配置した順に1つずつ棚に詰める）
  autoArrangeByOrder() {
    const canvas = this.cm.getCanvas();
    const frames = this.cm.getStampFrames();
    if (frames.length === 0) return;

    const MARGIN = 5;
    const TOP_MARGIN = 10;
    const GAP = 3;
    const LABEL_H = 1;
    const usableW = FRAME_DATA.A4_WIDTH - MARGIN * 2;

    // 画像追従のため移動前の位置を記録
    const oldPositions = new Map();
    frames.forEach(f => {
      oldPositions.set(f, { left: f.left, top: f.top });
    });

    // 配置時刻でソート（画像が配置されていない枠は末尾に）
    const imagePlacer = window.imagePlacer;
    const sortedFrames = [...frames].sort((a, b) => {
      const uidA = a._placerUid;
      const uidB = b._placerUid;
      const pA = uidA && imagePlacer ? imagePlacer.placements[uidA] : null;
      const pB = uidB && imagePlacer ? imagePlacer.placements[uidB] : null;
      const timeA = pA ? (pA.placementTime || 0) : Infinity;
      const timeB = pB ? (pB.placementTime || 0) : Infinity;
      return timeA - timeB;
    });

    // 棚詰め（1つずつ順番に配置）
    const shelves = [];

    for (const frame of sortedFrames) {
      const fw = frame.stampWidth;
      const fh = frame.stampHeight;

      // 既存の棚で入る場所を探す（最後の棚から優先）
      let bestShelf = null;
      for (const shelf of shelves) {
        if (shelf.height >= fh + LABEL_H && shelf.remainingW >= fw) {
          bestShelf = shelf;
          break;
        }
      }

      if (bestShelf) {
        const startX = MARGIN + (usableW - bestShelf.remainingW);
        frame.set({
          left: this.cm.snapToGrid(startX),
          top: this.cm.snapToGrid(bestShelf.y)
        });
        frame.setCoords();
        bestShelf.remainingW -= (fw + GAP);
      } else {
        // 新しい棚を作成
        const y = shelves.length === 0
          ? TOP_MARGIN
          : shelves[shelves.length - 1].y + shelves[shelves.length - 1].height + GAP;

        frame.set({
          left: this.cm.snapToGrid(MARGIN),
          top: this.cm.snapToGrid(y)
        });
        frame.setCoords();

        shelves.push({
          y: y,
          height: fh + LABEL_H,
          remainingW: usableW - fw - GAP
        });
      }
    }

    // 配置済み画像を枠の移動に追従させる
    const placedImages = canvas.getObjects().filter(o => o.isPlacedImage);
    frames.forEach(f => {
      const old = oldPositions.get(f);
      const dx = f.left - old.left;
      const dy = f.top - old.top;
      if (dx === 0 && dy === 0) return;

      const frameUid = f._placerUid;
      if (!frameUid) return;

      placedImages.forEach(img => {
        if (img._linkedFrameUid === frameUid) {
          img.set({
            left: img.left + dx,
            top: img.top + dy,
          });
          if (img.clipPath) {
            img.clipPath.set({
              left: img.clipPath.left + dx,
              top: img.clipPath.top + dy,
            });
          }
          img.setCoords();
          img.dirty = true;
        }
      });
    });

    canvas.discardActiveObject();
    canvas.renderAll();
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
      case 'autoArrange': this.autoArrange(); break;
      case 'autoArrangeByOrder': this.autoArrangeByOrder(); break;
    }
  }
}
