// Google Apps Script Web Appを使ったクラウド保存/読込

class CloudStorage {
  constructor(scriptUrl) {
    this.scriptUrl = scriptUrl;
  }

  // 全プロジェクト一覧を取得（データ本体は含まない）
  async getAll() {
    const url = `${this.scriptUrl}?action=list`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json.projects || [];
  }

  // 1件取得（データ本体を含む）
  async get(id) {
    const url = `${this.scriptUrl}?action=get&id=${encodeURIComponent(id)}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json.project || null;
  }

  // 保存（新規 or 上書き）
  async save(project) {
    const res = await fetch(this.scriptUrl, {
      method: 'POST',
      body: JSON.stringify({
        action: 'save',
        id: project.id || null,
        title: project.title,
        data: project.data,
      }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json.id;
  }

  // 削除
  async delete(id) {
    const res = await fetch(this.scriptUrl, {
      method: 'POST',
      body: JSON.stringify({
        action: 'delete',
        id: id,
      }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return true;
  }
}
