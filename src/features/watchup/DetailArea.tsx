import { useEffect } from 'react'
import { useWatchupStore } from '../../stores/watchupStore'
import { MarketPrice } from './MarketPrice'
import { PriceChart } from './PriceChart'

export function DetailArea() {
  const selectedCoin = useWatchupStore((state) => state.selectedCoin)
  const chartData = useWatchupStore((state) => state.chartData)
  const chartLoading = useWatchupStore((state) => state.chartLoading)
  const chartError = useWatchupStore((state) => state.chartError)
  const loadSelectedChart = useWatchupStore((state) => state.loadSelectedChart)
  const selectedId = selectedCoin?.id
  const selectedMarketCode = selectedCoin?.marketCode
  const selectedStatus = selectedCoin?.status

  useEffect(() => {
    void loadSelectedChart()
  }, [loadSelectedChart, selectedId, selectedMarketCode, selectedStatus])

  return (
    <section className="dashboard-panel detail-area" aria-labelledby="detail-title">
      <h2 id="detail-title">코인 상세</h2>

      {!selectedCoin && <p className="empty-state">표시할 코인이 없습니다.</p>}

      {selectedCoin && <div className="coin-detail">
        <div className="detail-heading">
          <div>
            <h3>{selectedCoin.koreanName} ({selectedCoin.symbol})</h3>
            <p>{selectedCoin.marketCode}</p>
          </div>
          {selectedCoin.status === 'CAUTION' && <span className="status-badge caution-badge">투자 유의</span>}
        </div>

        {selectedCoin.status === 'UNAVAILABLE'
          ? <p className="unavailable-detail">현재 업비트 KRW 마켓에서 조회할 수 없는 코인입니다.</p>
          : <MarketPrice item={selectedCoin} />}

        {(selectedCoin.status === 'ACTIVE' || selectedCoin.status === 'CAUTION') && <div className="chart-area" aria-labelledby="chart-title">
          <h3 id="chart-title">최근 30일 가격</h3>
          {chartLoading && <p role="status">차트를 불러오는 중입니다.</p>}
          {chartError && <p className="error-message">차트 데이터를 불러오지 못했습니다.</p>}
          {!chartLoading
            && !chartError
            && chartData?.marketCode === selectedCoin.marketCode
            && <PriceChart chart={chartData} />}
        </div>}
      </div>}
    </section>
  )
}
