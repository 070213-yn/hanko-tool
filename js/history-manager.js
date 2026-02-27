// Undo/Redo管理（スナップショット方式）

class HistoryManager {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = 50;
    this.canvasManager = null;
    this.frameFactory = null;
    this.imagePlacer = null;
    this.onRestore = null;     // 復元後のコールバック
    this._isRestoring = false; // 復元中フラグ（二重保存防止）
  }

  // 依存関係を設定
  init(canvasManager, frameFactory, imagePlacer) {
    this.canvasManager = canvasManager;
    this.frameFactory = frameFactory;
    this.imagePlacer = imagePlacer;
  }

  // 現在の状態をスナップショットとして保存
  saveState() {
    if (this._isRestoring) return;

    const snapshot = this._capture();
    this.undoStack.push(snapshot);

    // 新しい操作をしたらredoStackはクリア
    this.redoStack = [];

    // 上限を超えたら古い履歴を捨てる
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }

    this._updateButtons();
  }

  // 1つ前の状態に戻す
  undo() {
    if (this.undoStack.length <= 1) return; // 初期状態は残す

    const current = this.undoStack.pop();
    this.redoStack.push(current);

    const prev = this.undoStack[this.undoStack.length - 1];
    this._restore(prev);
    this._updateButtons();
  }

  // やり直す
  redo() {
    if (this.redoStack.length === 0) return;

    const next = this.redoStack.pop();
    this.undoStack.push(next);

    this._restore(next);
    this._updateButtons();
  }

  // === セッション保存/復元（ページ遷移対応） ===

  // sessionStorageに現在の状態を保存
  saveToSession() {
    const snapshot = this._capture();

    // categoryオブジェクト参照をシリアライズ可能な形に変換
    const serialized = snapshot.map(entry => ({
      stampId: entry.stampId,
      stampWidth: entry.stampWidth,
      stampHeight: entry.stampHeight,
      left: entry.left,
      top: entry.top,
      makerKey: this._findMakerKey(entry.category),
      categoryName: entry.category.name,
      placedImageId: entry.placedImageId,
      imageState: entry.imageState,
    }));

    // 画像データも保存
    const images = this.imagePlacer.images.map(img => ({
      id: img.id,
      name: img.name,
      dataURL: img.dataURL,
    }));

    const data = {
      frames: serialized,
      images: images,
      nextId: this.imagePlacer.nextId,
    };

    try {
      sessionStorage.setItem('hankodori_frames', JSON.stringify(data));
    } catch (e) {
      console.error('セッション保存エラー:', e);
    }
  }

  // sessionStorageから状態を復元
  restoreFromSession() {
    const raw = sessionStorage.getItem('hankodori_frames');
    if (!raw) return false;

    try {
      const data = JSON.parse(raw);
      sessionStorage.removeItem('hankodori_frames');

      if (!data.frames || data.frames.length === 0) return false;

      // 画像を復元（IDマッピングを作成）
      const idMap = {};
      if (data.images && data.images.length > 0) {
        data.images.forEach(img => {
          const newId = this.imagePlacer._addImage(img.name, img.dataURL);
          idMap[img.id] = newId;
        });
        this.imagePlacer.renderList();
      }

      // 枠を復元
      this._isRestoring = true;
      data.frames.forEach(entry => {
        const category = this._findCategory(entry.makerKey, entry.categoryName);
        if (!category) return;

        const stamp = {
          id: entry.stampId,
          width: entry.stampWidth,
          height: entry.stampHeight,
        };

        const newFrame = this.frameFactory.createFrame(stamp, category, {
          left: entry.left,
          top: entry.top,
        });

        // 配置画像の復元
        if (entry.placedImageId && this.imagePlacer) {
          const mappedId = idMap[entry.placedImageId] || entry.placedImageId;
          this.imagePlacer.restorePlacement(newFrame, {
            imageId: mappedId,
            imageState: entry.imageState || null,
          });
        }
      });
      this._isRestoring = false;

      // 履歴をリセットして初期状態を保存
      this.undoStack = [];
      this.redoStack = [];
      this.saveState();

      return true;
    } catch (e) {
      console.error('セッション復元エラー:', e);
      return false;
    }
  }

  // === 内部メソッド ===

  // 全枠の状態をキャプチャ
  _capture() {
    const frames = this.canvasManager.getStampFrames();
    return frames.map(frame => {
      // 配置画像の情報を取得
      let placedImageId = null;
      let imageState = null;
      if (this.imagePlacer) {
        const uid = this.imagePlacer._getFrameUid(frame);
        const placement = this.imagePlacer.placements[uid];
        if (placement) {
          placedImageId = placement.imageId;
          // 画像の位置・スケール状態も保存
          imageState = {
            left: placement.fabricImg.left,
            top: placement.fabricImg.top,
            scaleX: placement.fabricImg.scaleX,
            scaleY: placement.fabricImg.scaleY,
            offsetFromFrame: { ...placement.fabricImg._offsetFromFrame },
            clipOffsetFromFrame: { ...placement.fabricImg._clipOffsetFromFrame },
          };
        }
      }

      return {
        stampId: frame.stampId,
        stampWidth: frame.stampWidth,
        stampHeight: frame.stampHeight,
        left: frame.left,
        top: frame.top,
        category: frame._category,
        placedImageId: placedImageId,
        imageState: imageState,
      };
    });
  }

  // スナップショットからキャンバスを復元
  _restore(snapshot) {
    this._isRestoring = true;

    const canvas = this.canvasManager.getCanvas();

    // 全スタンプ枠と配置画像を削除
    const frames = this.canvasManager.getStampFrames();
    frames.forEach(f => {
      if (this.imagePlacer) {
        this.imagePlacer.onFrameRemoved(f);
      }
      canvas.remove(f);
    });
    canvas.discardActiveObject();

    // スナップショットから再生成
    snapshot.forEach(entry => {
      const stamp = {
        id: entry.stampId,
        width: entry.stampWidth,
        height: entry.stampHeight,
      };
      const newFrame = this.frameFactory.createFrame(stamp, entry.category, {
        left: entry.left,
        top: entry.top,
      });

      // 配置画像の復元（位置・スケール情報付き）
      if (entry.placedImageId && this.imagePlacer) {
        this.imagePlacer.restorePlacement(newFrame, {
          imageId: entry.placedImageId,
          imageState: entry.imageState,
        });
      }
    });

    canvas.discardActiveObject();
    canvas.requestRenderAll();

    // コールバック（空状態メッセージ更新など）
    if (this.onRestore) {
      this.onRestore();
    }

    this._isRestoring = false;
  }

  // FRAME_DATAからcategoryオブジェクトが属するmakerキーを検索
  _findMakerKey(category) {
    for (const [key, maker] of Object.entries(FRAME_DATA.makers)) {
      if (maker.categories.some(c => c === category)) return key;
    }
    return null;
  }

  // makerKey + categoryNameからcategoryオブジェクトを取得
  _findCategory(makerKey, categoryName) {
    const maker = FRAME_DATA.makers[makerKey];
    if (!maker) return null;
    return maker.categories.find(c => c.name === categoryName) || null;
  }

  // undo/redoボタンの有効/無効を更新
  _updateButtons() {
    const canUndo = this.undoStack.length > 1;
    const canRedo = this.redoStack.length > 0;

    document.querySelectorAll('.undo-redo-btn[data-action="undo"]').forEach(btn => {
      btn.disabled = !canUndo;
    });
    document.querySelectorAll('.undo-redo-btn[data-action="redo"]').forEach(btn => {
      btn.disabled = !canRedo;
    });
  }
}
