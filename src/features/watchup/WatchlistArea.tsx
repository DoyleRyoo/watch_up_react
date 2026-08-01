import type { MouseEvent } from 'react'
import { useWatchupStore } from '../../stores/watchupStore'
import { MarketPrice } from './MarketPrice'
import type { WatchlistItem } from './types'

const SERVICE_ERROR_LINES = ['서비스 요청을 처리하지 못했습니다.', '잠시 후 다시 시도해주세요.']

export function WatchlistArea() {
  const watchlist = useWatchupStore((state) => state.watchlist)
  const watchlistLoading = useWatchupStore((state) => state.watchlistLoading)
  const watchlistError = useWatchupStore((state) => state.watchlistError)
  const selectedCoinId = useWatchupStore((state) => state.selectedCoin?.id)
  const registerLoading = useWatchupStore((state) => state.registerLoading)
  const deleteLoading = useWatchupStore((state) => state.deleteLoading)
  const deletingId = useWatchupStore((state) => state.deletingId)
  const deleteError = useWatchupStore((state) => state.deleteError)
  const deleteRefreshFailed = useWatchupStore((state) => state.deleteRefreshFailed)
  const selectCoin = useWatchupStore((state) => state.selectCoin)

  const handleDelete = (event: MouseEvent<HTMLButtonElement>, item: WatchlistItem) => {
    event.stopPropagation()
    const state = useWatchupStore.getState()
    if (state.deleteLoading || state.registerLoading) return
    if (!window.confirm(`${item.koreanName}을 관심 코인에서 삭제하시겠습니까?`)) return
    void state.deleteCoin(item.id)
  }

  const showRequestError = !deleteLoading && Boolean(
    watchlistError || deleteError || deleteRefreshFailed,
  )
  const showEmptyState = !watchlistLoading
    && !deleteLoading
    && !showRequestError
    && watchlist.length === 0

  return (
    <section className="dashboard-panel watchlist-area" aria-labelledby="watchlist-title">
      <h2 id="watchlist-title">관심 코인</h2>

      {watchlistLoading && !deleteLoading
        && <p role="status" className="status-message">관심 코인을 불러오는 중입니다.</p>}
      {deleteLoading
        && <p role="status" className="status-message">관심 코인을 삭제하는 중입니다.</p>}
      {showRequestError && <div role="status" className="status-message error-message">
        {SERVICE_ERROR_LINES.map((line) => <p key={line}>{line}</p>)}
      </div>}

      {showEmptyState && <div className="empty-state">
        <p>등록된 관심 코인이 없습니다.</p>
        <p>코인명을 검색하여<br />관심 코인을 등록해주세요.</p>
      </div>}

      {watchlist.length > 0 && <ul className="watchlist">
        {watchlist.map((item) => {
          const selected = item.id === selectedCoinId
          const deleting = deleteLoading && item.id === deletingId
          return <li
            key={item.id}
            className={selected ? 'watchlist-item selected' : 'watchlist-item'}
            aria-busy={deleting ? 'true' : undefined}
          >
            <button
              type="button"
              className="watchlist-select"
              aria-label={`${item.koreanName} 선택`}
              aria-current={selected ? 'true' : undefined}
              onClick={() => selectCoin(item.id)}
            >
              <span className="coin-identity">
                <span className="coin-name-row">
                  <strong>{item.koreanName}</strong>
                  {item.status === 'CAUTION' && <span className="status-badge caution-badge">투자 유의</span>}
                </span>
                <span>{item.symbol} · {item.marketCode}</span>
              </span>
              <MarketPrice item={item} compact />
            </button>
            <button
              type="button"
              className="delete-button"
              aria-label={`${item.koreanName} 삭제`}
              disabled={deleteLoading || registerLoading}
              onClick={(event) => handleDelete(event, item)}
            >
              삭제
            </button>
          </li>
        })}
      </ul>}
    </section>
  )
}
