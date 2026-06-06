import { createClient } from '@supabase/supabase-js'

// 환경변수는 Vercel에 설정돼 있음. 빌드 시 페이지 데이터 수집 단계에서 환경변수가
// 없으면 createClient가 throw → 페이지 수집 실패하므로, 없을 때만 더미 값으로 대체해
// import 시점 throw를 막는다. (실제 배포 환경엔 값이 있어 동작 동일)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
