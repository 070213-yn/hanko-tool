// スタンプ枠サイズ・色データ定義
// すべてのサイズはmm単位

const FRAME_DATA = {
  // メーカー定義（カテゴリなし: 1メーカー = 1スタイル + スタンプ配列）
  makers: {
    karafuruya: {
      name: 'からふる屋',
      categories: [
        {
          name: 'からふる屋',
          outerStroke: '#000000',
          outerStrokeDash: [],
          innerStroke: '#FF0000',
          innerStrokeDash: [2, 2],
          margin: 2,
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
            { id: 'X',  width: 12, height: 27 },
            { id: 'Y',  width: 10, height: 10 },
            { id: 'Z',  width: 15, height: 15 },
          ]
        }
      ]
    },
    yamada: {
      name: 'ヤマダ',
      categories: [
        {
          name: 'ヤマダ',
          outerStroke: '#000000',
          outerStrokeDash: [],
          innerStroke: '#FF0000',
          innerStrokeDash: [2, 2],
          margin: 1,
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
  get EXPORT_WIDTH_PX() { return Math.round(this.A4_WIDTH / 25.4 * this.EXPORT_DPI); },
  get EXPORT_HEIGHT_PX() { return Math.round(this.A4_HEIGHT / 25.4 * this.EXPORT_DPI); },

  // Googleスプレッドシート連携用
  sheetId: '1K6aqI79ZdEvCp0CMpi9eUzlxUl3ub5eWGThDadRaQj0',

  // Google Apps Script Web App URL（クラウド保存用）
  // Apps Scriptをデプロイ後にURLを設定する
  appsScriptUrl: 'https://script.google.com/macros/s/AKfycbx9SryIIe91npq91IgHkf3p8wDUgKl8vPPBimvkbSCXGqclH_MAJ_7A5jfbv6QAr5I/exec',

  // シート名 → メーカーキーのマッピング
  // シート名（タブ名）がメーカー名に対応する
  sheetMakers: [
    { key: 'karafuruya', sheetName: 'からふる屋' },
    { key: 'yamada', sheetName: 'ヤマダ' },
  ],

  // メーカーごとの枠線スタイル定義（スプレッドシートには載せない設定値）
  makerStyles: {
    'からふる屋': {
      outerStroke: '#000000', outerStrokeDash: [],
      innerStroke: '#FF0000', innerStrokeDash: [2, 2],
      margin: 2, labelColor: '#000000',
    },
    'ヤマダ': {
      outerStroke: '#000000', outerStrokeDash: [],
      innerStroke: '#FF0000', innerStrokeDash: [2, 2],
      margin: 1, labelColor: '#000000',
    },
    '_default': {
      outerStroke: '#333333', outerStrokeDash: [],
      innerStroke: '#FF0000', innerStrokeDash: [2, 2],
      margin: 2, labelColor: '#333333',
    },
  },

  // スプレッドシートのデータからmakersを再構築する
  // sheetData: { 'メーカーキー': [{ id, width, height }, ...], ... }
  buildFromSheet(sheetData) {
    const newMakers = {};

    for (const [makerKey, stamps] of Object.entries(sheetData)) {
      if (stamps.length === 0) continue;

      // sheetMakersからメーカー名を取得
      const config = this.sheetMakers.find(m => m.key === makerKey);
      const makerName = config ? config.sheetName : makerKey;

      // スタイルを取得
      const style = this.makerStyles[makerName] || this.makerStyles['_default'];

      newMakers[makerKey] = {
        name: makerName,
        categories: [{
          name: makerName,
          outerStroke: style.outerStroke,
          outerStrokeDash: [...style.outerStrokeDash],
          innerStroke: style.innerStroke,
          innerStrokeDash: [...style.innerStrokeDash],
          margin: style.margin,
          labelColor: style.labelColor,
          stamps: stamps,
        }]
      };
    }

    this.makers = newMakers;
  },
};
