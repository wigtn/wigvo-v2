---
paths:
  - "apps/mobile/**/*.{ts,tsx}"
---

# Mobile App Rules (React Native / Expo)

## Stack
- React Native + Expo SDK
- Expo Router (file-based routing)
- TypeScript strict mode
- Supabase Auth

## Code Style
- 함수형 컴포넌트 + hooks only
- camelCase (variables, functions), PascalCase (components, types)
- Custom hooks: `use` prefix (`useRelayWebSocket`, `useClientVad`)

## Project Structure
- `app/` — Expo Router pages
- `components/` — 재사용 컴포넌트
- `components/call/` — 통화 관련 UI
- `hooks/` — 커스텀 훅
- `lib/` — 유틸리티, VAD 등

## Accessibility (PRD M-7)
- 터치 타겟 최소 48x48dp
- 자막 폰트 크기 조절 지원
- 키보드/스크린리더 호환
- 수신자 발화 시 진동 피드백
