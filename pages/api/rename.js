import { supabase } from '../../lib/supabase'

// ── 직원 이름 변경: 같은 지점의 '모든 달' 레코드를 새 이름으로 한 번에 갱신 ──
// (월별 레코드라 한 달만 바꾸면 다른 달이 옛 이름으로 남아 중복됨 → 전체 갱신)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { branch, oldName, newName } = req.body || {}

  if (!branch || !oldName || !newName) {
    return res.status(400).json({ error: '지점·기존이름·새이름이 모두 필요합니다.' })
  }
  const nn = String(newName).trim()
  if (!nn) return res.status(400).json({ error: '새 이름이 비어 있습니다.' })
  if (oldName === nn) return res.status(200).json({ success: true, changed: 0 })

  // ── 충돌 판정: DB 고유키는 (지점,이름,연,월). 따라서 "같은 달"에 새 이름이 이미 있을 때만 진짜 충돌.
  //   (예: 4월엔 '손수형', 5월엔 '손수형님 G'처럼 달이 다르면 같은 사람 이름 통일이라 충돌 아님 → 허용)
  const { data: oldRows, error: oldErr } = await supabase
    .from('payroll').select('year, month').eq('branch', branch).eq('emp_name', oldName)
  if (oldErr) return res.status(500).json({ error: oldErr.message })
  if (!oldRows || oldRows.length === 0) {
    return res.status(200).json({ success: true, changed: 0 })  // 바꿀 레코드가 없음
  }

  const { data: newRows, error: newErr } = await supabase
    .from('payroll').select('year, month').eq('branch', branch).eq('emp_name', nn)
  if (newErr) return res.status(500).json({ error: newErr.message })

  const newSet = new Set((newRows || []).map(r => `${r.year}-${r.month}`))
  const conflicts = oldRows.filter(r => newSet.has(`${r.year}-${r.month}`))
  if (conflicts.length > 0) {
    const list = conflicts
      .sort((a, b) => a.year - b.year || a.month - b.month)
      .map(r => `${r.year}년 ${r.month}월`).join(', ')
    return res.status(409).json({
      error: `${list}에 이미 '${nn}' 직원이 있어 그 달은 이름을 바꿀 수 없습니다. 해당 달에서 중복 직원을 먼저 정리해 주세요.`,
    })
  }

  const { data, error } = await supabase
    .from('payroll')
    .update({ emp_name: nn, updated_at: new Date().toISOString() })
    .eq('branch', branch)
    .eq('emp_name', oldName)
    .select('id')
  if (error) return res.status(500).json({ error: error.message })

  return res.status(200).json({ success: true, changed: data ? data.length : 0 })
}
