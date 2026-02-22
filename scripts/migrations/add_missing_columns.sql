-- calls 테이블 누락 컬럼 추가
-- 실행: Supabase Dashboard > SQL Editor에서 실행
--
-- 이미 존재하는 컬럼은 IF NOT EXISTS로 안전하게 건너뜀

ALTER TABLE calls ADD COLUMN IF NOT EXISTS auto_ended BOOLEAN DEFAULT FALSE;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_sid TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS communication_mode TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS duration_s DOUBLE PRECISION;
