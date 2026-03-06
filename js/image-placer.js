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
    const files = Array.from(fileList);

    // PSDファイルを分離
    const psdFiles = files.filter(f => f.name.toLowerCase().endsWith('.psd'));
    const imageFiles = files.filter(f => f.type.startsWith('image/'));

    // PSDファイルを処理
    psdFiles.forEach(f => this._importPSD(f));

    // 通常画像を処理
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
    const files = Array.from(fileList);

    // PSDファイルを分離
    const psdFiles = files.filter(f => f.name.toLowerCase().endsWith('.psd'));
    const imageFiles = files.filter(f => f.type.startsWith('image/'));

    // PSDファイルを処理
    psdFiles.forEach(f => this._importPSD(f, callback));

    // 通常画像を処理
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

  // === PSDファイルを読み込み、各レイヤーを画像として追加 ===
  _importPSD(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const psd = agPsd.readPsd(new Uint8Array(e.target.result));
        const addedIds = [];

        // レイヤーを再帰的に走査して画像を追加
        this._extractLayers(psd.children || [], addedIds, '');

        if (addedIds.length === 0) {
          console.warn('PSDからレイヤーが見つかりませんでした');
          return;
        }

        console.log(`PSD「${file.name}」から ${addedIds.length} レイヤーをインポート`);
        this.renderList();

        if (callback && addedIds.length > 0) {
          callback(addedIds[0]);
        }
      } catch (err) {
        console.error('PSD読み込みエラー:', err);
        alert('PSDファイルの読み込みに失敗しました。');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // レイヤーを再帰的に走査（グループ対応）
  _extractLayers(layers, addedIds, prefix) {
    layers.forEach(layer => {
      // 非表示レイヤーはスキップ
      if (layer.hidden) return;

      // グループの場合は再帰的に子レイヤーを処理
      if (layer.children && layer.children.length > 0) {
        const groupPrefix = prefix ? `${prefix}/${layer.name || 'グループ'}` : (layer.name || 'グループ');
        this._extractLayers(layer.children, addedIds, groupPrefix);
        return;
      }

      // キャンバスがあるレイヤーを画像として追加（iPad対応: トリミング）
      if (layer.canvas) {
        const trimmed = this._trimLayerCanvas(layer.canvas);
        if (!trimmed) return; // 完全に透明なレイヤーはスキップ
        const layerName = prefix ? `${prefix}/${layer.name || 'レイヤー'}` : (layer.name || 'レイヤー');
        const dataURL = trimmed.toDataURL('image/png');
        const id = this._addImage(layerName, dataURL);
        addedIds.push(id);
      }
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
          const id = this._addImage(item.name, item.dataURL);
          // 二値化ツールから転送されたメモを反映
          if (item.memo) {
            const imgData = this.images.find(i => i.id === id);
            if (imgData) imgData.memo = item.memo;
          }
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
      memo: '',
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

    // 枠の内枠サイズを取得（スタンプ個別の余白があればそちらを優先）
    const category = frame._category;
    const margin = frame.stampMargin !== undefined ? frame.stampMargin : category.margin;
    const stampW = frame.stampWidth;
    const stampH = frame.stampHeight;
    const innerW = stampW - margin * 2;
    const innerH = stampH - margin * 2;

    // 画像配置エリア（内枠から各辺0.5mm内側に余白）
    const imagePadding = 0.5;
    const imageAreaW = innerW - imagePadding * 2;
    const imageAreaH = innerH - imagePadding * 2;

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

    // 描画部分が配置エリアに収まる最大スケールを計算（0.5mm余白込み）
    const scaleX = imageAreaW / bounds.width;
    const scaleY = imageAreaH / bounds.height;
    const scale = Math.min(scaleX, scaleY);

    // 配置エリアの中心座標（キャンバス座標）
    const innerCenterX = frame.left + margin + imagePadding + imageAreaW / 2;
    const innerCenterY = frame.top + margin + imagePadding + imageAreaH / 2;

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
      placementTime: Date.now(),
    };

    // 画像の配置状態を更新
    imageData.placedFrameId = frameUid;

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

  // === 画像を枠の中心に再配置 ===
  // 枠または画像を選択した状態で呼ぶ
  centerImageInFrame(selectedObj) {
    let frame = null;
    let placement = null;

    if (selectedObj.isStampFrame) {
      // 枠が選択された場合 → 紐づく画像を探す
      frame = selectedObj;
      const uid = this._getFrameUid(frame);
      placement = this.placements[uid];
    } else if (selectedObj.isPlacedImage) {
      // 画像が選択された場合 → 紐づく枠を探す
      const frameUid = selectedObj._linkedFrameUid;
      const frames = this.cm.getStampFrames();
      frame = frames.find(f => f._placerUid === frameUid);
      if (frame) {
        placement = this.placements[frameUid];
      }
    }

    if (!frame || !placement) return false;

    const fabricImg = placement.fabricImg;
    const imageData = this.images.find(i => i.id === placement.imageId);
    if (!imageData) return false;

    // 枠の内枠サイズを計算（スタンプ個別の余白があればそちらを優先）
    const category = frame._category;
    const margin = frame.stampMargin !== undefined ? frame.stampMargin : category.margin;
    const innerW = frame.stampWidth - margin * 2;
    const innerH = frame.stampHeight - margin * 2;
    const imagePadding = 0.5;
    const imageAreaW = innerW - imagePadding * 2;
    const imageAreaH = innerH - imagePadding * 2;

    // 描画部分のバウンディングボックスを再検出
    const bounds = this._detectContentBounds(imageData.element);

    // 配置エリアに収まるスケールを再計算
    const scaleX = imageAreaW / bounds.width;
    const scaleY = imageAreaH / bounds.height;
    const scale = Math.min(scaleX, scaleY);

    // 配置エリアの中心座標
    const centerX = frame.left + margin + imagePadding + imageAreaW / 2;
    const centerY = frame.top + margin + imagePadding + imageAreaH / 2;

    // 描画部分の中心を配置エリア中心に合わせる
    const contentCenterX = bounds.x + bounds.width / 2;
    const contentCenterY = bounds.y + bounds.height / 2;

    fabricImg.set({
      scaleX: scale,
      scaleY: scale,
      left: centerX - contentCenterX * scale,
      top: centerY - contentCenterY * scale,
    });

    // オフセットを再計算
    fabricImg._offsetFromFrame = {
      x: fabricImg.left - frame.left,
      y: fabricImg.top - frame.top,
    };

    fabricImg.setCoords();
    fabricImg.dirty = true;
    this.cm.getCanvas().renderAll();
    return true;
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

  // レイヤーキャンバスの描画部分だけをトリミング
  // iPadアプリではレイヤーがキャンバス全体サイズになっていることがあるため必須
  _trimLayerCanvas(srcCanvas) {
    const w = srcCanvas.width;
    const h = srcCanvas.height;
    if (w === 0 || h === 0) return null;

    const ctx = srcCanvas.getContext('2d');
    let imageData;
    try {
      imageData = ctx.getImageData(0, 0, w, h);
    } catch (e) {
      return srcCanvas; // CORSエラー等の場合はそのまま返す
    }
    const data = imageData.data;

    // 上端を探索
    let minY = -1;
    for (let y = 0; y < h && minY < 0; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 0) { minY = y; break; }
      }
    }
    if (minY < 0) return null; // 完全に透明

    // 下端を探索
    let maxY = minY;
    for (let y = h - 1; y > minY; y--) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 0) { maxY = y; break; }
      }
      if (maxY > minY) break;
    }

    // 左端・右端を探索
    let minX = w, maxX = 0;
    for (let y = minY; y <= maxY; y++) {
      for (let x = 0; x < minX; x++) {
        if (data[(y * w + x) * 4 + 3] > 0) { minX = x; break; }
      }
      for (let x = w - 1; x > maxX; x--) {
        if (data[(y * w + x) * 4 + 3] > 0) { maxX = x; break; }
      }
    }

    const trimW = maxX - minX + 1;
    const trimH = maxY - minY + 1;

    // 元のサイズと大差なければトリミング不要
    if (trimW >= w * 0.95 && trimH >= h * 0.95) return srcCanvas;

    const trimmed = document.createElement('canvas');
    trimmed.width = trimW;
    trimmed.height = trimH;
    trimmed.getContext('2d').drawImage(srcCanvas, minX, minY, trimW, trimH, 0, 0, trimW, trimH);

    return trimmed;
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
          <input type="text" class="placer-memo" value="${this._escapeHtml(img.memo || '')}" placeholder="メモ..." data-image-id="${img.id}">
        </div>
        <button class="placer-remove" data-remove-id="${img.id}" title="リストから削除">
          <svg viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd"/></svg>
        </button>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.placer-remove') || e.target.closest('.placer-memo')) return;
        this.select(img.id);
      });

      // メモ入力イベント
      const memoInput = item.querySelector('.placer-memo');
      if (memoInput) {
        memoInput.addEventListener('click', (e) => e.stopPropagation());
        memoInput.addEventListener('input', (e) => { img.memo = e.target.value; });
      }

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
