# 번영로센트리지 3단지 스터디룸 예약

게스트하우스 사이트와는 **완전히 별개의 사이트**지만, 데이터베이스(Supabase)와 관리자 계정은 **게스트하우스와 동일한 것을 그대로 사용**해요.

## 1. Supabase 값은 게스트하우스와 동일하게 사용
새 Supabase 프로젝트를 만들 필요 없어요. 게스트하우스 프로젝트의 `.env` 파일에 있던
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 값을 그대로 이 프로젝트의 `.env` 파일에도 넣으면 돼요.

이미 `studyroom_bookings` 테이블과 `cancel_my_studyroom_booking` 함수, 삭제 권한(`allow-admin-delete.sql`)까지
전에 Supabase에 만들어두셨다면 별도 SQL 작업은 필요 없어요.

## 2. 로컬에서 실행
```bash
npm install
npm run dev
```

## 3. 실제 배포 (게스트하우스와 별개의 GitHub 저장소 + Vercel 프로젝트)
1. GitHub에 **새 저장소**를 만드세요 (예: `centrige3-studyroom`)
2. 이 폴더를 그 저장소에 올리기 (git init → add → commit → remote add → push)
3. Vercel에서 **새 프로젝트**로 Import
4. Environment Variables에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 등록 (게스트하우스 프로젝트와 같은 값)
5. Deploy

## 관리자 로그인
게스트하우스 사이트에서 쓰던 것과 **같은 이메일/비밀번호**로 로그인하면 돼요 (Supabase Auth 계정을 공유하기 때문).
