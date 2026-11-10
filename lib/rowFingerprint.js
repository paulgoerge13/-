// ── 급여 기록 '지문' ──
// 지점 화면이 기록을 불러올 때의 내용과, 저장하는 순간 DB에 있는 내용이 같은지 비교하는 용도.
// 그사이 다른 화면·관리자·직접 수정으로 근무표나 금액이 바뀌었으면 지문이 달라지고,
// 그 옛 화면으로는 저장을 막는다. (예: 2026-11-09 남양주점 — 추가한 10/30·10/31 근무가
//  옛 화면 저장에 덮여 사라졌다)
// updated_at 은 직접 수정·관리자 수정 때 안 바뀌어서 쓸 수 없다 → 내용 자체로 비교한다.

function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
  }
  return JSON.stringify(v === undefined ? null : v)
}

export function rowFingerprint(r) {
  if (!r) return ''
  const s = stable({
    w: r.work_data || {},
    g: Number(r.grand_total) || 0,
    t: r.emp_type || '',
    h: Number(r.hourly_wage) || 0,
    hd: r.hire_date || '',
    rd: r.resign_date || '',
  })
  // djb2 — 같은지만 보면 되므로 짧은 해시로 충분
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return `${s.length}-${h.toString(36)}`
}
