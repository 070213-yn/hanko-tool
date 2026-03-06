// 大津の方法による画像二値化

(function () {
  'use strict';

  let originalImageData = null;
  let originalCanvas = null;
  let previewCanvas = null;
  let currentThreshold = 128;

  document.addEventListener('DOMContentLoaded', () => {
    originalCanvas = document.getElementById('original-canvas');
    previewCanvas = document.getElementById('preview-canvas');
    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');
    const slider = document.getElementById('threshold-slider');
    const thresholdLabel = document.getElementById('threshold-value');
    const btnAutoThreshold = document.getElementById('btn-auto-threshold');
    const btnDownload = document.getElementById('btn-download');

    // ファイル選択
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        _loadImage(e.target.files[0]);
      }
    });

    // ドラッグ&ドロップ
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) {
        _loadImage(e.dataTransfer.files[0]);
      }
    });
    dropZone.addEventListener('click', () => fileInput.click());

    // しきい値スライダー
    slider.addEventListener('input', () => {
      currentThreshold = parseInt(slider.value);
      thresholdLabel.textContent = currentThreshold;
      _applyBinarize(currentThreshold);
    });

    // 自動しきい値
    btnAutoThreshold.addEventListener('click', () => {
      if (!originalImageData) return;
      currentThreshold = _otsuThreshold(originalImageData);
      slider.value = currentThreshold;
      thresholdLabel.textContent = currentThreshold;
      _applyBinarize(currentThreshold);
    });

    // ダウンロード
    btnDownload.addEventListener('click', () => {
      if (!previewCanvas) return;
      const dataURL = previewCanvas.toDataURL('image/png');
      const link = document.createElement('a');
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      link.download = `二値化_${y}_${m}_${d}.png`;
      link.href = dataURL;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  });

  // 画像読み込み
  function _loadImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // 元画像をキャンバスに描画
        originalCanvas.width = img.width;
        originalCanvas.height = img.height;
        const ctx = originalCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        originalImageData = ctx.getImageData(0, 0, img.width, img.height);

        // プレビューキャンバスも同サイズ
        previewCanvas.width = img.width;
        previewCanvas.height = img.height;

        // ドロップゾーンを非表示、プレビューエリアを表示
        document.getElementById('drop-zone').style.display = 'none';
        document.getElementById('preview-area').style.display = 'flex';
        document.getElementById('controls').style.display = 'flex';

        // 自動しきい値で初期表示
        currentThreshold = _otsuThreshold(originalImageData);
        document.getElementById('threshold-slider').value = currentThreshold;
        document.getElementById('threshold-value').textContent = currentThreshold;
        _applyBinarize(currentThreshold);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // 大津の方法でしきい値を計算
  function _otsuThreshold(imageData) {
    const data = imageData.data;
    const histogram = new Array(256).fill(0);
    const total = imageData.width * imageData.height;

    // グレースケール化してヒストグラム作成
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      histogram[gray]++;
    }

    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * histogram[i];

    let sumB = 0;
    let wB = 0;
    let maxVariance = 0;
    let threshold = 0;

    for (let t = 0; t < 256; t++) {
      wB += histogram[t];
      if (wB === 0) continue;

      const wF = total - wB;
      if (wF === 0) break;

      sumB += t * histogram[t];

      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;

      const variance = wB * wF * (mB - mF) * (mB - mF);

      if (variance > maxVariance) {
        maxVariance = variance;
        threshold = t;
      }
    }

    return threshold;
  }

  // 二値化を適用（白→透明）
  function _applyBinarize(threshold) {
    if (!originalImageData) return;

    const src = originalImageData.data;
    const ctx = previewCanvas.getContext('2d');
    const output = ctx.createImageData(originalImageData.width, originalImageData.height);
    const dst = output.data;

    for (let i = 0; i < src.length; i += 4) {
      const gray = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];

      if (gray >= threshold) {
        // 白→透明
        dst[i] = 0;
        dst[i + 1] = 0;
        dst[i + 2] = 0;
        dst[i + 3] = 0;
      } else {
        // 黒
        dst[i] = 0;
        dst[i + 1] = 0;
        dst[i + 2] = 0;
        dst[i + 3] = 255;
      }
    }

    ctx.putImageData(output, 0, 0);
  }

})();
