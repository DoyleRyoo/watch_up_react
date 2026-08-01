import type { ApiListMeta, ApiSuccess } from '../../api/types'

export type SearchResult = {
  marketCode: string
  koreanName: string
  englishName: string
  status: 'ACTIVE' | 'CAUTION'
}

export type CreatedWatchlistItem = {
  id: number
  marketCode: string
  koreanName: string
  englishName: string
  createdAt: string
}

export type DeleteWatchlistData = {
  id: number
}

export type WatchlistStatus = 'ACTIVE' | 'CAUTION' | 'UNAVAILABLE' | 'PRICE_ERROR'

export type WatchlistItem = {
  id: number
  marketCode: string
  koreanName: string
  englishName: string
  symbol: string
  currentPrice: number | null
  signedChangeRate: number | null
  status: WatchlistStatus
  isStale: boolean
  createdAt: string
}

export type ChartCandle = {
  date: string
  closingPrice: number
}

export type CoinChart = {
  marketCode: string
  period: '30d'
  candles: ChartCandle[]
}

export type SearchCoinsResponse = ApiSuccess<SearchResult[], ApiListMeta>
export type RegisterWatchlistResponse = ApiSuccess<CreatedWatchlistItem, null>
export type DeleteWatchlistResponse = ApiSuccess<DeleteWatchlistData, null>
export type WatchlistResponse = ApiSuccess<WatchlistItem[], ApiListMeta>
export type CoinChartResponse = ApiSuccess<CoinChart, ApiListMeta>
