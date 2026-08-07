import { create } from 'zustand'
import { ApiError, createContractError } from '../api/errors'
import type { ApiListMeta } from '../api/types'
import {
  deleteWatchlistItem,
  getCoinChart,
  getWatchlist,
  registerWatchlist,
  searchCoins,
} from '../features/watchup/api'
import type { CoinChart, SearchResult, WatchlistItem } from '../features/watchup/types'

/*
 * 검색·등록·목록·선택·차트의 서버 상태와 요청 생명주기를 조정한다.
 * 서버 목록 순서를 그대로 보존하고, mutation 성공 후에는 GET 결과로 화면을 재조정한다.
 */
type RegistrationNotification = {
  id: number
  message: string
}

type WatchlistRequestResult = 'success' | 'error' | 'cancelled'

type WatchupDataState = {
  searchQuery: string
  searchResults: SearchResult[]
  searchLoading: boolean
  searchError: ApiError | null
  hasSearched: boolean
  registerLoading: boolean
  registeringMarketCode: string | null
  registrationError: ApiError | null
  registrationNotification: RegistrationNotification | null
  registrationRefreshFailed: boolean
  deleteLoading: boolean
  deletingId: number | null
  deleteError: ApiError | null
  deleteRefreshFailed: boolean
  watchlist: WatchlistItem[]
  watchlistMeta: ApiListMeta | null
  watchlistLoading: boolean
  watchlistError: ApiError | null
  selectedCoin: WatchlistItem | null
  chartData: CoinChart | null
  chartMeta: ApiListMeta | null
  chartLoading: boolean
  chartError: ApiError | null
}

type WatchupActions = {
  setSearchQuery: (query: string) => void
  submitSearch: () => Promise<void>
  registerCoin: (marketCode: string) => Promise<void>
  deleteCoin: (id: number) => Promise<void>
  cancelSearchRequest: () => void
  loadInitialWatchlist: () => Promise<void>
  selectCoin: (id: number) => void
  loadSelectedChart: () => Promise<void>
  cancelPendingRequests: () => void
  reset: () => void
}

type WatchupState = WatchupDataState & WatchupActions

const initialState: WatchupDataState = {
  searchQuery: '',
  searchResults: [],
  searchLoading: false,
  searchError: null,
  hasSearched: false,
  registerLoading: false,
  registeringMarketCode: null,
  registrationError: null,
  registrationNotification: null,
  registrationRefreshFailed: false,
  deleteLoading: false,
  deletingId: null,
  deleteError: null,
  deleteRefreshFailed: false,
  watchlist: [],
  watchlistMeta: null,
  watchlistLoading: false,
  watchlistError: null,
  selectedCoin: null,
  chartData: null,
  chartMeta: null,
  chartLoading: false,
  chartError: null,
}

// AbortController는 전송을 중단하고 requestId는 이미 완료 직전인 오래된 응답까지 막는다.
// 이 실행 제어 값들은 렌더링 대상이 아니므로 Zustand의 공개 UI 상태에 넣지 않는다.
let searchRequestId = 0
let searchController: AbortController | null = null
let submittedSearchQuery: string | null = null
let searchPromise: Promise<void> | null = null
let registrationRequestId = 0
let registrationController: AbortController | null = null
let registrationPromise: Promise<void> | null = null
let deletionRequestId = 0
let deletionController: AbortController | null = null
let deletionPromise: Promise<void> | null = null
let watchlistRequestId = 0
let watchlistController: AbortController | null = null
let watchlistPromise: Promise<WatchlistRequestResult> | null = null
let chartRequestId = 0
let chartController: AbortController | null = null
let chartMarketCode: string | null = null
let chartPromise: Promise<void> | null = null
let notificationId = 0

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function asApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : createContractError()
}

function invalidateSearchRequest(): void {
  searchRequestId += 1
  searchController?.abort()
  searchController = null
  submittedSearchQuery = null
  searchPromise = null
}

function invalidateRegistrationRequest(): void {
  registrationRequestId += 1
  registrationController?.abort()
  registrationController = null
  registrationPromise = null
}

function invalidateDeletionRequest(): void {
  deletionRequestId += 1
  deletionController?.abort()
  deletionController = null
  deletionPromise = null
}

function invalidateWatchlistRequest(): void {
  watchlistRequestId += 1
  watchlistController?.abort()
  watchlistController = null
  watchlistPromise = null
}

function invalidateChartRequest(): void {
  chartRequestId += 1
  chartController?.abort()
  chartController = null
  chartMarketCode = null
  chartPromise = null
}

function clearRuntimeRequests(): void {
  invalidateSearchRequest()
  invalidateRegistrationRequest()
  invalidateDeletionRequest()
  invalidateWatchlistRequest()
  invalidateChartRequest()
}

