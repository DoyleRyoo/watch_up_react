# WatchUp

![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8.1-646CFF?logo=vite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue.svg)

Google 계정으로 로그인하여 업비트 KRW 마켓의 관심 코인, 현재가, 등락률과 최근 30일 가격 흐름을 확인하는 React 대시보드입니다.

WatchUp 프론트엔드는 Supabase Auth로 사용자를 인증하고 FastAPI 백엔드를 통해 코인 검색, 관심 목록, 현재가 및 차트 데이터를 조회합니다. 브라우저에서 업비트 API나 Supabase 데이터베이스를 직접 호출하지 않습니다.

> WatchUp은 시세 모니터링 MVP입니다. 매수·매도, 모의자금, 포트폴리오, 실시간 WebSocket 시세는 제공하지 않습니다.

## 주요 기능

- **Google 로그인**: Supabase Auth 기반 OAuth 로그인, 세션 유지 및 보호 라우팅
- **안전한 API 인증**: Bearer access token 자동 첨부, 401 발생 시 세션 갱신 후 요청 1회 재시도
- **코인 검색**: 한글명, 영문명 또는 마켓 코드로 KRW 코인 검색
- **관심 코인 관리**: 관심 코인 등록 및 브라우저 기본 확인창을 통한 삭제
- **시세 표시**: 가격 구간별 원화 포맷과 상승·하락·보합 등락률 표시
- **마켓 상태 처리**: `ACTIVE`, `CAUTION`, `UNAVAILABLE`, `PRICE_ERROR` 상태별 UI
- **가격 차트**: Recharts Line Chart를 사용한 최근 30일 일봉 표시
- **비동기 경쟁 방지**: AbortController와 요청 식별자를 이용한 오래된 목록·차트 응답 차단
- **반응형 UI**: 데스크톱 좌우 배치와 768px 미만 모바일 세로 배치
- **접근성**: 키보드 조작, 접근 가능한 버튼 이름, `aria-current`, 색상 외 부호·문구·배지 제공

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| UI | React 19, TypeScript 6 |
| 개발 및 빌드 | Vite 8 |
| 라우팅 | React Router |
| 상태 관리 | Zustand |
| 인증 | Supabase JavaScript SDK, Google OAuth |
| 차트 | Recharts |
| 스타일 | CSS, PostCSS |
| 테스트 | Vitest, Testing Library, jsdom |
| 코드 품질 | ESLint, TypeScript type checking |
| 운영 이미지 | Docker multi-stage build, Nginx |

## 프로젝트 구조

```text
watch_up_react/
├── src/
│   ├── api/                 # FastAPI 공통 Client, envelope 및 오류 타입
│   ├── auth/                # Supabase 세션 초기화와 인증 상태 동기화
│   ├── features/watchup/    # 검색, 관심 목록, 상세, 차트, API 및 포맷터
│   ├── lib/                 # Supabase Client
│   ├── pages/               # 로그인, OAuth callback, 메인 페이지
│   ├── routes/              # 인증 상태 기반 라우팅
│   ├── stores/              # 인증 및 WatchUp Zustand store
│   ├── test/                # 단위·컴포넌트·API 통합 테스트
│   ├── App.tsx              # 애플리케이션 진입 컴포넌트
│   ├── App.css              # 화면 및 반응형 스타일
│   └── main.tsx             # React root
├── nginx/
│   └── default.conf         # SPA fallback 및 health endpoint
├── .env.example             # 프론트엔드 환경변수 예시
├── dockerfile               # 빌드 및 Nginx 런타임 이미지
├── package.json             # 의존성과 실행 스크립트
└── vite.config.ts           # Vite 및 Vitest 설정
```

## 시작하기

### 요구 사항

- Node.js 24 권장 — 현재 Docker 빌더 기준
- npm
- Google Provider가 설정된 Supabase 프로젝트
- WatchUp FastAPI 백엔드

### 설치

```bash
npm ci
```

### 환경변수

예시 파일을 복사하여 로컬 환경변수를 준비합니다.

