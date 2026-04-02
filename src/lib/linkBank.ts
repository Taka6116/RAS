/**
 * 内部リンク候補：お役立ち情報・日本提携支援の事例など。
 * 担当者が「どの文言にこのリンクを張るか」をステップ3で選択する。
 * URLは実際のサイトに合わせて編集してください。
 */
export interface LinkBankItem {
  label: string
  url: string
  category: 'useful' | 'case'
}

export const LINK_BANK: LinkBankItem[] = [
  {
    category: 'useful',
    label: 'M&Aの基礎知識',
    url: '/useful/ma-basics',
  },
  {
    category: 'useful',
    label: '事業承継の流れ',
    url: '/useful/succession-flow',
  },
  {
    category: 'useful',
    label: '補助金・税制の活用',
    url: '/useful/subsidy-tax',
  },
  {
    category: 'useful',
    label: 'M&Aの相談相手の選び方',
    url: '/useful/ma-consultant',
  },
  {
    category: 'case',
    label: '製造業のM&A事例',
    url: '/case/manufacturing',
  },
  {
    category: 'case',
    label: '小売業の事業承継事例',
    url: '/case/retail',
  },
  {
    category: 'case',
    label: 'サービス業のM&A事例',
    url: '/case/service',
  },
]

export const LINK_BANK_USEFUL = LINK_BANK.filter((x) => x.category === 'useful')
export const LINK_BANK_CASE = LINK_BANK.filter((x) => x.category === 'case')
