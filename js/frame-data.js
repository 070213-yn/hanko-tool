// スタンプ枠サイズ・色データ定義
// すべてのサイズはmm単位

const FRAME_DATA = {
  // メーカー定義
  makers: {
    karafuruya: {
      name: 'からふるや',
      categories: [
        {
          name: '天然木（メープル）',
          outerStroke: '#000000',       // 黒実線
          outerStrokeDash: [],          // 実線
          innerStroke: '#FF0000',       // 赤破線
          innerStrokeDash: [2, 2],      // 破線パターン
          margin: 2,                     // 外枠と内枠の差（片側mm）
          labelColor: '#000000',
          stamps: [
            { id: 'A1', width: 26, height: 30 },
            { id: 'A2', width: 26, height: 55 },
            { id: 'A3', width: 26, height: 65 },
            { id: 'A4', width: 26, height: 85 },
            { id: 'A5', width: 26, height: 20 },
            { id: 'B',  width: 30, height: 40 },
            { id: 'C',  width: 40, height: 48 },
            { id: 'D',  width: 30, height: 48 },
            { id: 'E',  width: 43, height: 55 },
            { id: 'F',  width: 65, height: 40 },
            { id: 'G',  width: 55, height: 90 },
            { id: 'H',  width: 55, height: 55 },
            { id: 'I',  width: 60, height: 60 },
            { id: 'L',  width: 73, height: 73 },
            { id: 'J',  width: 15, height: 60 },
            { id: 'K',  width: 15, height: 40 },
            { id: 'S9', width: 27, height: 7 },
            { id: 'R',  width: 30, height: 30 },
            { id: 'S',  width: 20, height: 20 },
          ]
        },
        {
          name: 'MDF',
          outerStroke: '#008000',       // 緑実線
          outerStrokeDash: [],          // 実線
          innerStroke: '#FF0000',       // 赤破線
          innerStrokeDash: [2, 2],      // 破線パターン
          margin: 1,                     // 外枠と内枠の差（片側mm）
          labelColor: '#008000',
          stamps: [
            { id: 'X', width: 12, height: 27 },
            { id: 'Y', width: 10, height: 10 },
            { id: 'Z', width: 15, height: 15 },
          ]
        }
      ]
    },
    yamada: {
      name: 'ヤマダ',
      categories: [
        {
          name: 'スタンダード',
          outerStroke: '#000000',       // 黒破線
          outerStrokeDash: [3, 3],      // 破線パターン
          innerStroke: '#FF0000',       // 赤破線
          innerStrokeDash: [2, 2],      // 破線パターン
          margin: 1,                     // 外枠と内枠の差（片側mm）
          labelColor: '#000000',
          stamps: [
            { id: 'YM1',  width: 12, height: 12 },
            { id: 'YM2',  width: 20, height: 20 },
            { id: 'YM3',  width: 40, height: 12 },
            { id: 'YM4',  width: 25, height: 25 },
            { id: 'YM5',  width: 30, height: 20 },
            { id: 'YM6',  width: 40, height: 20 },
            { id: 'YM7',  width: 30, height: 25 },
            { id: 'YM8',  width: 30, height: 30 },
            { id: 'YM9',  width: 50, height: 20 },
            { id: 'YM10', width: 58, height: 15 },
            { id: 'YM11', width: 40, height: 30 },
            { id: 'YM12', width: 40, height: 40 },
            { id: 'YM13', width: 50, height: 30 },
            { id: 'YM14', width: 58, height: 25 },
            { id: 'YM15', width: 60, height: 30 },
            { id: 'YM16', width: 55, height: 40 },
            { id: 'YM17', width: 58, height: 58 },
          ]
        }
      ]
    }
  },

  // A4サイズ（mm）
  A4_WIDTH: 210,
  A4_HEIGHT: 297,

  // エクスポート設定
  EXPORT_DPI: 1200,
  // 1200DPI時の A4 ピクセルサイズ
  get EXPORT_WIDTH_PX() { return Math.round(this.A4_WIDTH / 25.4 * this.EXPORT_DPI); },  // 9921
  get EXPORT_HEIGHT_PX() { return Math.round(this.A4_HEIGHT / 25.4 * this.EXPORT_DPI); }, // 14031
};
