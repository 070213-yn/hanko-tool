// Google Apps Script - はんこどりクラウド保存
// このコードをスプレッドシートの Apps Script エディタに貼り付けてください

const SHEET_NAME = '保存データ';
const CHUNK_SIZE = 40000;

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['ID', 'タイトル', '保存日時', 'データ']);
  }
  return sheet;
}

function doGet(e) {
  const action = e.parameter.action;
  const sheet = getOrCreateSheet();

  if (action === 'list') {
    const data = sheet.getDataRange().getValues();
    const projects = [];
    for (let i = 1; i < data.length; i++) {
      if (!data[i][0]) continue;
      projects.push({
        id: String(data[i][0]),
        title: data[i][1] || '',
        timestamp: data[i][2] || '',
      });
    }
    // 新しい順にソート
    projects.sort((a, b) => {
      if (a.timestamp > b.timestamp) return -1;
      if (a.timestamp < b.timestamp) return 1;
      return 0;
    });
    return jsonResponse({ projects: projects });
  }

  if (action === 'get' && e.parameter.id) {
    const id = String(e.parameter.id);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === id) {
        let json = '';
        for (let c = 3; c < data[i].length; c++) {
          if (data[i][c]) json += String(data[i][c]);
        }
        try {
          const parsed = JSON.parse(json);
          return jsonResponse({
            project: {
              id: String(data[i][0]),
              title: data[i][1] || '',
              timestamp: data[i][2] || '',
              data: parsed,
            }
          });
        } catch (err) {
          return jsonResponse({ error: 'データの解析に失敗: ' + err.message });
        }
      }
    }
    return jsonResponse({ error: 'not found' });
  }

  return jsonResponse({ error: 'invalid action' });
}

function doPost(e) {
  const sheet = getOrCreateSheet();
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ error: 'リクエストの解析に失敗' });
  }

  const action = payload.action;

  if (action === 'save') {
    const dataJson = JSON.stringify(payload.data);
    const chunks = [];
    for (let i = 0; i < dataJson.length; i += CHUNK_SIZE) {
      chunks.push(dataJson.substring(i, i + CHUNK_SIZE));
    }

    const id = payload.id || String(Date.now());
    const title = payload.title || '入稿データ';
    const timestamp = new Date().toISOString();

    // 既存行を探す
    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        rowIndex = i + 1;
        break;
      }
    }

    const row = [id, title, timestamp, ...chunks];

    if (rowIndex > 0) {
      const lastCol = sheet.getLastColumn();
      if (lastCol > 0) {
        sheet.getRange(rowIndex, 1, 1, lastCol).clearContent();
      }
      sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }

    return jsonResponse({ success: true, id: id });
  }

  if (action === 'delete') {
    const id = String(payload.id);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === id) {
        sheet.deleteRow(i + 1);
        return jsonResponse({ success: true });
      }
    }
    return jsonResponse({ error: 'not found' });
  }

  return jsonResponse({ error: 'invalid action' });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
