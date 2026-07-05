import { supabase } from '../../lib/supabase'

// ── 직원 삭제: 현재 보고 있는 '그 달'의 레코드만 DB에서 지운다 ──
// (월별 레코드라 6월에서 삭제해도 5월·4월 기록은 그대로 유지 → 그 달엔 다시 보임)
// 로컬 화면에서만 지우면 재로그인 시 DB에서 다시 불러와 되살아나므로 DB도 함께 삭제한다.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { branch, empName, year, month } = req.body || {}

  if (!branch || !empName || !year || !month) {
    return res.status(400).json({ error: '지점·이름·연도·월이 모두 필요합니다.' })
  }

  // 소프트 삭제: 바로 지우지 않고 deleted_at 만 찍는다 (30일 휴지통 → 되살리기 가능)
  const now = new Date().toISOString()
  let { data, error } = await supabase
    .from('payroll')
    .update({ deleted_at: now })
    .eq('branch', branch).eq('emp_name', empName).eq('year', year).eq('month', month)
    .is('deleted_at', null)
    .select('id')

  // deleted_at 컬럼이 아직 없으면(마이그레이션 전) 기존처럼 하드 삭제
  if (error && /column|deleted_at|schema cache|could not find/i.test(`${error.message} ${error.details || ''}`)) {
    ;({ data, error } = await supabase
      .from('payroll').delete()
      .eq('branch', branch).eq('emp_name', empName).eq('year', year).eq('month', month)
      .select('id'))
  }

  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ success: true, deleted: data ? data.length : 0 })
}
