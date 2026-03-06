// PNGエクスポート（1200DPI）・PSDエクスポート（600DPI）（コンテンツ領域トリミング対応）
// iPad DPI制限対策: iOS上限超え時はPNG分割ダウンロード、PSD複数ファイル分割

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

  // 常に1200DPIの倍率を返す（DPI縮小は行わない）
  _getFullMultiplier() {
    return FRAME_DATA.EXPORT_WIDTH_PX / FRAME_DATA.A4_WIDTH;
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
      maxY = Math.max(maxY, f.top + f.stampHeight + 8); // +8mm サイズ表記+メモ分
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

  // ファイル名生成（タイトルをそのままファイル名にする）
  _getFileName(ext) {
    const titleInput = document.getElementById('title-input');
    let title = (titleInput && titleInput.value.trim()) || '入稿データ';
    // ファイル名に使えない文字を除去
    title = title.replace(/[\\/:*?"<>|]/g, '');
    if (!title) title = '入稿データ';
    return `${title}.${ext}`;
  }

  // === PNG エクスポート（1200DPI固定、iOS上限超え時は分割ダウンロード） ===
  async exportPNG() {
    const canvas = this.cm.getCanvas();
    const bounds = this._getContentBounds();

    if (!bounds) {
      alert('書き出すスタンプ枠がありません。');
      return;
    }

    const multiplier = this._getFullMultiplier(); // 常に1200DPI
    const outputW = Math.round(bounds.width * multiplier);
    const outputH = Math.round(bounds.height * multiplier);
    const maxPixels = this._getMaxCanvasPixels();

    if (outputW * outputH <= maxPixels) {
      // 上限内 → 従来通り一括エクスポート
      return this._exportPNGSingle(bounds, multiplier);
    }

    // iOS上限超え → ストリップ分割エクスポート
    return this._exportPNGTiled(bounds, multiplier, maxPixels);
  }

  // 一括PNGエクスポート（上限内の場合）
  async _exportPNGSingle(bounds, multiplier) {
    const canvas = this.cm.getCanvas();
    const outputW = Math.round(bounds.width * multiplier);
    const outputH = Math.round(bounds.height * multiplier);
    const actualDPI = Math.round(multiplier * 25.4);

    this._showLoading(`PNG書出し中... (${outputW}x${outputH}px, ${actualDPI}DPI)`);
    await this._sleep(100);

    try {
      const { hiddenObjects, gridWasVisible, origVpt } = this._prepareExport(canvas);

      const dataURL = canvas.toDataURL({
        format: 'png',
        multiplier: multiplier,
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      });

      this._restoreExport(canvas, hiddenObjects, gridWasVisible, origVpt);

      this._downloadDataURL(dataURL, this._getFileName('png'));
    } catch (e) {
      console.error('PNGエクスポートエラー:', e);
      alert('PNGエクスポートに失敗しました。');
    } finally {
      this._hideLoading();
    }
  }

  // 分割PNGエクスポート（iOS上限超えの場合）
  async _exportPNGTiled(bounds, multiplier, maxPixels) {
    const canvas = this.cm.getCanvas();
    const outputW = Math.round(bounds.width * multiplier);
    const actualDPI = Math.round(multiplier * 25.4);

    // ストリップ高さを計算（ピクセル単位で上限内に収まる高さ）
    const stripHpx = Math.floor(maxPixels / outputW);
    const stripHmm = stripHpx / multiplier; // mm単位
    const totalHmm = bounds.height;
    const numStrips = Math.ceil(totalHmm / stripHmm);

    this._showLoading(`PNG分割書出し中... (${numStrips}枚, ${actualDPI}DPI)`);
    await this._sleep(100);

    alert(`iPadの制限により、${numStrips}枚のPNGに分割して${actualDPI}DPIで出力します。\nPC上で結合してください。`);

    try {
      const { hiddenObjects, gridWasVisible, origVpt } = this._prepareExport(canvas);

      for (let i = 0; i < numStrips; i++) {
        const y = bounds.top + i * stripHmm;
        const h = Math.min(stripHmm, totalHmm - i * stripHmm);

        this._showLoading(`PNG分割書出し中... (${i + 1}/${numStrips}枚)`);

        const dataURL = canvas.toDataURL({
          format: 'png',
          multiplier: multiplier,
          left: bounds.left,
          top: y,
          width: bounds.width,
          height: h,
        });

        const filename = this._getFileName('png').replace('.png', `_${i + 1}of${numStrips}.png`);
        this._downloadDataURL(dataURL, filename);

        // ブラウザが複数ダウンロードを処理する間隔
        await this._sleep(500);
      }

      this._restoreExport(canvas, hiddenObjects, gridWasVisible, origVpt);
    } catch (e) {
      console.error('PNG分割エクスポートエラー:', e);
      alert('PNG分割エクスポートに失敗しました。');
    } finally {
      this._hideLoading();
    }
  }

  // エクスポート前の共通準備（非表示オブジェクト、ビューポートリセット）
  _prepareExport(canvas) {
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

    return { hiddenObjects, gridWasVisible, origVpt };
  }

  // エクスポート後の復元
  _restoreExport(canvas, hiddenObjects, gridWasVisible, origVpt) {
    canvas.viewportTransform = origVpt;
    hiddenObjects.forEach(obj => obj.set({ visible: true }));
    if (gridWasVisible) {
      this.cm.gridLines.forEach(l => l.set({ visible: true }));
    }
    canvas.requestRenderAll();
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

  // ArrayBufferをファイルとしてダウンロード
  _downloadBuffer(buffer, filename) {
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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

  // === PSD エクスポート（600DPI、枠+メモ+タイトル統合レイヤー） ===
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

    const dpi = 600;
    const scale = dpi / 25.4; // 1mmあたりのピクセル数
    const outputW = Math.round(bounds.width * scale);
    const outputH = Math.round(bounds.height * scale);
    const maxPixels = this._getMaxCanvasPixels();

    // オフセット（トリミング位置）
    const offsetXPx = bounds.left * scale;
    const offsetYPx = bounds.top * scale;

    // 分割数を計算
    let splitCount = 1;
    if (outputW * outputH > maxPixels) {
      splitCount = Math.ceil(outputW * outputH / maxPixels) + 1;
    }

    this._showLoading(`PSD書出し中... (${outputW}x${outputH}px, ${dpi}DPI)`);
    await this._sleep(100);

    try {
      if (splitCount === 1) {
        // 一括書出し
        const psdBuffer = this._renderPSD600(frames, bounds, scale, 0, outputH, outputW, outputH, offsetXPx, offsetYPx, dpi);
        this._downloadBuffer(psdBuffer, this._getFileName('psd'));
      } else {
        // 分割書出し
        const sectionH = Math.ceil(outputH / splitCount);
        const baseName = this._getFileName('psd').replace('.psd', '');
        for (let i = 0; i < splitCount; i++) {
          const startY = i * sectionH;
          const endY = Math.min(startY + sectionH, outputH);
          const partH = endY - startY;

          this._showLoading(`PSD書出し中... (${i + 1}/${splitCount})`);

          try {
            const psdBuffer = this._renderPSD600(frames, bounds, scale, startY, endY, outputW, partH, offsetXPx, offsetYPx, dpi);
            const filename = `${baseName}_${String(i + 1).padStart(3, '0')}.psd`;
            this._downloadBuffer(psdBuffer, filename);
          } catch (e) {
            console.error(`分割${i + 1}/${splitCount}の書き出しに失敗:`, e);
            alert(`分割${i + 1}/${splitCount}の書き出しに失敗しました。`);
          }

          await this._sleep(500);
        }
      }
    } catch (e) {
      console.error('PSDエクスポートエラー:', e);
      alert('PSDエクスポートに失敗しました。\n' + e.message);
    } finally {
      this._hideLoading();
    }
  }

  // 600DPI PSD データを生成（枠+メモ+タイトル統合レイヤー）
  _renderPSD600(frames, bounds, scale, startYPx, endYPx, widthPx, heightPx, offsetXPx, offsetYPx, dpi) {
    const canvas = this.cm.getCanvas();

    // 背景レイヤー（白）
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = widthPx;
    bgCanvas.height = heightPx;
    const bgCtx = bgCanvas.getContext('2d');
    bgCtx.fillStyle = '#FFFFFF';
    bgCtx.fillRect(0, 0, widthPx, heightPx);

    // 枠情報レイヤー（枠線 + サイズ表記 + メモ + タイトル）
    const frameInfoCanvas = document.createElement('canvas');
    frameInfoCanvas.width = widthPx;
    frameInfoCanvas.height = heightPx;
    const fiCtx = frameInfoCanvas.getContext('2d');

    // タイトル描画
    const titleObj = canvas.getObjects().find(o => o.isTitleText);
    if (titleObj && titleObj.text) {
      const fontSize = Math.round(5 * scale);
      fiCtx.font = `bold ${fontSize}px "Noto Sans JP", sans-serif`;
      fiCtx.fillStyle = '#000000';
      fiCtx.textBaseline = 'top';
      const titleX = titleObj.left * scale - offsetXPx;
      const titleY = titleObj.top * scale - offsetYPx - startYPx;
      if (titleY + fontSize > 0 && titleY < heightPx) {
        fiCtx.fillText(titleObj.text, titleX, titleY);
      }
    }

    // 配置画像レイヤー
    const imageChildren = [];

    frames.forEach(frame => {
      const category = frame._category;
      const margin = category.margin;
      const fx = frame.left * scale - offsetXPx;
      const fy = frame.top * scale - offsetYPx - startYPx;
      const fw = frame.stampWidth * scale;
      const fh = frame.stampHeight * scale;

      // この分割範囲に含まれるかチェック
      if (fy + fh + 10 * scale < 0 || fy > heightPx) return;

      // 外枠
      fiCtx.strokeStyle = category.outerStroke;
      fiCtx.lineWidth = Math.max(1, 0.4 * scale);
      fiCtx.setLineDash(category.outerStrokeDash.length > 0
        ? category.outerStrokeDash.map(v => v * scale) : []);
      fiCtx.strokeRect(fx, fy, fw, fh);

      // 内枠
      const innerX = fx + margin * scale;
      const innerY = fy + margin * scale;
      const innerW = (frame.stampWidth - margin * 2) * scale;
      const innerH = (frame.stampHeight - margin * 2) * scale;
      fiCtx.strokeStyle = category.innerStroke;
      fiCtx.lineWidth = Math.max(1, 0.3 * scale);
      fiCtx.setLineDash(category.innerStrokeDash.length > 0
        ? category.innerStrokeDash.map(v => v * scale) : []);
      fiCtx.strokeRect(innerX, innerY, innerW, innerH);
      fiCtx.setLineDash([]);

      // サイズ表記（右下外側、右揃え）
      const sizeText = `${frame.stampId} ${frame.stampWidth}\u00D7${frame.stampHeight}`;
      const sizeFontSize = Math.round(2.5 * scale);
      fiCtx.font = `500 ${sizeFontSize}px sans-serif`;
      fiCtx.fillStyle = category.labelColor;
      fiCtx.globalAlpha = 0.55;
      fiCtx.textAlign = 'right';
      fiCtx.textBaseline = 'top';
      fiCtx.fillText(sizeText, fx + fw, fy + fh + 0.3 * scale);

      // メモ（サイズ表記の下、黒色、折り返し対応）
      const memo = frame.stampMemo || '';
      if (memo) {
        const memoFontSize = Math.round(2.2 * scale);
        fiCtx.font = `400 ${memoFontSize}px sans-serif`;
        fiCtx.fillStyle = '#000000';
        fiCtx.globalAlpha = 1.0;
        fiCtx.textAlign = 'left';
        fiCtx.textBaseline = 'top';
        const memoX = fx;
        const memoY = fy + fh + 3 * scale;
        const memoMaxW = Math.max(fw, 20 * scale);
        this._wrapText(fiCtx, memo, memoX, memoY, memoMaxW, memoFontSize * 1.3);
      }

      fiCtx.globalAlpha = 1.0;
      fiCtx.textAlign = 'start';
      fiCtx.textBaseline = 'alphabetic';

      // 配置済み画像を個別レイヤーとして追加
      if (window.imagePlacer) {
        const uid = window.imagePlacer._getFrameUid(frame);
        const placement = window.imagePlacer.placements[uid];
        if (placement && placement.fabricImg) {
          const imgResult = this._renderPlacedImage(placement.fabricImg, frame, scale);
          if (imgResult) {
            const imgLeft = imgResult.left - Math.round(offsetXPx);
            const imgTop = imgResult.top - Math.round(offsetYPx) - startYPx;

            // この分割範囲に含まれるかチェック
            if (imgTop + imgResult.canvas.height >= 0 && imgTop < heightPx) {
              imageChildren.push({
                name: '画像 - ' + frame.stampId,
                canvas: imgResult.canvas,
                left: imgLeft,
                top: imgTop,
              });
            }
          }
        }
      }
    });

    // PSDデータ構築
    const psd = {
      width: widthPx,
      height: heightPx,
      imageResources: {
        resolutionInfo: {
          horizontalResolution: dpi,
          horizontalResolutionUnit: 'PPI',
          widthUnit: 'Inches',
          verticalResolution: dpi,
          verticalResolutionUnit: 'PPI',
          heightUnit: 'Inches',
        },
      },
      children: [
        {
          name: '背景',
          canvas: bgCanvas,
          left: 0,
          top: 0,
        },
        {
          name: '枠情報・メモ・タイトル',
          canvas: frameInfoCanvas,
          left: 0,
          top: 0,
        },
        ...imageChildren,
      ],
    };

    return agPsd.writePsd(psd);
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

  // 全枠線を1枚のCanvasにまとめてレンダリング
  _renderAllFrameLines(frames, multiplier) {
    // 全枠を含むバウンディングボックス
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    frames.forEach(f => {
      minX = Math.min(minX, f.left);
      minY = Math.min(minY, f.top);
      maxX = Math.max(maxX, f.left + f.stampWidth);
      maxY = Math.max(maxY, f.top + f.stampHeight);
    });

    const canvasLeft = Math.round(minX * multiplier);
    const canvasTop = Math.round(minY * multiplier);
    const w = Math.ceil((maxX - minX) * multiplier);
    const h = Math.ceil((maxY - minY) * multiplier);

    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');

    // 各枠を描画
    frames.forEach(frame => {
      const category = frame._category;
      const margin = category.margin;
      const fx = (frame.left - minX) * multiplier;
      const fy = (frame.top - minY) * multiplier;
      const fw = frame.stampWidth * multiplier;
      const fh = frame.stampHeight * multiplier;

      // 外枠
      ctx.strokeStyle = category.outerStroke;
      ctx.lineWidth = 0.4 * multiplier;
      ctx.setLineDash(category.outerStrokeDash.length > 0
        ? category.outerStrokeDash.map(v => v * multiplier) : []);
      ctx.strokeRect(fx, fy, fw, fh);

      // 内枠
      const innerX = fx + margin * multiplier;
      const innerY = fy + margin * multiplier;
      const innerW = (frame.stampWidth - margin * 2) * multiplier;
      const innerH = (frame.stampHeight - margin * 2) * multiplier;
      ctx.strokeStyle = category.innerStroke;
      ctx.lineWidth = 0.3 * multiplier;
      ctx.setLineDash(category.innerStrokeDash.length > 0
        ? category.innerStrokeDash.map(v => v * multiplier) : []);
      ctx.strokeRect(innerX, innerY, innerW, innerH);
    });

    return { canvas: c, left: canvasLeft, top: canvasTop };
  }

  // サイズ表記・メモテキストをオフスクリーンCanvasにレンダリング（全枠まとめて）
  _renderLabels(frames, multiplier) {
    if (frames.length === 0) return null;

    // 全枠+ラベル領域を含むバウンディングボックス
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    frames.forEach(f => {
      minX = Math.min(minX, f.left);
      minY = Math.min(minY, f.top);
      maxX = Math.max(maxX, f.left + f.stampWidth);
      maxY = Math.max(maxY, f.top + f.stampHeight + 8); // ラベル+メモ分の高さ
    });

    const canvasLeft = Math.round(minX * multiplier);
    const canvasTop = Math.round(minY * multiplier);
    const w = Math.ceil((maxX - minX) * multiplier);
    const h = Math.ceil((maxY - minY) * multiplier);

    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');

    frames.forEach(frame => {
      const category = frame._category;
      const fx = (frame.left - minX) * multiplier;
      const fy = (frame.top - minY) * multiplier;
      const fw = frame.stampWidth * multiplier;
      const fh = frame.stampHeight * multiplier;

      // サイズ表記（右下外側、右揃え）
      const sizeText = `${frame.stampId} ${frame.stampWidth}\u00D7${frame.stampHeight}`;
      const sizeFontSize = Math.round(2.5 * multiplier);
      ctx.font = `500 ${sizeFontSize}px sans-serif`;
      ctx.fillStyle = category.labelColor;
      ctx.globalAlpha = 0.55;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(sizeText, fx + fw, fy + fh + 0.3 * multiplier);

      // メモ（サイズ表記の下、黒色、折り返し対応）
      const memo = frame.stampMemo || '';
      if (memo) {
        const memoFontSize = Math.round(2.2 * multiplier);
        ctx.font = `400 ${memoFontSize}px sans-serif`;
        ctx.fillStyle = '#000000';
        ctx.globalAlpha = 1.0;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const memoX = fx;
        const memoY = fy + fh + 3 * multiplier;
        const memoMaxW = Math.max(fw, 20 * multiplier);
        this._wrapText(ctx, memo, memoX, memoY, memoMaxW, memoFontSize * 1.3);
      }

      ctx.globalAlpha = 1.0;
    });

    return { canvas: c, left: canvasLeft, top: canvasTop };
  }

  // サイズ表記・メモテキストを1枠分だけレンダリング（分割用）
  _renderLabelSingle(frame, multiplier) {
    const category = frame._category;
    const fw = frame.stampWidth * multiplier;
    const fh = frame.stampHeight * multiplier;
    const labelH = 8 * multiplier; // ラベル+メモ分の高さ

    const w = Math.ceil(fw);
    const h = Math.ceil(fh + labelH);

    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');

    // サイズ表記（右下外側、右揃え）
    const sizeText = `${frame.stampId} ${frame.stampWidth}\u00D7${frame.stampHeight}`;
    const sizeFontSize = Math.round(2.5 * multiplier);
    ctx.font = `500 ${sizeFontSize}px sans-serif`;
    ctx.fillStyle = category.labelColor;
    ctx.globalAlpha = 0.55;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(sizeText, fw, fh + 0.3 * multiplier);

    // メモ（サイズ表記の下、黒色、折り返し対応）
    const memo = frame.stampMemo || '';
    if (memo) {
      const memoFontSize = Math.round(2.2 * multiplier);
      ctx.font = `400 ${memoFontSize}px sans-serif`;
      ctx.fillStyle = '#000000';
      ctx.globalAlpha = 1.0;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const memoX = 0;
      const memoY = fh + 3 * multiplier;
      const memoMaxW = Math.max(fw, 20 * multiplier);
      this._wrapText(ctx, memo, memoX, memoY, memoMaxW, memoFontSize * 1.3);
    }

    return {
      canvas: c,
      left: Math.round(frame.left * multiplier),
      top: Math.round(frame.top * multiplier),
    };
  }

  // 枠線をオフスクリーンCanvasにレンダリング（単体用）
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

  // テキスト折り返し描画（日本語対応: 1文字ずつ幅をチェック）
  _wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    let line = '';
    let currentY = y;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '\n') {
        ctx.fillText(line, x, currentY);
        line = '';
        currentY += lineHeight;
        continue;
      }
      const testLine = line + ch;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && line.length > 0) {
        ctx.fillText(line, x, currentY);
        line = ch;
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    if (line) {
      ctx.fillText(line, x, currentY);
    }
  }
}
