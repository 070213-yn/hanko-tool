// Google Apps Script Web Appを使ったクラウド保存/読込
// クロスオリジンPOSTはCORS制限があるため、no-corsモードを使用

class CloudStorage {
  constructor(scriptUrl) {
    this.scriptUrl = scriptUrl;
  }

  // 全プロジェクト一覧を取得（データ本体は含まない）
  async getAll() {
    const url = `${this.scriptUrl}?action=list`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('サーバーエラー: ' + res.status);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json.projects || [];
  }

  // 1件取得（データ本体を含む）
  async get(id) {
    const url = `${this.scriptUrl}?action=get&id=${encodeURIComponent(id)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('サーバーエラー: ' + res.status);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json.project || null;
  }

  // 保存（新規 or 上書き）
  // Google Apps ScriptへのクロスオリジンPOSTはCORS制限により通常モードでは
  // 失敗するため、no-corsモードを使用。リクエストは送信されdoPost()で
  // 処理されるが、レスポンスは読み取れない（opaque response）。
  // IDはクライアント側で生成し、レスポンスに依存しない。
  async save(project) {
    const id = project.id || String(Date.now());

    await fetch(this.scriptUrl, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify({
        action: 'save',
        id: id,
        title: project.title,
        data: project.data,
      }),
    });

    return id;
  }

  // 削除
  async delete(id) {
    await fetch(this.scriptUrl, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify({
        action: 'delete',
        id: id,
      }),
    });
    return true;
  }
}
