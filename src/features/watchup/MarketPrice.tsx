import {
  formatChangeRate,
  formatPrice,
  getChangeRateDirection,
} from './formatters'
import type { WatchlistItem } from './types'

type MarketPriceProps = {
  item: WatchlistItem
  compact?: boolean
}

export function MarketPrice({ item, compact = false }: MarketPriceProps) {
  if (item.status === 'UNAVAILABLE') {
    return <p className="market-state unavailable-state">거래지원 종료 또는 조회 불가</p>
  }
  if (item.status === 'PRICE_ERROR') {
    return <p className="market-state price-error-state">현재가 조회 실패</p>
  }

  const formattedPrice = formatPrice(item.currentPrice)
  const formattedRate = formatChangeRate(item.signedChangeRate)
  if (!formattedPrice || !formattedRate || item.signedChangeRate === null) {
    return <p className="market-state price-error-state">현재가 조회 실패</p>
  }

  const direction = getChangeRateDirection(item.signedChangeRate)
  return (
    <div className={compact ? 'market-price compact' : 'market-price'}>
      <span className="current-price">{formattedPrice}</span>
      <span className={`change-rate change-${direction}`}>{formattedRate}</span>
    </div>
  )
}
