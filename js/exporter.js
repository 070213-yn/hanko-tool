// PSD(600DPI) / PNG(1200DPI) / SVG エクスポート

class Exporter {
  constructor(canvasManager) {
    this.cm = canvasManager;
    this.psdHandler = null; // app.jsで設定
  }

  // === PSD エクスポート (600DPI) ===

  async exportPSD(frameFactory, title) {
    if (!this.psdHandler) {
      alert('PSDハンドラが初期化されていません。');
      return;
    }

    this._showLoading('PSD書出し中... (600DPI)');
    await this._sleep(100);

    try {
      await this.psdHandler.exportPSD(frameFactory, title);
    } catch (e) {
      console.error('PSDエクスポートエラー:', e);
      alert('PSDエクスポートに失敗しました。\n' + e.message);
    } finally {
      this._hideLoading();
    }
  }

  // === PNG エクスポート (1200DPI) ===

  _isIOSDevice() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  _getMaxCanvasPixels() {
    if (this._isIOSDevice()) return 16777216;
    return 268435456;
  }

  _getExportMultiplier() {
    const targetW = FRAME_DATA.PNG_WIDTH_PX;
    const targetH = FRAME_DATA.PNG_HEIGHT_PX;
    const targetPixels = targetW * targetH;
    const maxPixels = this._getMaxCanvasPixels();

    if (targetPixels <= maxPixels) {
      return targetW / FRAME_DATA.A4_WIDTH;
    }

    const scale = Math.sqrt(maxPixels / targetPixels);
    const adjustedW = Math.floor(targetW * scale);
    return adjustedW / FRAME_DATA.A4_WIDTH;
  }

  _getFileName(ext) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `Hankodori_入稿データ_${y}_${m}_${d}.${ext}`;
  }

  async exportPNG() {
    const canvas = this.cm.getCanvas();
    const multiplier = this._getExportMultiplier();

    const outputW = Math.round(FRAME_DATA.A4_WIDTH * multiplier);
    const outputH = Math.round(FRAME_DATA.A4_HEIGHT * multiplier);
    const actualDPI = Math.round(outputW / FRAME_DATA.A4_WIDTH * 25.4);

    this._showLoading(`PNG書出し中... (${outputW}x${outputH}px, ${actualDPI}DPI)`);
    await this._sleep(100);

    try {
      const gridWasVisible = this.cm.gridVisible;
      if (gridWasVisible) {
        this.cm.gridLines.forEach(l => l.set({ visible: false }));
      }

      const origVpt = canvas.viewportTransform.slice();
      canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
      canvas.renderAll();

      const dataURL = canvas.toDataURL({
        format: 'png',
        multiplier: multiplier,
        left: 0, top: 0,
        width: FRAME_DATA.A4_WIDTH,
        height: FRAME_DATA.A4_HEIGHT,
      });

      canvas.viewportTransform = origVpt;

      if (gridWasVisible) {
        this.cm.gridLines.forEach(l => l.set({ visible: true }));
        canvas.requestRenderAll();
      }

      this._downloadDataURL(dataURL, this._getFileName('png'));

      if (actualDPI < FRAME_DATA.EXPORT_DPI_PNG) {
        alert(`デバイスの制限により、${actualDPI}DPIで出力しました。\nPC版Chromeなら1200DPIで出力できます。`);
      }
    } catch (e) {
      console.error('PNGエクスポートエラー:', e);
      alert('PNGエクスポートに失敗しました。SVGエクスポートをお試しください。');
    } finally {
      this._hideLoading();
    }
  }

  // === SVG エクスポート ===

  exportSVG() {
    const canvas = this.cm.getCanvas();

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
        x: 0, y: 0,
        width: FRAME_DATA.A4_WIDTH,
        height: FRAME_DATA.A4_HEIGHT,
      },
    });

    canvas.viewportTransform = origVpt;

    if (gridWasVisible) {
      this.cm.gridLines.forEach(l => l.set({ visible: true }));
      canvas.requestRenderAll();
    }

    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    this._downloadURL(url, this._getFileName('svg'));
    URL.revokeObjectURL(url);
  }

  // === ユーティリティ ===

  _downloadDataURL(dataURL, filename) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

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
