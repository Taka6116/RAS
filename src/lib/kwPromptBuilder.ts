/**
 * KWベース記事生成プロンプトの共通ビルダー。
 *
 * - KW分析ページ（Ahrefsデータあり）: データドリブンの戦略文を含むプロンプト
 * - 記事分析ページ（手薄カテゴリー起点）: Ahrefsデータの有無に応じて構成を切り替え、
 *   「カテゴリー網羅性の強化」という文脈を追加する
 */

export interface KwPromptInput {
  /** ターゲットキーワード（必須） */
  keyword: string
  /** 月間検索ボリューム（Ahrefsデータがある場合） */
  volume?: number
  /** Keyword Difficulty */
  kd?: number
  /** CPC（円） */
  cpc?: number
  /** トレンド方向 */
  trend?: 'up' | 'down' | 'stable'
  trendPercent?: number
  /** 自動検出カテゴリ（KW分析の分類） */
  detectedCategory?: string
  /** 優先度ラベル（例: ★★★即攻め） */
  priorityLabel?: string
  /** 優先度スコア */
  score?: number
  /** 手薄カテゴリー補強の文脈（記事分析ページ起点の場合のみ） */
  gap?: {
    /** WordPressのタグ/カテゴリー名 */
    tagName: string
    /** 現在の記事数 */
    articleCount: number
  }
}

const CATEGORY_INTENTS: Record<string, string> = {
  'NetSuite': '\n・Oracle NetSuiteの特徴・強み・他製品との違いを知りたい\n・NetSuite導入の費用感・期間・体制を理解したい',
  'Dynamics 365': '\n・Microsoft Dynamics 365の適用範囲・ライセンス体系を理解したい\n・既存のMicrosoft製品との連携メリットを知りたい',
  'Power Platform': '\n・Power Platform（Power Apps/Automate/BI）で何ができるかを知りたい\n・ローコード開発による業務改善の具体像を知りたい',
  'コスト・費用': '\n・ERP導入にかかる費用の相場感・ROIの考え方を知りたい\n・初期費用とランニングコストの内訳を理解したい',
  '比較・選定': '\n・複数のERP製品を比較し、自社に最適なものを選定したい\n・選定時の評価基準・落とし穴を知りたい',
  '導入・移行': '\n・既存システムからの移行手順・リスク・期間を理解したい\n・導入プロジェクトの体制・進め方を知りたい',
  '会計・財務': '\n・ERP導入による会計・財務業務の効率化・自動化の具体像を知りたい\n・月次決算の早期化・内部統制の強化方法を知りたい',
  '販売・在庫': '\n・販売管理・在庫管理のシステム化で解決できる課題を知りたい\n・受発注から在庫・出荷までの一元管理の実現方法を知りたい',
}

function buildDataStrategyBlock(input: KwPromptInput): string {
  const { volume, kd, cpc } = input
  if (volume == null || kd == null) return ''

  const volStrategy = volume > 5000
    ? '検索ボリュームが非常に大きいキーワードです。包括的かつ網羅的な内容にし、関連キーワードも幅広くカバーしてください。'
    : volume > 1000
      ? '中程度のボリュームがあります。幅広い検索意図をカバーする構成にしてください。'
      : volume > 300
        ? 'ニッチな専門性と具体性で上位を狙える領域です。深堀りした実務情報を盛り込んでください。'
        : '深い専門知識と具体的な事例で差別化してください。ロングテール戦略として有効です。'

  const kdStrategy = kd <= 10
    ? '競合がほぼ不在です。基本を丁寧に押さえれば上位表示が可能です。'
    : kd <= 30
      ? '独自視点で差別化すれば上位の勝算があります。RICE CLOUDの実績や導入事例を活用してください。'
      : kd <= 50
        ? '実体験・具体的数値での差別化が必要です。RICE CLOUDの支援事例やデータを積極的に引用してください。'
        : '高難度KWです。現場知見・独自データで差別化が必須です。RICE CLOUDならではの独自分析を前面に出してください。'

  const cpcStrategy = (cpc ?? 0) > 1000
    ? 'CPCが高く商業的意図が強いKWです。具体的なCTAを設置し、無料相談・問い合わせへ誘導してください。'
    : (cpc ?? 0) > 300
      ? '一定の商業的価値があります。サービスページや問い合わせフォームへの自然な誘導を含めてください。'
      : '情報収集段階のユーザーが多い可能性があります。信頼構築を重視し、まず価値提供に注力してください。'

  let trendNote = ''
  if (input.trend === 'up') {
    trendNote = `\n▸ トレンド注記: 検索ボリュームが上昇傾向（+${input.trendPercent}%）です。最新の市場動向・製品アップデート・統計データを積極的に取り入れてください。`
  } else if (input.trend === 'down') {
    trendNote = `\n▸ トレンド注記: 検索ボリュームが下降傾向（${input.trendPercent}%）です。「今こそ知っておくべき」等の切り口で再注目を促してください。`
  }

  const dataLines = [
    `・ターゲットキーワード: ${input.keyword}`,
    `・月間検索ボリューム: ${volume.toLocaleString()}`,
    `・KD（Keyword Difficulty）: ${kd}`,
    cpc != null ? `・CPC: ¥${Math.round(cpc).toLocaleString()}` : null,
    input.detectedCategory ? `・カテゴリ: ${input.detectedCategory}` : null,
    input.priorityLabel ? `・優先度: ${input.priorityLabel}${input.score != null ? `（スコア: ${input.score}）` : ''}` : null,
  ].filter(Boolean).join('\n')

  return `■KWデータに基づく執筆方針
${dataLines}

▸ ボリューム戦略: ${volStrategy}
▸ KD戦略: ${kdStrategy}
▸ CPC戦略: ${cpcStrategy}${trendNote}

`
}

