// 1200DPI PNGエクスポート・PSDエクスポート（コンテンツ領域トリミング対応）

class Exporter {
  constructor(canvasManager) {
    this.cm = canvasManager;
  }

  // デバイス判定（iOS/iPadOSはキャンバスサイズ上限がある）
  _isIOSDevice() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  // 最大キャンバスサイズを推定
  _getMaxCanvasPixels() {
    if (this._isIOSDevice()) {
      return 16777216; // iOS Safari: 約1677万ピクセル
    }
    return 268435456; // デスクトップ: 16384x16384
  }

  // エクスポート倍率を計算（bounds指定時はトリミング領域で判定）
  _getExportMultiplier(bounds) {
    const baseMult = FRAME_DATA.EXPORT_WIDTH_PX / FRAME_DATA.A4_WIDTH; // 1200DPI
    const w = bounds ? bounds.width : FRAME_DATA.A4_WIDTH;
    const h = bounds ? bounds.height : FRAME_DATA.A4_HEIGHT;
    const targetW = Math.round(w * baseMult);
    const targetH = Math.round(h * baseMult);
    const targetPixels = targetW * targetH;
    const maxPixels = this._getMaxCanvasPixels();

    if (targetPixels <= maxPixels) {
      return baseMult;
    }

    // 収まるように縮小
    const scale = Math.sqrt(maxPixels / targetPixels);
    return baseMult * scale;
  }

