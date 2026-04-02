/**
 * 内部リンク候補：RICE CLOUDのお役立ち情報・導入事例など。
 * 担当者が「どの文言にこのリンクを張るか」をステップ3で選択する。
 * URLは https://www.rice-cloud.info/ 配下の実際のページに合わせて編集してください。
 */
export interface LinkBankItem {
  label: string
  url: string
  category: 'useful' | 'case'
}

export const LINK_BANK: LinkBankItem[] = [
  {
    category: 'useful',
    label: 'クラウドERP導入の基礎知識',
    url: 'https://www.rice-cloud.info/column/',
  },
  {
    category: 'useful',
    label: 'ERP導入の進め方',
    url: 'https://www.rice-cloud.info/column/',
  },
  {
    category: 'useful',
    label: 'アジャイル導入のメリット',
    url: 'https://www.rice-cloud.info/column/',
  },
  {
    category: 'useful',
    label: 'お問い合わせ',
    url: 'https://www.rice-cloud.info/contact/',
  },
  {
    category: 'case',
    label: '導入事例一覧',
    url: 'https://www.rice-cloud.info/casestudy/',
  },
  {
    category: 'case',
    label: '製造業のERP導入事例',
    url: 'https://www.rice-cloud.info/casestudy/',
  },
  {
    category: 'case',
    label: 'プロジェクトリカバリー事例',
    url: 'https://www.rice-cloud.info/casestudy/',
  },
]

export const LINK_BANK_USEFUL = LINK_BANK.filter((x) => x.category === 'useful')
export const LINK_BANK_CASE = LINK_BANK.filter((x) => x.category === 'case')
