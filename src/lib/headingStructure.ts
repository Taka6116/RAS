/**
 * AI生成本文の見出し構造を正規化する。
 *
 * AIには章見出しを「## 」、小見出しを「### 」のマーカー付きで出力させ、
 * ここで番号（章=「1. 」、小見出し=「1-1. 」）を自動付与して
 * プレーンテキストに変換する。
 *
 * 番号をシステム側で採番することで、「1-1 がないのに 2-1 から始まる」
 * といった番号の不整合を構造的に防ぐ。
 * まとめ・FAQ・結論要約などの定型セクションは番号を付けない。
 */

/** 番号を付けない h2 セクション（まとめ・FAQ系） */
const NO_NUMBER_H2_PATTERNS: RegExp[] = [
  /^まとめ/,
  /^よくある質問/,
  /^FAQ\b/i,
  /^Q\s*&\s*A/i,
  /^結論要約/,
  /^おわりに/,
  /^さいごに/,
  /^最後に/,
]

/** 見出しテキスト先頭のAIが付けた番号（1. / 1-1. / 1-1-1. 等）を除去する */
function stripLeadingNumber(text: string): string {
  return text.replace(/^\d+(?:[-−.．]\d+)*[．.。\-:：]?\s*/, '').trim()
}

/**
 * マーカー付き本文（## / ###）を番号付きプレーンテキストへ変換する。
 * - 「## 見出し」→「1. 見出し」（連番自動付与、まとめ/FAQ系は番号なし）
 * - 「### 小見出し」→「1-1. 小見出し」（親の章番号に連動）
 * - 見出し行の前後には空行を挿入し、HTML変換時の検出漏れ（本文に紛れる）を防ぐ
 * - マーカーがない本文はそのまま返す（旧形式との互換）
 */
export function normalizeHeadingStructure(content: string): string {
  if (!/^#{1,4}\s*\S/m.test(content)) return content

  const lines = content.split('\n')
  const out: string[] = []
  let h2Count = 0
  let h3Count = 0

  const pushHeading = (line: string) => {
    // 見出しの前後に空行を保証する（連続空行は最後に圧縮）
    if (out.length > 0 && out[out.length - 1]!.trim() !== '') out.push('')
    out.push(line)
    out.push('')
  }

  for (const raw of lines) {
    const trimmed = raw.trim()

    // ### 以上（####等も含む）→ 小見出し
    const h3Match = trimmed.match(/^#{3,}\s*(.+)$/)
    if (h3Match) {
      const text = stripLeadingNumber(h3Match[1]!)
      if (!text) continue
      h3Count++
      const parent = Math.max(h2Count, 1)
      pushHeading(`${parent}-${h3Count}. ${text}`)
      continue
    }

    // # または ## → 章見出し
    const h2Match = trimmed.match(/^#{1,2}\s*(.+)$/)
    if (h2Match) {
      const text = stripLeadingNumber(h2Match[1]!)
      if (!text) continue
      if (NO_NUMBER_H2_PATTERNS.some(re => re.test(text))) {
        pushHeading(text)
      } else {
        h2Count++
        h3Count = 0
        pushHeading(`${h2Count}. ${text}`)
      }
      continue
    }

    out.push(raw)
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