  // コンテンツ領域のバウンディングボックスを計算（mm単位）
  _getContentBounds() {
    const frames = this.cm.getStampFrames();
    const canvas = this.cm.getCanvas();

    if (frames.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    // 全スタンプ枠を含める
    frames.forEach(f => {
      minX = Math.min(minX, f.left);
      minY = Math.min(minY, f.top);
      maxX = Math.max(maxX, f.left + f.stampWidth);
      maxY = Math.max(maxY, f.top + f.stampHeight + 4); // +4mm サイズ表記分
    });

    // タイトルテキストを含める
    canvas.getObjects().forEach(obj => {
      if (obj.isTitleText && obj.visible !== false) {
        const textLeft = obj.left;
        const textWidth = obj.width * (obj.scaleX || 1);
        const textHeight = obj.height * (obj.scaleY || 1);
        minX = Math.min(minX, textLeft);
        minY = Math.min(minY, obj.top);
        maxX = Math.max(maxX, textLeft + textWidth);
        maxY = Math.max(maxY, obj.top + textHeight);
      }
    });

    // 余白を追加（5mm）
    const CROP_MARGIN = 5;
    minX = Math.max(0, minX - CROP_MARGIN);
    minY = Math.max(0, minY - CROP_MARGIN);
    maxX = Math.min(FRAME_DATA.A4_WIDTH, maxX + CROP_MARGIN);
    maxY = Math.min(FRAME_DATA.A4_HEIGHT, maxY + CROP_MARGIN);

    return {
      left: minX,
      top: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  // ファイル名生成（タイトル入力値を使用）
  _getFileName(ext) {
    const titleInput = document.getElementById('title-input');
    const title = (titleInput && titleInput.value.trim()) || '入稿データ';
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `Hankodori_${title}_${y}_${m}_${d}.${ext}`;
  }

  // PNG エクスポート（コンテンツ領域にトリミング）
  async exportPNG() {
    const canvas = this.cm.getCanvas();
    const bounds = this._getContentBounds();

    if (!bounds) {
      alert('書き出すスタンプ枠がありません。');
      return;
    }

    const multiplier = this._getExportMultiplier(bounds);
    const outputW = Math.round(bounds.width * multiplier);
    const outputH = Math.round(bounds.height * multiplier);
    const actualDPI = Math.round(multiplier * 25.4);

    // ローディング表示
    this._showLoading(`PNG書出し中... (${outputW}x${outputH}px, ${actualDPI}DPI)`);
    await this._sleep(100);

    try {
      // エクスポートに含めないオブジェクトを一時非表示
      const hiddenObjects = [];
      canvas.getObjects().forEach(obj => {
        if (obj.excludeFromExport || obj.isGrid) {
          obj.set({ visible: false });
          hiddenObjects.push(obj);
        }
      });

      // サイズ表記ラベルを非表示（書き出しに不要）
      const sizeLabels = [];
      canvas.getObjects().forEach(obj => {
        if (obj.isStampFrame) {
          const children = obj.getObjects();
          if (children.length >= 4 && children[3].isSizeLabel) {
            children[3].set({ visible: false });
            sizeLabels.push(children[3]);
            obj.dirty = true;
          }
        }
      });

      // グリッドを一時非表示
      const gridWasVisible = this.cm.gridVisible;
      if (gridWasVisible) {
        this.cm.gridLines.forEach(l => l.set({ visible: false }));
      }

      // ビューポートを一時的にリセット
      const origVpt = canvas.viewportTransform.slice();
      canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
      canvas.renderAll();

      const dataURL = canvas.toDataURL({
        format: 'png',
        multiplier: multiplier,
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      });

      // ビューポートを復元
      canvas.viewportTransform = origVpt;

      // 非表示にしたオブジェクトを復元
      hiddenObjects.forEach(obj => obj.set({ visible: true }));
      sizeLabels.forEach(label => { label.set({ visible: true }); });
      canvas.getObjects().forEach(obj => {
        if (obj.isStampFrame) obj.dirty = true;
      });

      if (gridWasVisible) {
        this.cm.gridLines.forEach(l => l.set({ visible: true }));
      }
      canvas.requestRenderAll();

      // ダウンロード
      this._downloadDataURL(dataURL, this._getFileName('png'));

      if (actualDPI < FRAME_DATA.EXPORT_DPI) {
        alert(`デバイスの制限により、${actualDPI}DPIで出力しました（推奨: ${FRAME_DATA.EXPORT_DPI}DPI）。\nPC版のChromeで開くと1200DPIで出力できます。`);
      }
    } catch (e) {
      console.error('PNGエクスポートエラー:', e);
      alert('PNGエクスポートに失敗しました。');
    } finally {
      this._hideLoading();
    }
  }

  // SVG エクスポート
  exportSVG() {
    const canvas = this.cm.getCanvas();

    const hiddenObjects = [];
    canvas.getObjects().forEach(obj => {
      if (obj.excludeFromExport || obj.isGrid) {
        obj.set({ visible: false });
        hiddenObjects.push(obj);
      }
    });

    const gridWasVisible = this.cm.gridVisible;
    if (gridWasVisible) {
      this.cm.gridLines.forEach(l => l.set({ visible: false }));
    }

    const origVpt = canvas.viewportTransform.slice();
    canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
    canvas.renderAll();

    const svgString = canvas.toSVG({
      width: `${FRAME_DATA.A4_WIDTH}mm`,
      height: `${FRAME_DATA.A4_HEIGHT}mm`,
      viewBox: {
        x: 0,
        y: 0,
        width: FRAME_DATA.A4_WIDTH,
        height: FRAME_DATA.A4_HEIGHT,
      },
    });

    canvas.viewportTransform = origVpt;
    hiddenObjects.forEach(obj => obj.set({ visible: true }));
    if (gridWasVisible) {
      this.cm.gridLines.forEach(l => l.set({ visible: true }));
    }
    canvas.requestRenderAll();

    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    this._downloadURL(url, this._getFileName('svg'));
    URL.revokeObjectURL(url);
  }

  // データURLをダウンロード
  _downloadDataURL(dataURL, filename) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // BlobURLをダウンロード
  _downloadURL(url, filename) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  _showLoading(text) {
    const overlay = document.getElementById('loading-overlay');
    const label = document.getElementById('loading-text');
    if (label) label.textContent = text || 'エクスポート中...';
    if (overlay) overlay.classList.add('show');
  }

  _hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.remove('show');
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // PSD エクスポート（レイヤー分け・コンテンツ領域にトリミング）
  async exportPSD() {
    if (typeof agPsd === 'undefined') {
      alert('PSDライブラリの読み込みに失敗しました。ページを再読み込みしてください。');
      return;
    }

    const frames = this.cm.getStampFrames();
    if (frames.length === 0) {
      alert('書き出すスタンプ枠がありません。');
      return;
    }

    const bounds = this._getContentBounds();
    if (!bounds) return;

    const multiplier = this._getExportMultiplier(bounds);
    const outputW = Math.round(bounds.width * multiplier);
    const outputH = Math.round(bounds.height * multiplier);
    const actualDPI = Math.round(multiplier * 25.4);

    // トリミングオフセット（ピクセル単位）
    const offsetX = bounds.left * multiplier;
    const offsetY = bounds.top * multiplier;

    this._showLoading(`PSD書出し中... (${outputW}x${outputH}px, ${actualDPI}DPI)`);
    await this._sleep(100);

    try {
      const psdLayers = [];

      // 背景レイヤー（白）
      const bgCanvas = document.createElement('canvas');
      bgCanvas.width = outputW;
      bgCanvas.height = outputH;
      const bgCtx = bgCanvas.getContext('2d');
      bgCtx.fillStyle = '#FFFFFF';
      bgCtx.fillRect(0, 0, outputW, outputH);
      psdLayers.push({
        name: '背景',
        canvas: bgCanvas,
        left: 0,
        top: 0,
      });

      // タイトルレイヤー
      const canvas = this.cm.getCanvas();
      const titleObj = canvas.getObjects().find(o => o.isTitleText);
      if (titleObj && titleObj.text) {
        const fontSize = Math.round(5 * multiplier);
        const tc = document.createElement('canvas');
        const tctx = tc.getContext('2d');
        tctx.font = `bold ${fontSize}px "Noto Sans JP", sans-serif`;
        const measured = tctx.measureText(titleObj.text);
        tc.width = Math.ceil(measured.width) + 4;
        tc.height = Math.ceil(fontSize * 1.3);
        // canvasリサイズでfontがリセットされるので再設定
        tctx.font = `bold ${fontSize}px "Noto Sans JP", sans-serif`;
        tctx.fillStyle = '#000000';
        tctx.textBaseline = 'top';
        tctx.fillText(titleObj.text, 0, 0);

        psdLayers.push({
          name: 'タイトル',
          canvas: tc,
          left: Math.round(titleObj.left * multiplier - offsetX),
          top: Math.round(titleObj.top * multiplier - offsetY),
        });
      }

      // 各スタンプ枠ごとにグループ
      frames.forEach(frame => {
        const groupChildren = [];

        // 画像レイヤー（配置済みの場合）
        if (window.imagePlacer) {
          const uid = window.imagePlacer._getFrameUid(frame);
          const placement = window.imagePlacer.placements[uid];
          if (placement && placement.fabricImg) {
            const imgResult = this._renderPlacedImage(placement.fabricImg, frame, multiplier);
            if (imgResult) {
              groupChildren.push({
                name: '画像 - ' + frame.stampId,
                canvas: imgResult.canvas,
                left: imgResult.left - Math.round(offsetX),
                top: imgResult.top - Math.round(offsetY),
              });
            }
          }
        }

        // 枠線レイヤー
        const frameResult = this._renderFrameLines(frame, multiplier);
        groupChildren.push({
          name: '枠線 - ' + frame.stampId,
          canvas: frameResult.canvas,
          left: frameResult.left - Math.round(offsetX),
          top: frameResult.top - Math.round(offsetY),
        });

        psdLayers.push({
          name: frame.stampId,
          opened: true,
          children: groupChildren,
        });
      });

      const psd = {
        width: outputW,
        height: outputH,
        imageResources: {
          resolutionInfo: {
            horizontalResolution: actualDPI,
            horizontalResolutionUnit: 'PPI',
            widthUnit: 'Inches',
            verticalResolution: actualDPI,
            verticalResolutionUnit: 'PPI',
            heightUnit: 'Inches',
          },
        },
        children: psdLayers,
      };

      const result = agPsd.writePsd(psd);
      const blob = new Blob([result], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      this._downloadURL(url, this._getFileName('psd'));
      URL.revokeObjectURL(url);

      if (actualDPI < FRAME_DATA.EXPORT_DPI) {
        alert('デバイスの制限により、' + actualDPI + 'DPIで出力しました（推奨: ' + FRAME_DATA.EXPORT_DPI + 'DPI）。\nPC版のChromeで開くと1200DPIで出力できます。');
      }
    } catch (e) {
      console.error('PSDエクスポートエラー:', e);
      alert('PSDエクスポートに失敗しました。\n' + e.message);
    } finally {
      this._hideLoading();
    }
  }

  // 配置済み画像をオフスクリーンCanvasにレンダリング
  _renderPlacedImage(fabricImg, frame, multiplier) {
    const category = frame._category;
    const margin = category.margin;
    const innerW = Math.ceil((frame.stampWidth - margin * 2) * multiplier);
    const innerH = Math.ceil((frame.stampHeight - margin * 2) * multiplier);
    if (innerW <= 0 || innerH <= 0) return null;

    const c = document.createElement('canvas');
    c.width = innerW;
    c.height = innerH;
    const ctx = c.getContext('2d');

    const imgEl = fabricImg.getElement();
    const sx = fabricImg.scaleX || 1;
    const sy = fabricImg.scaleY || 1;
    const imgOffsetX = (fabricImg.left - frame.left - margin) * multiplier;
    const imgOffsetY = (fabricImg.top - frame.top - margin) * multiplier;
    const dw = imgEl.naturalWidth * sx * multiplier;
    const dh = imgEl.naturalHeight * sy * multiplier;

    ctx.drawImage(imgEl, imgOffsetX, imgOffsetY, dw, dh);

    return {
      canvas: c,
      left: Math.round((frame.left + margin) * multiplier),
      top: Math.round((frame.top + margin) * multiplier),
    };
  }

  // 枠線をオフスクリーンCanvasにレンダリング
  _renderFrameLines(frame, multiplier) {
    const category = frame._category;
    const w = Math.ceil(frame.stampWidth * multiplier);
    const h = Math.ceil(frame.stampHeight * multiplier);
    const margin = category.margin;

    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');

    // 外枠
    ctx.strokeStyle = category.outerStroke;
    ctx.lineWidth = 0.4 * multiplier;
    if (category.outerStrokeDash.length > 0) {
      ctx.setLineDash(category.outerStrokeDash.map(v => v * multiplier));
    }
    ctx.strokeRect(0, 0, w, h);

    // 内枠
    const innerX = margin * multiplier;
    const innerY = margin * multiplier;
    const innerW = (frame.stampWidth - margin * 2) * multiplier;
    const innerH = (frame.stampHeight - margin * 2) * multiplier;

    ctx.strokeStyle = category.innerStroke;
    ctx.lineWidth = 0.3 * multiplier;
    if (category.innerStrokeDash.length > 0) {
      ctx.setLineDash(category.innerStrokeDash.map(v => v * multiplier));
    } else {
      ctx.setLineDash([]);
    }
    ctx.strokeRect(innerX, innerY, innerW, innerH);

    return {
      canvas: c,
      left: Math.round(frame.left * multiplier),
      top: Math.round(frame.top * multiplier),
    };
  }
}
