// 1200DPI PNGエクスポート・SVGエクスポート

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
      // iOS Safari: 約1677万ピクセル（4096x4096）
      return 16777216;
    }
    // デスクトップ: 大きなサイズが可能
    return 268435456; // 16384x16384
  }

  // エクスポート倍率を計算
  _getExportMultiplier() {
    const targetW = FRAME_DATA.EXPORT_WIDTH_PX;
    const targetH = FRAME_DATA.EXPORT_HEIGHT_PX;
    const targetPixels = targetW * targetH;
    const maxPixels = this._getMaxCanvasPixels();

    if (targetPixels <= maxPixels) {
      // 1200DPIそのまま
      return targetW / FRAME_DATA.A4_WIDTH;
    }

    // 収まるように縮小
    const scale = Math.sqrt(maxPixels / targetPixels);
    const adjustedW = Math.floor(targetW * scale);
    return adjustedW / FRAME_DATA.A4_WIDTH;
  }

  // ファイル名生成
  _getFileName(ext) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `Hankodori_入稿データ_${y}_${m}_${d}.${ext}`;
  }

  // PNG エクスポート
  async exportPNG() {
    const canvas = this.cm.getCanvas();
    const multiplier = this._getExportMultiplier();

    // 実際の出力サイズを計算
    const outputW = Math.round(FRAME_DATA.A4_WIDTH * multiplier);
    const outputH = Math.round(FRAME_DATA.A4_HEIGHT * multiplier);
    const actualDPI = Math.round(outputW / FRAME_DATA.A4_WIDTH * 25.4);

    // ローディング表示
    this._showLoading(`PNG書出し中... (${outputW}x${outputH}px, ${actualDPI}DPI)`);

    // 少し待ってUI更新を反映
    await this._sleep(100);

    try {
      // グリッドを一時非表示
      const gridWasVisible = this.cm.gridVisible;
      if (gridWasVisible) {
        this.cm.gridLines.forEach(l => l.set({ visible: false }));
      }

      // ビューポートを一時的にリセットしてエクスポート
      const origVpt = canvas.viewportTransform.slice();
      canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
      canvas.renderAll();

      const dataURL = canvas.toDataURL({
        format: 'png',
        multiplier: multiplier,
        left: 0,
        top: 0,
        width: FRAME_DATA.A4_WIDTH,
        height: FRAME_DATA.A4_HEIGHT,
      });

      // ビューポートを復元
      canvas.viewportTransform = origVpt;

      // グリッドを復元
      if (gridWasVisible) {
        this.cm.gridLines.forEach(l => l.set({ visible: true }));
        canvas.requestRenderAll();
      }

      // ダウンロード
      this._downloadDataURL(dataURL, this._getFileName('png'));

      if (actualDPI < FRAME_DATA.EXPORT_DPI) {
        alert(`デバイスの制限により、${actualDPI}DPIで出力しました（推奨: ${FRAME_DATA.EXPORT_DPI}DPI）。\nPC版のChromeで開くと1200DPIで出力できます。`);
      }
    } catch (e) {
      console.error('PNGエクスポートエラー:', e);
      alert('PNGエクスポートに失敗しました。SVGエクスポートをお試しください。');
    } finally {
      this._hideLoading();
    }
  }

  // SVG エクスポート
  exportSVG() {
    const canvas = this.cm.getCanvas();

    // グリッドを一時非表示
    const gridWasVisible = this.cm.gridVisible;
    if (gridWasVisible) {
      this.cm.gridLines.forEach(l => l.set({ visible: false }));
    }

    // ビューポートを一時的にリセット
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

    // ビューポートを復元
    canvas.viewportTransform = origVpt;

    // グリッドを復元
    if (gridWasVisible) {
      this.cm.gridLines.forEach(l => l.set({ visible: true }));
      canvas.requestRenderAll();
    }

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
}