export const useWatchupStore = create<WatchupState>((set, get) => {
  const requestWatchlist = (
    selectFirstWhenUnselected: boolean,
    force = false,
  ): Promise<WatchlistRequestResult> => {
    if (!force && watchlistPromise) return watchlistPromise
    if (force) invalidateWatchlistRequest()

    const requestId = ++watchlistRequestId
    const controller = new AbortController()
    watchlistController = controller
    set({ watchlistLoading: true, watchlistError: null })

    const request: Promise<WatchlistRequestResult> = getWatchlist(controller.signal)
      .then((response): WatchlistRequestResult => {
        if (requestId !== watchlistRequestId || controller.signal.aborted) return 'cancelled'

        const previous = get()
        // 클라이언트에서 재정렬하지 않고 서버 순서를 보존한다. 기존 선택은 id로
        // 새 응답 객체에 연결하고, 삭제된 선택만 서버의 첫 항목으로 전환한다.
        const refreshedSelection = previous.selectedCoin
          ? response.data.find((item) => item.id === previous.selectedCoin?.id)
          : undefined
        const nextSelectedCoin = response.data.length === 0
          ? null
          : previous.selectedCoin
            ? (refreshedSelection ?? response.data[0])
            : selectFirstWhenUnselected || response.data.length === 1
              ? response.data[0]
              : null

        // 같은 마켓의 차트만 유지해야 목록 갱신 중 가격 정보가 바뀌어도 불필요한
        // 재요청을 피하면서 다른 코인의 오래된 차트를 노출하지 않는다.
        const chartCanRemain = Boolean(
          nextSelectedCoin
          && (nextSelectedCoin.status === 'ACTIVE' || nextSelectedCoin.status === 'CAUTION')
          && previous.chartData?.marketCode === nextSelectedCoin.marketCode,
        )

        if (!chartCanRemain) invalidateChartRequest()

        set({
          watchlist: response.data,
          watchlistMeta: response.meta,
          selectedCoin: nextSelectedCoin,
          watchlistLoading: false,
          watchlistError: null,
          registrationRefreshFailed: false,
          deleteRefreshFailed: false,
          ...(!chartCanRemain && {
            chartData: null,
            chartMeta: null,
            chartLoading: false,
            chartError: null,
          }),
        })
        return 'success'
      })
      .catch((error: unknown): WatchlistRequestResult => {
        if (requestId !== watchlistRequestId || isAbortError(error)) return 'cancelled'
        set({ watchlistLoading: false, watchlistError: asApiError(error) })
        return 'error'
      })
      .finally(() => {
        if (requestId !== watchlistRequestId) return
        watchlistController = null
        watchlistPromise = null
      })

    watchlistPromise = request
    return request
  }

  return {
    ...initialState,
    setSearchQuery: (searchQuery) => {
      const normalizedQuery = searchQuery.trim()
      if (searchController && submittedSearchQuery !== normalizedQuery) {
        invalidateSearchRequest()
        set({
          searchQuery,
          searchResults: [],
          searchLoading: false,
          searchError: null,
          hasSearched: false,
        })
        return
      }
      set({ searchQuery })
    },
    submitSearch: () => {
      const normalizedQuery = get().searchQuery.trim()
      if (!normalizedQuery) return Promise.resolve()
      if (searchController && submittedSearchQuery === normalizedQuery && searchPromise) {
        return searchPromise
      }

      invalidateSearchRequest()
      const requestId = searchRequestId
      const controller = new AbortController()
      searchController = controller
      submittedSearchQuery = normalizedQuery
      set({
        searchResults: [],
        searchLoading: true,
        searchError: null,
        hasSearched: false,
      })

      const request = searchCoins(normalizedQuery, controller.signal)
        .then((response) => {
          if (requestId !== searchRequestId || controller.signal.aborted) return
          set({
            searchResults: response.data,
            searchLoading: false,
            searchError: null,
            hasSearched: true,
          })
        })
        .catch((error: unknown) => {
          if (requestId !== searchRequestId || isAbortError(error)) return
          set({
            searchResults: [],
            searchLoading: false,
            searchError: asApiError(error),
            hasSearched: true,
          })
        })
        .finally(() => {
          if (requestId !== searchRequestId) return
          searchController = null
          submittedSearchQuery = null
          searchPromise = null
        })

      searchPromise = request
      return request
    },
    registerCoin: (marketCode) => {
      if (registrationPromise) return registrationPromise
      if (deletionPromise) return Promise.resolve()

      const requestId = ++registrationRequestId
      const controller = new AbortController()
      registrationController = controller
      set({
        registerLoading: true,
        registeringMarketCode: marketCode,
        registrationError: null,
        registrationNotification: null,
        registrationRefreshFailed: false,
      })

      const request = (async () => {
        try {
          await registerWatchlist(marketCode, controller.signal)
          if (requestId !== registrationRequestId || controller.signal.aborted) return

          invalidateSearchRequest()
          set({
            searchQuery: '',
            searchResults: [],
            searchLoading: false,
            searchError: null,
            hasSearched: false,
          })
          // 등록 결과로 목록을 낙관적으로 만들지 않는다. 서버의 정렬·상태·시세가
          // 결합된 GET 결과를 사용하되, 기존 선택이 있으면 그대로 유지한다.
          const refreshResult = await requestWatchlist(false, true)
          if (requestId === registrationRequestId && refreshResult === 'error') {
            set({ registrationRefreshFailed: true })
          }
        } catch (error) {
          if (requestId !== registrationRequestId || isAbortError(error)) return
          const registrationError = asApiError(error)
          set({
            registrationError,
            registrationNotification:
              registrationError.status === 409 && registrationError.code === 'WATCHLIST_DUPLICATED'
                ? { id: ++notificationId, message: '이미 등록된 코인입니다.' }
                : null,
          })
        } finally {
          if (requestId === registrationRequestId) {
            registrationController = null
            registrationPromise = null
            set({ registerLoading: false, registeringMarketCode: null })
          }
        }
      })()

      registrationPromise = request
      return request
    },
    deleteCoin: (id) => {
      if (deletionPromise) return deletionPromise
      if (registrationPromise) return Promise.resolve()

      const requestId = ++deletionRequestId
      const controller = new AbortController()
      deletionController = controller
      set({
        deleteLoading: true,
        deletingId: id,
        deleteError: null,
        deleteRefreshFailed: false,
      })

      const request = (async () => {
        try {
          await deleteWatchlistItem(id, controller.signal)
          if (requestId !== deletionRequestId || controller.signal.aborted) return

          // DELETE 200 이후에도 서버 목록을 다시 받아야 RLS가 허용한 실제 삭제와
          // 남은 첫 항목 선택을 한 흐름으로 확정할 수 있다.
          const refreshResult = await requestWatchlist(true, true)
          if (requestId === deletionRequestId && refreshResult === 'error') {
            set({ deleteRefreshFailed: true })
          }
        } catch (error) {
          if (requestId !== deletionRequestId || isAbortError(error)) return
          set({ deleteError: asApiError(error) })
        } finally {
          if (requestId === deletionRequestId) {
            deletionController = null
            deletionPromise = null
            set({ deleteLoading: false, deletingId: null })
          }
        }
      })()

      deletionPromise = request
      return request
    },
    cancelSearchRequest: () => {
      invalidateSearchRequest()
      set({ searchLoading: false })
    },
    loadInitialWatchlist: async () => {
      await requestWatchlist(true)
    },
    selectCoin: (id) => {
      const state = get()
      if (state.selectedCoin?.id === id) return
      const selectedCoin = state.watchlist.find((item) => item.id === id)
      if (!selectedCoin) return

      invalidateChartRequest()
      set({
        selectedCoin,
        chartData: null,
        chartMeta: null,
        chartLoading: false,
        chartError: null,
      })
    },
    loadSelectedChart: () => {
      const selectedCoin = get().selectedCoin
      if (!selectedCoin || (selectedCoin.status !== 'ACTIVE' && selectedCoin.status !== 'CAUTION')) {
        invalidateChartRequest()
        set({
          chartData: null,
          chartMeta: null,
          chartLoading: false,
          chartError: null,
        })
        return Promise.resolve()
      }

      if (chartMarketCode === selectedCoin.marketCode && chartPromise) return chartPromise
      const state = get()
      if (state.chartData?.marketCode === selectedCoin.marketCode && !state.chartError) {
        return Promise.resolve()
      }

      invalidateChartRequest()
      const requestId = chartRequestId
      const controller = new AbortController()
      chartController = controller
      chartMarketCode = selectedCoin.marketCode
      set({ chartData: null, chartMeta: null, chartLoading: true, chartError: null })

      const request = getCoinChart(selectedCoin.marketCode, controller.signal)
        .then((response) => {
          const currentSelection = get().selectedCoin
          // abort와 별개로 현재 선택과 응답의 marketCode를 함께 확인해 빠른 전환에서
          // 늦게 도착한 이전 차트가 최신 상세를 덮어쓰지 못하게 한다.
          if (
            requestId !== chartRequestId
            || controller.signal.aborted
            || currentSelection?.marketCode !== selectedCoin.marketCode
          ) return
          if (response.data.marketCode !== selectedCoin.marketCode) {
            set({ chartData: null, chartMeta: null, chartLoading: false, chartError: createContractError() })
            return
          }
          set({
            chartData: response.data,
            chartMeta: response.meta,
            chartLoading: false,
            chartError: null,
          })
        })
        .catch((error: unknown) => {
          if (requestId !== chartRequestId || isAbortError(error)) return
          set({ chartData: null, chartMeta: null, chartLoading: false, chartError: asApiError(error) })
        })
        .finally(() => {
          if (requestId !== chartRequestId) return
          chartController = null
          chartMarketCode = null
          chartPromise = null
        })

      chartPromise = request
      return request
    },
    cancelPendingRequests: () => {
      clearRuntimeRequests()
      set({
        searchLoading: false,
        registerLoading: false,
        registeringMarketCode: null,
        deleteLoading: false,
        deletingId: null,
        watchlistLoading: false,
        chartLoading: false,
      })
    },
    reset: () => {
      clearRuntimeRequests()
      notificationId = 0
      set(initialState)
    },
  }
})
