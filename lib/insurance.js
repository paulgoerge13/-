// ── 입사 첫 달 4대보험 규칙 ──
// 국민연금법·건강보험법상 '자격을 취득한 날이 속하는 달'은 보험료를 징수하지 않는다.
// 단 입사일이 그 달 1일이면 그 달부터 부과한다. 고용보험·소득세는 첫 달부터 그대로 뗀다.
//   예) 9/7 입사 → 9월은 고용보험만, 10월부터 국민·건강·장기 부과
//
// ※ 2026-09 지급분부터 적용한다. 그 전 달은 이미 지급·신고가 끝나서
//   지금 규칙을 소급하면 지난달 급여 금액이 바뀌어 버린다.
const FROM = 2026 * 12 + 9

export function isFirstMonthInsuranceFree(year, month, hireDate) {
  const m = String(hireDate || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return false
  const [, hy, hm, hd] = m
  if (Number(hd) === 1) return false                                   // 1일 입사는 첫 달부터 부과
  if (Number(hy) !== Number(year) || Number(hm) !== Number(month)) return false
  return (Number(year) * 12 + Number(month)) >= FROM
}


// ── 4대보험 기준 보수월액 ──
// 국민연금·건강보험은 그 달 실제 급여가 아니라 공단에 '신고된 보수월액'으로 부과된다.
// 급여 사이트는 그 값을 알 수 없으므로 직원별로 적어두고 쓴다. (비우면 그 달 과세급여 기준)
//   · 국민연금과 건강보험은 기준 금액이 조금 다를 수 있어 따로 받는다
//   · 장기요양은 건강보험료에 연동되므로 따로 적지 않는다
//   · 고용보험은 그 달 과세급여 기준이라 여기서 다루지 않는다
export function insBaseOf(workData, taxableGross) {
  const wd = workData || {}
  const pen = Math.max(0, Number(wd._insBasePension) || 0)
  const hea = Math.max(0, Number(wd._insBaseHealth) || 0)
  return {
    pension: pen > 0 ? pen : taxableGross,
    health:  hea > 0 ? hea : (pen > 0 ? pen : taxableGross),
    custom:  pen > 0 || hea > 0,
  }
}
