// 二値化画像をスタンプ枠に配置する管理クラス

class ImagePlacer {
  constructor(canvasManager) {
    this.cm = canvasManager;
    this.images = [];      // { id, name, dataURL, element(img) }
    this.nextId = 1;
    this.selectedId = null; // 選択中の画像ID
    this.placements = {};   // frameのstampId+位置 → { imageId, fabricImg } のマップ
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

    this.images.push({
      id: this.nextId++,
      name: name,
      dataURL: dataURL,
      element: img,
      placedFrameId: null,  // 配置済み枠のID（ユニーク識別子）
    });
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

  // === 選択中の画像を枠に配置 ===
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

    // 画像をFabric.jsオブジェクトとして作成
    const fabricImg = new fabric.Image(imageData.element, {
      selectable: false,
      evented: false,
    });

    // 内枠に収まるようにスケール
    const scaleX = innerW / fabricImg.width;
    const scaleY = innerH / fabricImg.height;
    const scale = Math.min(scaleX, scaleY);

    const imgW = fabricImg.width * scale;
    const imgH = fabricImg.height * scale;

    // グループ内座標（中心が原点）
    const imgLeft = margin + (innerW - imgW) / 2 - stampW / 2;
    const imgTop = margin + (innerH - imgH) / 2 - stampH / 2;

    fabricImg.set({
      scaleX: scale,
      scaleY: scale,
      left: imgLeft,
      top: imgTop,
      // カスタムプロパティ
      isPlacedImage: true,
      placerImageId: imageData.id,
    });

    // グループに画像を追加
    frame.addWithUpdate(fabricImg);
    this.cm.getCanvas().requestRenderAll();

    // 配置記録
    const frameUid = this._getFrameUid(frame);
    this.placements[frameUid] = {
      imageId: imageData.id,
      fabricImg: fabricImg,
    };

    // 画像の配置状態を更新
    imageData.placedFrameId = frameUid;

    // ラベルを非表示にする（画像が入ったので）
    this._setLabelVisible(frame, false);

    // 選択解除
    this.deselect();

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

    // グループから画像を削除
    frame.removeWithUpdate(placement.fabricImg);

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

    // 古い記録を削除
    const imageData = this.images.find(i => i.id === placement.imageId);
    if (imageData) imageData.placedFrameId = null;
    delete this.placements[frameUid];

    return { imageId: placement.imageId };
  }

  // === 回転後に再配置 ===
  restorePlacement(frame, placementInfo) {
    if (!placementInfo) return;

    const imageData = this.images.find(i => i.id === placementInfo.imageId);
    if (!imageData) return;

    // 一時的に選択状態にして配置
    const prevSelected = this.selectedId;
    this.selectedId = imageData.id;
    this.placeInFrame(frame);
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
        // 枠を見つけて除去
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

  // === サイドバーの画像一覧を描画 ===
  renderList() {
    // PC用サイドバー
    this._renderListTo('placer-image-list');
    // モバイル用
    this._renderListTo('mobile-placer-image-list');

    // カウント表示
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

      item.innerHTML = `
        <img src="${img.dataURL}" class="placer-thumb" alt="${this._escapeHtml(img.name)}">
        <div class="placer-info">
          <span class="placer-name">${this._escapeHtml(img.name)}</span>
          <span class="placer-status">${isPlaced ? '配置済み' : (isSelected ? '選択中 - 枠をクリック' : '')}</span>
        </div>
        <button class="placer-remove" data-remove-id="${img.id}" title="リストから削除">
          <svg viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd"/></svg>
        </button>
      `;

      // サムネイルクリックで選択
      item.addEventListener('click', (e) => {
        if (e.target.closest('.placer-remove')) return;
        this.select(img.id);
      });

      // 削除ボタン
      const removeBtn = item.querySelector('.placer-remove');
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeImage(img.id);
      });

      container.appendChild(item);
    });
  }

  // === ヘルパー ===

  // 枠のユニーク識別子（オブジェクトごとにユニーク）
  _getFrameUid(frame) {
    if (!frame._placerUid) {
      frame._placerUid = 'frame_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }
    return frame._placerUid;
  }

  // ラベル（グループの3番目の要素）の表示/非表示
  _setLabelVisible(frame, visible) {
    const objects = frame.getObjects();
    // objects[2] がラベル
    if (objects.length >= 3 && objects[2] instanceof fabric.Text) {
      objects[2].set({ opacity: visible ? 0.4 : 0 });
    }
  }

  // 配置ヒント表示切替
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
