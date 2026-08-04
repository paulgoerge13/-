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

  // ── 이름이 정확히 안 맞아 한 건도 못 지운 경우 ──
  //   예: DB엔 '김수연님' 인데 화면에서 '김수연' 으로 요청 → 0건 삭제인데도 성공으로 응답돼
  //   화면에서만 사라지고 재로그인하면 되살아났다. 존칭·공백·브랜드 접두를 지운 이름으로
  //   다시 찾아보고, 후보가 딱 1명이면 그 사람을 지운다. (여러 명이면 애매하니 알려만 준다)
  if (!data || data.length === 0) {
    const norm = s => String(s || '')
      .replace(/더콤마라운지|더콤마|라운지/g, '')
      .replace(/님$/, '')
      .replace(/\s+/g, '')
      .replace(/[A-Za-z]+\d*$/, '')
      .trim()
    const want = norm(empName)
    const { data: sameMonth } = await supabase
      .from('payroll').select('id, emp_name, deleted_at')
      .eq('branch', branch).eq('year', year).eq('month', month)
    const alive = (sameMonth || []).filter(r => !r.deleted_at)
    const cands = alive.filter(r => norm(r.emp_name) === want)
    if (cands.length === 1) {
      const { data: d2, error: e2 } = await supabase
        .from('payroll').update({ deleted_at: now }).eq('id', cands[0].id).select('id')
      if (e2) return res.status(500).json({ error: e2.message })
      return res.status(200).json({ success: true, deleted: d2 ? d2.length : 0, matchedName: cands[0].emp_name })
    }
    // 못 찾음 → 화면이 "지웠다"고 착각하지 않도록 실패로 응답 (그 달 이름 목록을 함께 준다)
    return res.status(404).json({
      error: `'${empName}' 을(를) ${year}년 ${month}월 ${branch} 기록에서 찾지 못했습니다.`,
      candidates: alive.map(r => r.emp_name),
      deleted: 0,
    })
  }

  return res.status(200).json({ success: true, deleted: data.length })
}
