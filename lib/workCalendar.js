// ── 근무기록 확인서(근무 달력) 인쇄용 HTML ──
// 지점 화면(한 명)과 관리자 화면(여러 명을 한 파일에)에서 같은 모양을 쓰려고 떼어냈다.
// 한 사람 = 한 페이지. 칸을 납작하게 만들어 5~6주짜리 달도 A4 가로 한 장에 들어간다.

// 화면 달력과 같은 일~토 묶음 (주휴수당 계산용 월~일 과는 다름 — 표시 전용)
export function displayWeeks(year, month) {
  const lastDay = new Date(year, month, 0)
  const weeks = []
  let cur = new Date(year, month - 1, 1)
  cur = new Date(cur.getTime() - cur.getDay() * 86400000)
  while (cur <= lastDay) {
    const wk = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(cur.getTime() + i * 86400000)
      wk.push(d.getMonth() + 1 === month ? d.getDate() : null)
    }
    if (wk.some(d => d !== null)) weeks.push(wk)
    cur = new Date(cur.getTime() + 7 * 86400000)
  }
  return weeks
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const n2 = (x) => Math.round((Number(x) || 0) * 100) / 100
const fmt = (x) => Number(x || 0).toLocaleString()

// 하루치 시간 꺼내기 — 지점 화면 calcTotal 과 같은 기준
//   직원의 '휴'(휴일근로)만 휴일 칸을 쓰고, 그 외에는 일반 칸을 쓴다.
function dayHours(d, isStaff) {
  const t = d?.type || '평'
  if (!d || t === '공' || t === '연' || t === '결') return null
  const hol = t === '휴'
  return {
    hol,
    day: n2(hol ? d.holidayDaytimeH : d.daytimeH),
    night: n2(hol ? d.holidayNightH : d.nightH),
    rest: n2(hol ? d.holidayRestH : d.restH),
  }
}

// 한 사람분 본문 (제목 + 주차표 + 합계 + 서명란)
function personPage(p) {
  const { year, month, name, empType, corpName, branch, workData, weekly } = p
  const isStaff = empType === '직원'
  const tot = { day: 0, night: 0, rest: 0, days: 0, absent: 0 }

  const blocks = displayWeeks(year, month).map((week, wi) => {
    let wDay = 0, wNight = 0
    const cells = week.map(dnum => {
      if (dnum === null) return '<td class="k off"></td>'
      const ds = `${year}-${String(month).padStart(2, '0')}-${String(dnum).padStart(2, '0')}`
      const d = workData?.[ds]
      const t = d?.type
      const h = dayHours(d, isStaff)
      if (!h) {
        const lbl = t === '결' ? '결근' : t === '연' ? '연차' : '휴무'
        if (t === '결') tot.absent++
        return `<td class="k rest"><b>${dnum}</b><div class="rl ${t === '결' ? 'ab' : ''}">${lbl}</div></td>`
      }
      wDay += h.day; wNight += h.night
      tot.day += h.day; tot.night += h.night; tot.rest += h.rest
      if (h.day + h.night > 0) tot.days++
      return `<td class="k${h.hol ? ' hol' : ''}">
        <b>${dnum}</b>${h.hol ? '<span class="ht">휴일</span>' : ''}
        <div class="tm">${esc(d.timeStart || '')}~${esc(d.timeEnd || '')}</div>
        <div class="hr">주 ${h.day} · 야 ${h.night} · 휴게 ${h.rest}</div>
        <div class="dt">${n2(h.day + h.night)}시간</div></td>`
    }).join('')
    return `<table class="wk"><tr class="wh"><th class="wn">${wi + 1}주</th>${DAY_LABELS.map(l => `<th>${l}</th>`).join('')}</tr>
      <tr><td class="wn"></td>${cells}</tr>
      <tr><td class="sm" colspan="8">근무 ${n2(wDay + wNight)}시간 · 주간 ${n2(wDay)} · 야간 ${n2(wNight)}</td></tr></table>`
  }).join('')

  const whBlock = (!isStaff && weekly && weekly.list?.length)
    ? `<div class="tot">주휴수당 <b>${fmt(weekly.total)}원</b> <span class="mu">— 주 단위는 월요일~일요일 기준</span>
         &nbsp; ${weekly.list.map(x => `${x.from}~${x.to}일 ${x.pay > 0 ? fmt(x.pay) + '원' : '미적용'}`).join(' · ')}</div>`
    : ''

  return `<section class="pg">
    <h1>${year}년 ${month}월 근무기록 확인서</h1>
    <div class="sub">${esc(corpName || '')}${branch ? ` ${esc(branch)}` : ''} · <b>${esc(name || '')}</b>${empType ? ` (${esc(empType)})` : ''}</div>
    ${blocks}
    <div class="tot">월 근무일 ${tot.days}일 · 총 근무 <b>${n2(tot.day + tot.night)}시간</b>
      (주간 ${n2(tot.day)} · 야간 ${n2(tot.night)} · 휴게 ${n2(tot.rest)})${tot.absent ? ` · 결근 ${tot.absent}일` : ''}</div>
    ${whBlock}
    <div class="sign">위 근무기록이 실제 근무와 같음을 확인합니다. &nbsp;&nbsp;
      확인일 ____ . ____ . ____ &nbsp;&nbsp; 성명 <span class="line"></span> (서명)</div>
  </section>`
}

