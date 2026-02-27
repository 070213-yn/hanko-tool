// 二値化画像をスタンプ枠に配置する管理クラス
// 画像は独立したfabric.Imageとしてキャンバスに配置し、clipPathで内枠にクリップ

class ImagePlacer {
  constructor(canvasManager) {
    this.cm = canvasManager;
    this.images = [];      // { id, name, dataURL, element(img) }
    this.nextId = 1;
    this.selectedId = null; // 選択中の画像ID
    this.placements = {};   // frameUID → { imageId, fabricImg, clipRect } のマップ
  }

  // === ファイルアップロードから画像をインポート ===
  importFiles(fileList) {
    const imageFiles = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    let loaded = 0;
    imageFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        this._addImage(file.name, e.target.result);
        loaded++;
        if (loaded === imageFiles.length) {
          this.renderList();
        }
      };
      reader.readAsDataURL(file);
    });
  }

  // === ファイルインポート完了後にコールバック（D&D用） ===
  importFilesWithCallback(fileList, callback) {
    const imageFiles = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    let loaded = 0;
    const addedIds = [];
    imageFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const id = this._addImage(file.name, e.target.result);
        addedIds.push(id);
        loaded++;
        if (loaded === imageFiles.length) {
          this.renderList();
          if (callback) callback(addedIds[0]);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  // === sessionStorage から二値化画像を受け取り ===
  checkSessionStorage() {
    const key = 'hankodori_binarized_images';
    const raw = sessionStorage.getItem(key);
    if (!raw) return false;

    try {
      const items = JSON.parse(raw);
      if (!Array.isArray(items) || items.length === 0) return false;

      items.forEach(item => {
        if (item.name && item.dataURL) {
          this._addImage(item.name, item.dataURL);
        }
      });

      sessionStorage.removeItem(key);
      this.renderList();
      return true;
    } catch (e) {
      console.error('sessionStorage読み取りエラー:', e);
      return false;
    }
  }

  // === 画像を内部リストに追加 ===
  _addImage(name, dataURL) {
    const img = new Image();
    img.src = dataURL;

    const id = this.nextId++;
    this.images.push({
      id: id,
      name: name,
      dataURL: dataURL,
      element: img,
      placedFrameId: null,
    });
    return id;
  }

  // === 画像を選択 ===
  select(id) {
    if (this.selectedId === id) {
      this.deselect();
      return;
    }
    this.selectedId = id;
    this.renderList();
    this._showPlacementHint(true);
  }

  // === 選択解除 ===
  deselect() {
    this.selectedId = null;
    this.renderList();
    this._showPlacementHint(false);
  }

  // === 選択中の画像を枠に配置（独立オブジェクト方式） ===
  placeInFrame(frame) {
    if (!this.selectedId) return false;

    const imageData = this.images.find(i => i.id === this.selectedId);
    if (!imageData) return false;

    // 既にこの枠に画像があれば削除
    this._removeImageFromFrame(frame);

    // 枠の内枠サイズを取得
    const category = frame._category;
    const margin = category.margin;
    const stampW = frame.stampWidth;
    const stampH = frame.stampHeight;
    const innerW = stampW - margin * 2;
    const innerH = stampH - margin * 2;

    // 画像をFabric.jsオブジェクトとして作成（独立・操作可能）
    const fabricImg = new fabric.Image(imageData.element, {
      selectable: true,
      evented: true,
      hasControls: true,
      hasBorders: true,
      lockRotation: true,
      borderColor: '#6366f1',
      cornerColor: '#6366f1',
      cornerSize: 6,
      cornerStyle: 'circle',
      transparentCorners: false,
      // カスタムプロパティ
      isPlacedImage: true,
      placerImageId: imageData.id,
      _linkedFrameUid: this._getFrameUid(frame),
    });

    // 描画部分のバウンディングボックスを検出
    const bounds = this._detectContentBounds(imageData.element);

    // 描画部分が内枠に収まる最大スケールを計算
    const scaleX = innerW / bounds.width;
    const scaleY = innerH / bounds.height;
    const scale = Math.min(scaleX, scaleY);

    // 内枠の中心座標（キャンバス座標）
    const innerCenterX = frame.left + margin + innerW / 2;
    const innerCenterY = frame.top + margin + innerH / 2;

    // 描画部分の中心を内枠中心に合わせる
    const contentCenterX = bounds.x + bounds.width / 2;
    const contentCenterY = bounds.y + bounds.height / 2;

    fabricImg.set({
      scaleX: scale,
      scaleY: scale,
      left: innerCenterX - contentCenterX * scale,
      top: innerCenterY - contentCenterY * scale,
    });

    // clipPathで内枠領域にクリップ
    const clipRect = new fabric.Rect({
      left: frame.left + margin,
      top: frame.top + margin,
      width: innerW,
      height: innerH,
      absolutePositioned: true,
    });
    fabricImg.clipPath = clipRect;

    // フレームとの相対オフセットを記録（枠移動時の追従用）
    fabricImg._offsetFromFrame = {
      x: fabricImg.left - frame.left,
      y: fabricImg.top - frame.top,
    };
    fabricImg._clipOffsetFromFrame = {
      x: margin,
      y: margin,
    };

    // キャンバスに追加
    const canvas = this.cm.getCanvas();
    canvas.add(fabricImg);
    canvas.requestRenderAll();

    // 配置記録
    const frameUid = this._getFrameUid(frame);
    this.placements[frameUid] = {
      imageId: imageData.id,
      fabricImg: fabricImg,
      clipRect: clipRect,
    };

    // 画像の配置状態を更新
    imageData.placedFrameId = frameUid;

    // ラベルを非表示にする
    this._setLabelVisible(frame, false);

    // 画像移動/リサイズ後にオフセット再計算
    this._setupImageTracking(fabricImg, frame);

    // 選択解除
    this.deselect();

    return true;
  }

  // === 枠移動時に画像とclipPathを追従させる ===
  setupFrameTracking(frame) {
    frame.on('moving', () => {
      this._syncImageToFrame(frame);
    });
  }

  // 枠に紐づく画像の位置を同期
  _syncImageToFrame(frame) {
    const frameUid = this._getFrameUid(frame);
    const placement = this.placements[frameUid];
    if (!placement) return;

    const img = placement.fabricImg;
    const clip = placement.clipRect;

    img.set({
      left: frame.left + img._offsetFromFrame.x,
      top: frame.top + img._offsetFromFrame.y,
    });

    clip.set({
      left: frame.left + img._clipOffsetFromFrame.x,
      top: frame.top + img._clipOffsetFromFrame.y,
    });

    img.setCoords();
  }

  // ActiveSelection移動時に全フレームの画像を同期（app.jsから呼ぶ）
  syncAllFrameImages(activeSelection) {
    if (!activeSelection || !activeSelection.getObjects) return;
    const objects = activeSelection.getObjects();
    const groupMatrix = activeSelection.calcTransformMatrix();

    objects.forEach(obj => {
      if (!obj.isStampFrame) return;

      const frameUid = this._getFrameUid(obj);
      const placement = this.placements[frameUid];
      if (!placement) return;

      // グループ内オブジェクトの絶対位置を計算
      const absPoint = fabric.util.transformPoint(
        new fabric.Point(obj.left, obj.top),
        groupMatrix
      );

      const img = placement.fabricImg;
      const clip = placement.clipRect;

      img.set({
        left: absPoint.x + img._offsetFromFrame.x,
        top: absPoint.y + img._offsetFromFrame.y,
      });

      clip.set({
        left: absPoint.x + img._clipOffsetFromFrame.x,
        top: absPoint.y + img._clipOffsetFromFrame.y,
      });

      img.setCoords();
    });
  }

  // 画像のリサイズ/移動後にオフセットを更新
  _setupImageTracking(fabricImg, frame) {
    fabricImg.on('modified', () => {
      fabricImg._offsetFromFrame = {
        x: fabricImg.left - frame.left,
        y: fabricImg.top - frame.top,
      };
    });
  }

  // === 枠から画像を外す ===
  removeFromFrame(frame) {
    this._removeImageFromFrame(frame);
    this.cm.getCanvas().requestRenderAll();
    this.renderList();
  }

  // 内部: 枠から画像を除去
  _removeImageFromFrame(frame) {
    const frameUid = this._getFrameUid(frame);
    const placement = this.placements[frameUid];
    if (!placement) return;

    // キャンバスから画像を直接削除
    this.cm.getCanvas().remove(placement.fabricImg);

    // 配置記録を削除
    const imageData = this.images.find(i => i.id === placement.imageId);
    if (imageData) {
      imageData.placedFrameId = null;
    }

    delete this.placements[frameUid];

    // ラベルを再表示
    this._setLabelVisible(frame, true);
  }

  // === 枠削除時のクリーンアップ ===
  onFrameRemoved(frame) {
    const frameUid = this._getFrameUid(frame);
    const placement = this.placements[frameUid];
    if (!placement) return;

    // キャンバスから画像も削除
    this.cm.getCanvas().remove(placement.fabricImg);

    const imageData = this.images.find(i => i.id === placement.imageId);
    if (imageData) {
      imageData.placedFrameId = null;
    }
    delete this.placements[frameUid];
    this.renderList();
  }

  // === 回転前に配置情報を保存 ===
  getPlacementInfo(frame) {
    const frameUid = this._getFrameUid(frame);
    const placement = this.placements[frameUid];
    if (!placement) return null;

    // キャンバスから画像を削除
    this.cm.getCanvas().remove(placement.fabricImg);

    // 古い記録を削除
    const imageData = this.images.find(i => i.id === placement.imageId);
    if (imageData) imageData.placedFrameId = null;
    delete this.placements[frameUid];

    return { imageId: placement.imageId };
  }

  // === 回転後・Undo/Redo後に再配置 ===
  restorePlacement(frame, placementInfo) {
    if (!placementInfo) return;

    const imageData = this.images.find(i => i.id === placementInfo.imageId);
    if (!imageData) return;

    // 一時的に選択状態にして配置
    const prevSelected = this.selectedId;
    this.selectedId = imageData.id;
    this.placeInFrame(frame);

    // imageStateがある場合はユーザーが調整した位置・スケールを復元
    if (placementInfo.imageState) {
      const frameUid = this._getFrameUid(frame);
      const placement = this.placements[frameUid];
      if (placement) {
        placement.fabricImg.set({
          left: placementInfo.imageState.left,
          top: placementInfo.imageState.top,
          scaleX: placementInfo.imageState.scaleX,
          scaleY: placementInfo.imageState.scaleY,
        });
        placement.fabricImg._offsetFromFrame = { ...placementInfo.imageState.offsetFromFrame };
        placement.fabricImg._clipOffsetFromFrame = { ...placementInfo.imageState.clipOffsetFromFrame };
        placement.fabricImg.setCoords();
        this.cm.getCanvas().requestRenderAll();
      }
    }

    this.selectedId = prevSelected;
  }

  // === 画像リストからアイテムを削除 ===
  removeImage(id) {
    const idx = this.images.findIndex(i => i.id === id);
    if (idx === -1) return;

    const imageData = this.images[idx];

    // 配置済みなら枠からも除去
    if (imageData.placedFrameId) {
      const placement = this.placements[imageData.placedFrameId];
      if (placement) {
        const frames = this.cm.getStampFrames();
        for (const frame of frames) {
          if (this._getFrameUid(frame) === imageData.placedFrameId) {
            this._removeImageFromFrame(frame);
            break;
          }
        }
      }
    }

    this.images.splice(idx, 1);
    if (this.selectedId === id) this.selectedId = null;
    this.renderList();
    this.cm.getCanvas().requestRenderAll();
  }

  // === 描画部分（非透明ピクセル）のバウンディングボックスを検出 ===
  _detectContentBounds(imgElement) {
    const w = imgElement.naturalWidth || imgElement.width;
    const h = imgElement.naturalHeight || imgElement.height;

    // 画像がまだロードされていない場合は全体を返す
    if (!w || !h) return { x: 0, y: 0, width: w || 1, height: h || 1 };

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(imgElement, 0, 0);

    let data;
    try {
      data = ctx.getImageData(0, 0, w, h).data;
    } catch (e) {
      // CORS等でgetImageDataが失敗した場合は全体を返す
      return { x: 0, y: 0, width: w, height: h };
    }

    let minX = w, minY = h, maxX = 0, maxY = 0;
    let hasContent = false;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const alpha = data[(y * w + x) * 4 + 3];
        if (alpha > 0) {
          hasContent = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (!hasContent) {
      return { x: 0, y: 0, width: w, height: h };
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
  }

  // === サイドバーの画像一覧を描画 ===
  renderList() {
    this._renderListTo('placer-image-list');
    this._renderListTo('mobile-placer-image-list');

    const countEl = document.getElementById('placer-count');
    if (countEl) {
      countEl.textContent = this.images.length > 0 ? `${this.images.length}枚` : '';
    }
    const mCountEl = document.getElementById('mobile-placer-count');
    if (mCountEl) {
      mCountEl.textContent = this.images.length > 0 ? `${this.images.length}枚` : '';
    }
  }

  _renderListTo(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    if (this.images.length === 0) {
      container.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">画像がありません</p>';
      return;
    }

    this.images.forEach(img => {
      const item = document.createElement('div');
      const isSelected = img.id === this.selectedId;
      const isPlaced = !!img.placedFrameId;

      item.className = 'placer-item' +
        (isSelected ? ' selected' : '') +
        (isPlaced ? ' placed' : '');

      // ドラッグ可能にする（枠へのD&D配置用）
      item.draggable = true;
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', 'placer-image:' + img.id);
        e.dataTransfer.effectAllowed = 'copy';
      });

      item.innerHTML = `
        <img src="${img.dataURL}" class="placer-thumb" alt="${this._escapeHtml(img.name)}">
        <div class="placer-info">
          <span class="placer-name">${this._escapeHtml(img.name)}</span>
          <span class="placer-status">${isPlaced ? '配置済み' : (isSelected ? '選択中 - 枠をクリック' : 'ドラッグで枠に配置')}</span>
        </div>
        <button class="placer-remove" data-remove-id="${img.id}" title="リストから削除">
          <svg viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd"/></svg>
        </button>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.placer-remove')) return;
        this.select(img.id);
      });

      const removeBtn = item.querySelector('.placer-remove');
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeImage(img.id);
      });

      container.appendChild(item);
    });
  }

  // === ヘルパー ===

  _getFrameUid(frame) {
    if (!frame._placerUid) {
      frame._placerUid = 'frame_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }
    return frame._placerUid;
  }

  _setLabelVisible(frame, visible) {
    const objects = frame.getObjects();
    if (objects.length >= 3 && objects[2] instanceof fabric.Text) {
      const sw = frame.stampWidth;
      const sh = frame.stampHeight;
      const margin = frame._category ? frame._category.margin : 2;

      if (visible) {
        // 画像なし: 中央に大きく表示
        const fontSize = Math.min(sw, sh) * 0.3;
        objects[2].set({
          originX: 'center',
          originY: 'center',
          left: 0,
          top: 0,
          fontSize: Math.max(3, Math.min(8, fontSize)),
          opacity: 0.4,
        });
      } else {
        // 画像あり: 上部マージン内に小さく表示
        const labelSize = Math.max(1.2, Math.min(margin - 0.1, 2));
        objects[2].set({
          originX: 'center',
          originY: 'top',
          left: 0,
          top: -sh / 2 + 0.1,
          fontSize: labelSize,
          opacity: 0.8,
        });
      }
      frame.dirty = true;
    }
  }

  _showPlacementHint(show) {
    const hint = document.getElementById('placement-hint');
    if (hint) hint.classList.toggle('active', show);
    const mHint = document.getElementById('mobile-placement-hint');
    if (mHint) mHint.classList.toggle('active', show);
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
