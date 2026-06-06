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

  // 같은 지점에 새 이름이 이미 존재하면 충돌 → 거부 (덮어쓰기 방지)
  const { data: clash, error: clashErr } = await supabase
    .from('payroll')
    .select('id')
    .eq('branch', branch)
    .eq('emp_name', nn)
    .limit(1)
  if (clashErr) return res.status(500).json({ error: clashErr.message })
  if (clash && clash.length > 0) {
    return res.status(409).json({ error: `같은 지점에 이미 '${nn}' 직원이 있습니다. 다른 이름을 쓰세요.` })
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
