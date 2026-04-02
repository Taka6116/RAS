/**
 * 監修者ボックスのHTMLを単一ソースで生成。
 * プレビューとWordPress投稿で同一表示にするため、ここだけを編集する。
 * 全体1.3倍・テキストbold・株式会社日本提携支援 代表取締役は1.2倍・丸写真128px。
 */
export function getSupervisorBlockHtml(imageUrl: string): string {
  return `
<div class="nas-supervisor-box" style="max-width:780px;margin:31px auto 42px;background:#f3f4f6;border-radius:13px;padding:18px 23px;">
  <p style="font-weight:700;font-size:18px;color:#1e293b;margin:0 0 13px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;text-align:center;">監修者</p>
  <div style="display:flex;gap:16px;align-items:center;">
    <img src="${imageUrl}" alt="大野駿介" style="width:128px;height:128px;border-radius:50%;object-fit:cover;object-position:center 25%;flex-shrink:0;display:block;" />
    <div style="flex:1;min-width:0;font-size:16px;line-height:1.6;color:#374151;">
      <p style="margin:0 0 3px;font-weight:700;font-size:17px;color:#6b7280;">株式会社日本提携支援 代表取締役</p>
      <p style="margin:0 0 8px;font-weight:700;font-size:18px;color:#111827;">大野 駿介</p>
      <p style="margin:0 0 3px;font-weight:700;font-size:14px;color:#4b5563;white-space:nowrap;">過去1,000件超のM&amp;A相談、50件超のアドバイザリー契約、15組超のM&amp;A成約組数を担当。</p>
      <p style="margin:0 0 3px;font-weight:700;font-size:14px;color:#4b5563;white-space:nowrap;">(株)日本M&amp;Aセンターにて、年間最多アドバイザリー契約受賞経験あり。</p>
      <p style="margin:0;font-weight:700;font-size:14px;color:#4b5563;white-space:nowrap;">新規提携先の開拓やマネジメント経験を経て、(株)日本提携支援を設立。</p>
    </div>
  </div>
</div>
`.trim();
}