// people: [{ year, month, name, empType, corpName, branch, workData, weekly? }]
export function buildWorkCalendarHtml(people, docTitle) {
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${esc(docTitle)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { font-family:'Malgun Gothic','맑은 고딕',sans-serif; color:#111; background:#fff; font-size:9.5px; }
  /* 한 사람 = 한 페이지 */
  .pg { padding:10px 12px; page-break-after:always; break-after:page; }
  .pg:last-child { page-break-after:auto; break-after:auto; }
  h1 { font-size:15px; font-weight:700; margin-bottom:2px; }
  .sub { font-size:10.5px; color:#444; margin-bottom:7px; }
  table.wk { width:100%; border-collapse:collapse; margin-bottom:4px; table-layout:fixed; page-break-inside:avoid; }
  table.wk th, table.wk td { border:1px solid #c9c4ba; }
  tr.wh th { background:#efece6; font-size:9px; font-weight:700; padding:2px 0; }
  th.wn, td.wn { width:5.5%; background:#e4e0d8; }
  td.k { vertical-align:top; height:52px; padding:2px 4px; }
  td.k.off { background:#f6f5f2; }
  td.k.rest { background:#f2f1ee; text-align:center; }
  td.k.hol { background:#fdf4f4; }
  td.k b { font-size:10px; }
  .ht { font-size:8px; color:#c0504a; margin-left:2px; font-weight:600; }
  .rl { margin-top:14px; color:#8a8378; }
  .rl.ab { color:#d04a4a; font-weight:700; }
  .tm { font-size:8.5px; color:#555; margin:1px 0; }
  .hr { font-size:8.5px; border-top:1px dotted #ddd; padding-top:1px; }
  .dt { text-align:right; font-size:9px; font-weight:700; color:#8a6d2f; }
  td.sm { background:#f7f6f3; padding:2px 6px; font-size:9px; }
  .tot { margin-top:5px; border:1px solid #c9c4ba; padding:5px 8px; background:#faf9f6; font-size:10px; }
  .mu { color:#888; }
  .sign { margin-top:7px; border:1px solid #c9c4ba; padding:7px 9px; font-size:9.5px; }
  .sign .line { display:inline-block; border-bottom:1px solid #888; min-width:110px; }
  @page { size:A4 landscape; margin:8mm; }
</style></head><body>
${people.map(personPage).join('\n')}
<script>window.onload=function(){window.print()}</script>
</body></html>`
}
