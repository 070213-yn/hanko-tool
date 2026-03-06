// PSD読み込み・書き出し（ag-psd使用）

class PsdHandler {
  constructor(canvasManager) {
    this.cm = canvasManager;
    this.importedLayers = []; // { name, canvas, offsetX, offsetY, width, height }
  }

  // === PSD読み込み ===

  // ag-psdが使えるかチェック
  _checkAgPsd() {
    if (typeof agPsd === 'undefined' || !agPsd.readPsd) {
      alert('PSDライブラリの読み込みに失敗しました。\nページを再読み込みしてください。');
      return false;
    }
    return true;
  }

  // PSDファイルを読み込んでレイヤーを抽出・トリミング
  async importPSD(file) {
    if (!this._checkAgPsd()) return [];
    const buffer = await file.arrayBuffer();
    const psd = agPsd.readPsd(buffer, { skipThumbnail: true });
    this.importedLayers = [];

    if (!psd.children || psd.children.length === 0) {
      alert('レイヤーが見つかりませんでした。');
      return [];
    }

    for (const layer of psd.children) {
      if (!layer.canvas || layer.hidden) continue;

      // iPadアプリ対応: レイヤーの描画部分だけをトリミング
      const trimmed = this._trimLayerCanvas(layer.canvas);
      if (!trimmed) continue; // 完全に透明なレイヤーはスキップ

      this.importedLayers.push({
        name: layer.name || '名称なし',
        canvas: trimmed.canvas,
        offsetX: (layer.left || 0) + trimmed.offsetX,
        offsetY: (layer.top || 0) + trimmed.offsetY,
        width: trimmed.width,
        height: trimmed.height,
      });
    }

    return this.importedLayers;
  }

  // レイヤーキャンバスの描画部分だけをトリミング
  // iPadアプリではレイヤーがキャンバス全体サイズになっていることがあるため必須
  _trimLayerCanvas(srcCanvas) {
    const w = srcCanvas.width;
    const h = srcCanvas.height;
    if (w === 0 || h === 0) return null;

    const ctx = srcCanvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, w, h);
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

    const trimmed = document.createElement('canvas');
    trimmed.width = trimW;
    trimmed.height = trimH;
    trimmed.getContext('2d').drawImage(srcCanvas, minX, minY, trimW, trimH, 0, 0, trimW, trimH);