```bash
cp .env.example .env
```

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_BASE_URL=/api
```

| 변수 | 설명 |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| `VITE_SUPABASE_ANON_KEY` | 브라우저용 Supabase anon key |
| `VITE_API_BASE_URL` | FastAPI base URL. 기본값은 `/api` |

실제 키를 저장소에 커밋하지 마세요. `service_role` key, Google Client Secret, Redis 또는 업비트 서버 설정은 프론트엔드 환경변수로 사용하지 않습니다.

### 개발 서버 실행

```bash
npm run dev
```

기본 개발 주소는 [http://localhost:5173](http://localhost:5173)입니다. 개발 서버는 Docker 또는 devcontainer 외부에서도 접근할 수 있도록 `--host` 옵션으로 실행됩니다.

VS Code devcontainer를 사용한다면 `PORTS` 패널에서 `5173` 포트를 Forward해야 합니다. 일반 Docker 컨테이너라면 실행 시 `5173:5173` 포트 매핑이 필요합니다.

> 현재 Vite 설정과 기본 Nginx 설정에는 `/api` 개발 프록시가 없습니다. `VITE_API_BASE_URL=/api`는 동일 origin에 API가 연결된 환경을 전제로 합니다. 로컬에서 백엔드를 별도 주소로 실행한다면 브라우저가 접근할 수 있는 FastAPI base URL을 설정하고 백엔드 CORS 정책도 함께 구성해야 합니다.

### 빌드 및 로컬 미리보기

```bash
npm run build
npm run preview -- --host 0.0.0.0
```

프로덕션 산출물은 `dist/`에 생성됩니다. 제공된 Dockerfile은 이 산출물을 Nginx로 서비스하며 컨테이너의 `/health` endpoint를 제공합니다. Vite 환경변수는 런타임이 아니라 빌드 시점에 주입되어야 합니다.

## 사용법

### 기본 사용자 흐름

1. `/login`에서 Google 계정으로 로그인합니다.
2. 메인 화면의 검색 영역에 코인명이나 마켓 코드를 입력하고 **검색**을 누릅니다.
3. 검색 결과에서 **등록**을 눌러 관심 코인에 추가합니다.
4. 관심 목록의 코인을 선택하여 현재가, 등락률과 최근 30일 차트를 확인합니다.
5. **삭제**를 누르고 기본 확인창에서 승인하면 서버 삭제 성공 후 목록을 다시 조회합니다.

### 마켓 상태

| 상태 | 화면 동작 |
| --- | --- |
| `ACTIVE` | 현재가, 등락률, 차트 표시 |
| `CAUTION` | 현재가와 차트 표시, `투자 유의` 배지 제공 |
| `UNAVAILABLE` | 목록에 유지하고 조회 불가 문구 표시, 차트 요청 없음 |
| `PRICE_ERROR` | 해당 항목에 `현재가 조회 실패` 표시, 차트 요청 없음 |

### 주요 라우트

| 경로 | 설명 |
| --- | --- |
| `/login` | 비로그인 사용자 로그인 화면 |
| `/auth/callback` | Supabase OAuth callback 처리 |
| `/` | 인증된 사용자의 WatchUp 대시보드 |

### 백엔드 API 계약

프론트엔드는 다음 endpoint를 사용합니다.

```text
GET    /api/health
GET    /api/coins/search?query={query}
POST   /api/watchlist
GET    /api/watchlist
GET    /api/coins/{marketCode}/chart
DELETE /api/watchlist/{id}
```

성공 응답과 오류 응답은 다음 envelope을 따릅니다.

```json
{
  "data": {},
  "meta": null
}
```

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "오류 메시지",
    "details": null
  }
}
```

## 테스트와 코드 품질

```bash
npm test -- --run
npm run typecheck
npm run lint
npm run build
```

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | Vite 개발 서버 실행 |
| `npm test -- --run` | 전체 Vitest 테스트 1회 실행 |
| `npm run typecheck` | TypeScript 프로젝트 검사 |
| `npm run lint` | ESLint 검사 |
| `npm run build` | 타입 검사 후 프로덕션 빌드 |
| `npm run preview` | 빌드 산출물 미리보기 |

테스트는 실제 Google OAuth, FastAPI, Supabase, Redis 또는 업비트 네트워크에 연결하지 않고 mock을 사용하여 실행됩니다.

## 기여하기

1. 저장소를 Fork하고 작업 브랜치를 생성합니다.

   ```bash
   git checkout -b feature/your-feature
   ```

2. 프로젝트 규칙과 기존 API 계약을 유지하면서 변경합니다.
3. 테스트와 정적 검사를 실행합니다.

   ```bash
   npm test -- --run
   npm run typecheck
   npm run lint
   npm run build
   ```

4. 변경 목적, 사용자 영향과 검증 결과를 포함하여 Pull Request를 생성합니다.

민감한 환경변수, 토큰 또는 서버용 key를 커밋하지 마세요. 관련 없는 리팩터링이나 MVP 범위 밖 기능을 한 Pull Request에 함께 포함하지 않는 것을 권장합니다.

## 라이선스

이 프로젝트는 [MIT License](./LICENSE)를 따릅니다.
