import { useEffect, type FormEvent } from 'react'
import { useWatchupStore } from '../../stores/watchupStore'
import type { SearchResult } from './types'

const SEARCH_ERROR_LINES = ['코인 검색에 실패했습니다.', '잠시 후 다시 시도해주세요.']
const SERVICE_ERROR_LINES = ['서비스 요청을 처리하지 못했습니다.', '잠시 후 다시 시도해주세요.']

function displaySymbol(marketCode: string): string {
  return marketCode.startsWith('KRW-') && marketCode.length > 4
    ? marketCode.slice(4)
    : marketCode
}

function SearchResultItem({ result }: { result: SearchResult }) {
  const registerLoading = useWatchupStore((state) => state.registerLoading)
  const registeringMarketCode = useWatchupStore((state) => state.registeringMarketCode)
  const deleteLoading = useWatchupStore((state) => state.deleteLoading)
  const registerCoin = useWatchupStore((state) => state.registerCoin)
  const isRegistering = registeringMarketCode === result.marketCode

  return (
    <li className="search-result-item">
      <div>
        <strong>{result.koreanName} ({displaySymbol(result.marketCode)})</strong>
        <span>{result.marketCode}</span>
      </div>
      <button
        type="button"
        aria-label={`${result.koreanName} 관심 코인 등록`}
        disabled={registerLoading || deleteLoading}
        onClick={() => void registerCoin(result.marketCode)}
      >
        {isRegistering ? '등록 중' : '등록'}
      </button>
    </li>
  )
}

function Message({ lines }: { lines: string[] }) {
  return <div role="alert" className="status-message error-message">
    {lines.map((line) => <p key={line}>{line}</p>)}
  </div>
}

export function SearchArea() {
  const searchQuery = useWatchupStore((state) => state.searchQuery)
  const searchResults = useWatchupStore((state) => state.searchResults)
  const searchLoading = useWatchupStore((state) => state.searchLoading)
  const searchError = useWatchupStore((state) => state.searchError)
  const hasSearched = useWatchupStore((state) => state.hasSearched)
  const registerLoading = useWatchupStore((state) => state.registerLoading)
  const registrationError = useWatchupStore((state) => state.registrationError)
  const registrationNotification = useWatchupStore((state) => state.registrationNotification)
  const registrationRefreshFailed = useWatchupStore((state) => state.registrationRefreshFailed)
  const setSearchQuery = useWatchupStore((state) => state.setSearchQuery)
  const submitSearch = useWatchupStore((state) => state.submitSearch)
  const cancelSearchRequest = useWatchupStore((state) => state.cancelSearchRequest)

  useEffect(() => cancelSearchRequest, [cancelSearchRequest])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void submitSearch()
  }

  const showRegistrationError = registrationError
    && !(registrationError.status === 409 && registrationError.code === 'WATCHLIST_DUPLICATED')

  return (
    <section className="search-area" aria-labelledby="search-title">
      <h2 id="search-title">코인 검색</h2>
      <form className="search-form" onSubmit={handleSubmit}>
        <label htmlFor="coin-search">코인명</label>
        <div className="search-controls">
          <input
            id="coin-search"
            name="query"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="코인명을 입력하세요."
          />
          <button type="submit" disabled={searchLoading || !searchQuery.trim()}>검색</button>
        </div>
      </form>

      {searchLoading && <p role="status" className="status-message">코인을 검색하는 중입니다.</p>}
      {searchError && <Message lines={SEARCH_ERROR_LINES} />}
      {!searchLoading && !searchError && hasSearched && searchResults.length === 0
        && <p className="status-message">검색 결과가 없습니다.</p>}
      {searchResults.length > 0 && <ul className="search-results">
        {searchResults.map((result) => <SearchResultItem key={result.marketCode} result={result} />)}
      </ul>}

      {registerLoading && <p role="status" className="status-message">관심 코인을 등록하는 중입니다.</p>}
      {registrationNotification && <p key={registrationNotification.id} role="alert" className="status-message error-message">
        {registrationNotification.message}
      </p>}
      {showRegistrationError && <Message lines={SERVICE_ERROR_LINES} />}
      {registrationRefreshFailed && <Message lines={SERVICE_ERROR_LINES} />}
    </section>
  )
}
