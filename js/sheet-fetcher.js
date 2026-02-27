// Googleスプレッドシートからスタンプ枠データを取得・パースする
// シートごとにメーカーを分離（シート名 = メーカー名）

class SheetFetcher {
  constructor(sheetId) {
    this.sheetId = sheetId;
  }

  // 全メーカーのデータを取得
  // sheetMakers: [{ key: 'karafuruya', sheetName: 'からふる屋' }, ...]
  // 戻り値: { 'karafuruya': [{ id, width, height }, ...], 'yamada': [...] }
  async fetchAll(sheetMakers) {
    const results = {};

    // 全シートを並列取得
    const promises = sheetMakers.map(async (maker) => {
      try {
        const url = `https://docs.google.com/spreadsheets/d/${this.sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(maker.sheetName)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const csv = await res.text();
        results[maker.key] = this._parseCSV(csv);
      } catch (e) {
        console.warn(`シート「${maker.sheetName}」の取得失敗:`, e);
        results[maker.key] = [];
      }
    });

    await Promise.all(promises);
    return results;
  }

  // CSVをパースして行配列に変換
  // 列: ID, 横mm, 縦mm
  // 戻り値: [{ id, width, height }, ...]
  _parseCSV(csv) {
    const lines = csv.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = this._splitCSVLine(lines[i]);
      if (cols.length < 3) continue;

      const id = cols[0].trim();
      const width = parseInt(cols[1], 10);
      const height = parseInt(cols[2], 10);

      if (!id || !width || !height) continue;
      if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) continue;

      rows.push({ id, width, height });
    }
    return rows;
  }

  // CSV1行をカラム配列に分割（ダブルクォート対応）
  _splitCSVLine(line) {
    const cols = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          cols.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
    }
    cols.push(current);
    return cols;
  }
}
