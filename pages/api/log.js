import { supabase } from '../../lib/supabase'

// ── 수정 이력/로그 ──
// POST: 변경 기록 1건 적재 (저장/마감/이름변경/삭제 등)
// GET : 최근 기록 조회 (지점·개수 필터)
// 주의: change_logs 테이블이 아직 없을 수 있으므로(1회 SQL 실행 전), 실패해도
//       에러를 던지지 않고 조용히 넘긴다 → 본 기능(저장/삭제 등)이 절대 안 깨지게.
export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { branch, emp_name, year, month, action, actor, grand_total, detail } = req.body || {}
    if (!action) return res.status(400).json({ error: 'action이 필요합니다.' })

    const row = {
      branch:      branch || '',
      emp_name:    emp_name || '',
      year:        year ? Number(year) : null,
      month:       month ? Number(month) : null,
      action,                              // '저장' | '마감' | '이름변경' | '삭제'
      actor:       actor || '',            // 어느 지점(매니저) / '관리자'
      grand_total: Number(grand_total) || 0,
      detail:      detail || '',
    }

    const { error } = await supabase.from('change_logs').insert(row)
    if (error) {
      // 테이블 미존재 등 → 로그는 부가기능이라 조용히 무시
      console.warn('change_logs insert skipped:', error.message)
      return res.status(200).json({ success: false, skipped: true })
    }
    return res.status(200).json({ success: true })
  }

  if (req.method === 'GET') {
    const { branch, limit } = req.query
    let q = supabase
      .from('change_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Number(limit) || 100)
    if (branch && branch !== '전체 지점') q = q.eq('branch', branch)

    const { data, error } = await q
    if (error) {
      // 테이블이 아직 없으면 빈 목록 + 안내 플래그
      return res.status(200).json({ logs: [], unavailable: true })
    }
    return res.status(200).json({ logs: data || [] })
  }

  return res.status(405).end()
}