function buildGapBlock(gap: NonNullable<KwPromptInput['gap']>): string {
  return `■カテゴリー網羅性の強化（この記事の戦略的位置づけ）
・自社サイト（RICE CLOUD公式サイト）では「${gap.tagName}」カテゴリーの記事が現在${gap.articleCount}件と手薄な状態です。
・この記事はカテゴリーの網羅性を高め、サイト全体のトピッククラスターを強化する目的で執筆します。
・「${gap.tagName}」に関連する基礎知識から実務の深い論点までカバーし、同カテゴリーの中核となる記事に仕上げてください。
・既存の他カテゴリー記事（NetSuite、導入・移行等）への内部リンクを想定した文脈のつながりを意識してください。

`
}

/** KWベース記事生成プロンプトを構築する */
export function buildKwPrompt(input: KwPromptInput): string {
  const hasData = input.volume != null && input.kd != null
  const extraIntents = input.detectedCategory ? (CATEGORY_INTENTS[input.detectedCategory] ?? '') : ''

  const dataBlock = buildDataStrategyBlock(input)
  const gapBlock = input.gap ? buildGapBlock(input.gap) : ''

  const strategyNote = !hasData
    ? `■執筆方針
・このキーワードはAhrefsの計測データが少ないニッチ領域、またはデータ未取得の領域です。
・競合記事が少ない可能性が高いため、RICE CLOUDの現場知見・具体的事例で先行者優位を確立してください。
・基礎から実務まで網羅した「このテーマの決定版」となる記事を目指してください。

`
    : ''

  return `あなたはERP/SaaS導入領域に精通したコンテンツ戦略コンサルタントです。
以下のキーワードデータに基づき、株式会社RICE CLOUD（ライスクラウド）の公式コラムとして、検索流入の獲得とE-E-A-Tの訴求を両立した記事を執筆してください。

■テーマ
${input.keyword}

${dataBlock}${strategyNote}${gapBlock}■検索意図の整理
このキーワードで検索するユーザーは以下の情報を求めていると想定されます：
・基本的な概念・定義を理解したい
・具体的な手順・プロセスを知りたい
・費用・相場感を把握したい
・成功事例・失敗事例から学びたい
・信頼できる専門家に相談したい${extraIntents}

■ターゲット
・ERP/SaaS導入を検討する中堅・中小企業の経営層・情報システム部門
・基幹システムの刷新・リプレイスを検討中の担当者
・NetSuite・Dynamics 365・Power Platform の導入を初めて検討する企業

■必須条件
・RICE CLOUDのERP/SaaS導入支援としての専門知識・実績（アジャイル導入・リカバリー実績等）を反映すること
・一次執筆時にシステムが読み込む社内資料（S3の参照資料等）を前提に、資料に基づく具体性・独自の現場知を記事に織り込むこと（メタに「資料」「S3」と書かないこと）
・実務に基づいた具体的なアドバイスを含めること
・読者が次のアクションを取りやすいよう、相談窓口やサービスページへの誘導を自然に含めること
・公的機関（IPA、経済産業省等）の統計やガイドラインを適宜引用すること

■トーン・文体（厳守）
・RICE CLOUDに言及するときは「私たちは〜」「弊社では〜」「RICE CLOUDでは〜」と自社視点で書くこと。「RICE CLOUDは確信している」のように三人称で客体化しない。
・文末は「〜です」「〜ます」「〜と考えています」のように丁寧語で統一。「〜だろう」「〜であろう」「〜に他ならない」のような評論家調・学術論文調は禁止。
・「徹底解説する」「完全ガイド」のような煽り表現は使わない。

■キーワード表記（厳守）
・ターゲットキーワードは本文中に自然な日本語として溶け込ませること。「」（鉤括弧）で囲んで繰り返さない。
・半角小文字のまま本文に出さない（例: erp 導入 → ERPの導入、ERPを導入する）。ERP・SaaS等の略語は常に大文字表記。

■品質要件
・2500文字以上の読み応えある記事にすること
・専門用語は必ず平易な説明を併記
・冗長な表現を避け、実務で役立つ情報密度の高い記事にすること
・RICE CLOUDの専門性・信頼性が伝わるトーンで統一
・記事末尾に「よくある質問（FAQ）」セクション（Q&A形式で5問程度）を含めること`
}