    return {
      canvas: trimmed,
      offsetX: minX,
      offsetY: minY,
      width: trimW,
      height: trimH,
    };
  }

  // レイヤーのサムネイルを生成（サイドバー表示用）
  createThumbnail(layerCanvas, maxSize = 60) {
    const scale = Math.min(maxSize / layerCanvas.width, maxSize / layerCanvas.height, 1);
    const thumb = document.createElement('canvas');
    thumb.width = Math.round(layerCanvas.width * scale);
    thumb.height = Math.round(layerCanvas.height * scale);
    const ctx = thumb.getContext('2d');

    // 市松模様の背景（透明部分の可視化）
    const tileSize = 4;
    for (let y = 0; y < thumb.height; y += tileSize) {
      for (let x = 0; x < thumb.width; x += tileSize) {
        ctx.fillStyle = ((x / tileSize + y / tileSize) % 2 === 0) ? '#ffffff' : '#e0e0e0';
        ctx.fillRect(x, y, tileSize, tileSize);
      }
    }

    ctx.drawImage(layerCanvas, 0, 0, thumb.width, thumb.height);
    return thumb.toDataURL();
  }

  // === PSD書き出し ===

  // PSDを600DPIで書き出し。サイズ超過時は分割
  async exportPSD(frameFactory, title) {
    if (!this._checkAgPsd()) return;
    const dpi = FRAME_DATA.EXPORT_DPI_PSD;
    const fullW = FRAME_DATA.PSD_WIDTH_PX;
    const fullH = FRAME_DATA.PSD_HEIGHT_PX;
    const scale = dpi / 25.4; // 1mmあたりのピクセル数

    // デバイスの最大キャンバスサイズを推定
    const maxPixels = this._getMaxCanvasPixels();
    const totalPixels = fullW * fullH;

    // 分割数を決定
    let splitCount = 1;
    if (totalPixels > maxPixels) {
      splitCount = Math.ceil(totalPixels / maxPixels) + 1; // 余裕を持たせる
    }

    // 分割なしでまず試行、失敗したら分割
    try {
      if (splitCount === 1) {
        const psdBuffer = this._renderPSD(frameFactory, title, dpi, 0, fullH, fullW, fullH, scale);
        this._downloadBuffer(psdBuffer, this._getFileName(1, 1));
        return;
      }
    } catch (e) {
      console.warn('フルサイズPSD失敗、分割モードに切り替え:', e);
      splitCount = 3;
    }

    // 分割書き出し
    const sectionH = Math.ceil(fullH / splitCount);
    for (let i = 0; i < splitCount; i++) {
      const startY = i * sectionH;
      const endY = Math.min(startY + sectionH, fullH);
      const partH = endY - startY;

      try {
        const psdBuffer = this._renderPSD(
          frameFactory, title, dpi,
          startY, endY, fullW, partH, scale,
          i + 1, splitCount
        );
        this._downloadBuffer(psdBuffer, this._getFileName(i + 1, splitCount));
      } catch (e) {
        console.error(`分割${i + 1}/${splitCount}の書き出しに失敗:`, e);
        alert(`分割${i + 1}/${splitCount}の書き出しに失敗しました。`);
      }
    }
  }

  // PSDデータを生成
  _renderPSD(frameFactory, title, dpi, startYPx, endYPx, widthPx, heightPx, scale, partNum, totalParts) {
    const startYMm = startYPx / scale;
    const endYMm = endYPx / scale;

    // 背景レイヤー（白）
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = widthPx;
    bgCanvas.height = heightPx;
    const bgCtx = bgCanvas.getContext('2d');
    bgCtx.fillStyle = '#FFFFFF';
    bgCtx.fillRect(0, 0, widthPx, heightPx);

    // 枠情報レイヤー（枠線 + メモ + タイトル）
    const frameInfoCanvas = document.createElement('canvas');
    frameInfoCanvas.width = widthPx;
    frameInfoCanvas.height = heightPx;
    const fiCtx = frameInfoCanvas.getContext('2d');

    // タイトル描画
    if (title) {
      fiCtx.font = `bold ${Math.round(5 * scale)}px sans-serif`;
      fiCtx.fillStyle = '#000000';
      const titleY = Math.max(0, 4 * scale - startYPx);
      if (titleY > 0 && titleY < heightPx) {
        fiCtx.fillText(title, 5 * scale, titleY);
      }
    }

    // 枠の描画
    const frames = this.cm.getStampFrames();
    const imageChildren = []; // 画像レイヤー用

    frames.forEach(frame => {
      const fLeft = frame.left;
      const fTop = frame.top;
      const fW = frame.stampWidth;
      const fH = frame.stampHeight;

      // この分割範囲に含まれるかチェック
      const fTopPx = fTop * scale;
      const fBottomPx = (fTop + fH) * scale;
      if (fBottomPx < startYPx || fTopPx > endYPx) return;

      const margin = frame.stampMargin || 1;
      const drawX = fLeft * scale;
      const drawY = fTop * scale - startYPx;

      // 外枠
      fiCtx.strokeStyle = frame.outerStrokeColor || '#000000';
      fiCtx.lineWidth = Math.max(1, 0.4 * scale);
      if (frame.outerStrokeDashPx && frame.outerStrokeDashPx.length > 0) {
        fiCtx.setLineDash(frame.outerStrokeDashPx.map(d => d * scale));
      } else {
        fiCtx.setLineDash([]);
      }
      fiCtx.strokeRect(drawX, drawY, fW * scale, fH * scale);

      // 内枠
      fiCtx.strokeStyle = frame.innerStrokeColor || '#FF0000';
      fiCtx.lineWidth = Math.max(1, 0.3 * scale);
      fiCtx.setLineDash([2 * scale, 2 * scale]);
      fiCtx.strokeRect(
        drawX + margin * scale,
        drawY + margin * scale,
        (fW - margin * 2) * scale,
        (fH - margin * 2) * scale
      );
      fiCtx.setLineDash([]);

      // ラベル（枠ID）
      const labelSize = Math.max(3, Math.min(8, Math.min(fW, fH) * 0.3));
      fiCtx.font = `bold ${Math.round(labelSize * scale)}px sans-serif`;
      fiCtx.fillStyle = 'rgba(0,0,0,0.3)';
      fiCtx.textAlign = 'center';
      fiCtx.textBaseline = 'middle';
      fiCtx.fillText(frame.stampId, drawX + fW * scale / 2, drawY + fH * scale / 2);
      fiCtx.textAlign = 'start';
      fiCtx.textBaseline = 'alphabetic';

      // メモテキスト
      const memo = frame.memoText || '';
      if (memo) {
        fiCtx.font = `${Math.round(2.5 * scale)}px sans-serif`;
        fiCtx.fillStyle = '#333333';
        fiCtx.fillText(memo, drawX, drawY + fH * scale + 3.5 * scale);
      }

      // 画像レイヤー
      if (frame.placedImage) {
        const innerX = drawX + margin * scale;
        const innerY = drawY + margin * scale;
        const innerW = (fW - margin * 2) * scale;
        const innerH = (fH - margin * 2) * scale;

        const imgCanvas = document.createElement('canvas');
        imgCanvas.width = widthPx;
        imgCanvas.height = heightPx;
        const imgCtx = imgCanvas.getContext('2d');
        imgCtx.drawImage(frame.placedImage, innerX, innerY, innerW, innerH);

        imageChildren.push({
          name: `${frame.stampId}_画像`,
          canvas: imgCanvas,
          left: 0,
          top: 0,
          right: widthPx,
          bottom: heightPx,
        });
      }
    });

    // PSDデータ構築
    let titleStr = 'はんこどり入稿データ';
    if (totalParts && totalParts > 1) {
      titleStr += ` ${partNum}データ目/${totalParts}データ中`;
    }

    const psd = {
      width: widthPx,
      height: heightPx,
      children: [
        {
          name: '背景',
          canvas: bgCanvas,
          left: 0,
          top: 0,
          right: widthPx,
          bottom: heightPx,
        },
        {
          name: '枠情報・メモ・タイトル',
          canvas: frameInfoCanvas,
          left: 0,
          top: 0,
          right: widthPx,
          bottom: heightPx,
        },
        ...imageChildren,
      ],
    };

    return agPsd.writePsd(psd);
  }

  // デバイスの最大キャンバスピクセル数を推定
  _getMaxCanvasPixels() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) return 16777216; // 約1677万px
    return 268435456; // デスクトップ
  }

  // ファイル名生成
  _getFileName(partNum, totalParts) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    let name = `Hankodori_入稿データ_${y}_${m}_${d}`;
    if (totalParts > 1) {
      name += `_${String(partNum).padStart(3, '0')}`;
    }
    return name + '.psd';
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
}
