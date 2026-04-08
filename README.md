# GapGaps

GapGaps는 여러 거래소의 현물과 선물 시세를 한 화면에서 비교해 차익거래 기회를 빠르게 확인할 수 있게 도와주는 Next.js 대시보드입니다.

## 주요 기능

- Binance Spot/Futures 내부 가격 차이 비교
- OKX Spot/Perp 내부 가격 차이 비교
- Bithumb KRW와 OKX Spot 간 크로스 거래소 비교
- Bithumb KRW와 Binance Spot 간 크로스 거래소 비교
- USDT/KRW 환율 기반 KRW 환산 가격 매트릭스
- 수수료와 최소 거래대금 필터 조정
- 브라우저 알림 기반 기회 감지

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 을 열면 됩니다.

## 프로젝트 구조

- `src/app/page.tsx`: 메인 대시보드 화면
- `src/app/api/*`: 거래소 및 환율 데이터를 가져오는 API 라우트
- `src/lib/exchanges.ts`: 거래소 데이터 정규화 및 차익 계산 로직
- `src/lib/types.ts`: 공통 타입 정의

## 주의 사항

- 화면에 보이는 수익률은 참고용 추정치입니다.
- 실제 거래 전에는 출금비, 송금 시간, 슬리피지, 펀딩비 등을 별도로 확인해야 합니다.
