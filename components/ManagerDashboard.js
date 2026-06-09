import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BRANCHES = ['광명GIDC점', '인계점', '안양일번가점', '익산점', '인천주안점', '하남점']
const ALL = '전체 지점'

// ── 전 지점 통합 관리 대시보드 (재사용 컴포넌트) ──
// manager.js(별도 페이지)와 index.js(메인 앱의 관리자 화면) 양쪽에서 공통 사용.
// 로그인/인증은 부모가 처리. onBack(선택): 상단 뒤로가기 버튼 표시.
export default function ManagerDashboard({ onBack }) {
  const [branch, setBranch] = useState(ALL)   // 기본은 전 지점 통합 대시보드
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [view, setView] = useState('summary')      // summary | transfer
  const [sevOpen, setSevOpen] = useState(false)     // 퇴직금 계산기 팝업
  const [statusMap, setStatusMap] = useState({})    // { [recId]: '작성중'|'수정중'|'확정'|'이체완료' }
  const [onlyPending, setOnlyPending] = useState(false)
  const [txUnavailable, setTxUnavailable] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  // 퇴직금 계산
  const [sevBranch, setSevBranch] = useState('')
  const [sevEmps, setSevEmps] = useState([])        // [{name, hire, resign}]
  const [sevEmp, setSevEmp] = useState('')
  const [sevHire, setSevHire] = useState('')
  const [sevResign, setSevResign] = useState('')
  const [sevResult, setSevResult] = useState(null)
  const [sevLoading, setSevLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      let q = supabase.from('payroll').select('*').eq('year', year).eq('month', month)
      if (branch !== ALL) q = q.eq('branch', branch)
      const { data, error } = await q
        .order('branch', { ascending: true })
        .order('emp_name', { ascending: true })
      if (error) throw error
      setRecords(data || [])
    } catch (e) {
      console.error('데이터 로드 오류:', e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [branch, year, month])

  async function deleteRecord(id, name) {
    if (confirm(`${name} 님의 기록을 삭제하시겠습니까?`)) {
      const target = records.find(r => r.id === id)
      const { error } = await supabase.from('payroll').delete().eq('id', id)
      if (error) { alert('삭제 실패'); return }
      // 수정 이력 기록 (실패해도 무시 — 조회는 각 지점 페이지에서)
      try {
        fetch('/api/log', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            branch: target?.branch || branch, actor: '관리자', emp_name: name,
            year: target?.year, month: target?.month, action: '삭제',
            detail: `관리자 페이지에서 ${target?.year}년 ${target?.month}월 레코드 삭제`,
          }),
        }).catch(() => {})
      } catch (e) {}
      load()
    }
  }

  function fmt(n) { return Math.round(n || 0).toLocaleString('ko-KR') }

  // ── 옛 스냅샷 보정(표시용) ──
  function fixBasic(r) {
    if (r.emp_type === '직원' && !(r.basic_pay > 0) && r.hourly_wage > 0) {
      return Math.round(r.hourly_wage * 209)
    }
    return r.basic_pay || 0
  }
  function fixGrand(r) {
    const b = fixBasic(r)
    if (b === (r.basic_pay || 0)) return r.grand_total || 0
    return b
      + (r.weekly_holiday_pay || 0) + (r.overtime_pay || 0) + (r.night_pay || 0)
      + (r.holiday_pay || 0) + (r.holiday_overtime_pay || 0) + (r.holiday_night_pay || 0)
  }

  // ── 공제: 4대보험 / 원천세 분리 (2026 요율, 근로자 부담분) — 메인 앱과 동일 ──
  function recMajorIns(r) {   // 4대보험 (직원만)
    if (r.emp_type !== '직원') return 0
    const taxable = fixGrand(r)
    const pension    = Math.floor(taxable * 0.0475 / 10) * 10
    const health     = Math.floor(taxable * 0.03595 / 10) * 10
    const care       = Math.floor(health * 0.1314 / 10) * 10
    const employment = Math.floor(taxable * 0.009 / 10) * 10
    return pension + health + care + employment
  }
  function recWithholding(r) {   // 원천세 (직원: 소득세+지방세 / 알바: 3.3%)
    const taxable = fixGrand(r)
    if (r.emp_type === '직원') {
      const incomeTax = r.income_tax || 0
      const localTax  = Math.floor((incomeTax * 0.1) / 10) * 10
      return incomeTax + localTax
    }
    return Math.round(taxable * 0.03) + Math.round(taxable * 0.003)  // 3.3%
  }
  function recDeduction(r) { return recMajorIns(r) + recWithholding(r) }
  function recNet(r) { return fixGrand(r) + (r.meal_allowance || 0) - recDeduction(r) }

  // ── 실제 이체(입금)할 금액 = 명세서 '실지급액' (급여 페이지 calcDeductions 와 동일) ──
  //   실지급 = 세전지급액(grand_total) + 식대(비과세) − 공제총액
  //   공제총액은 직원/알바 구분이 아니라 각 직원에 설정된 deduction_type 기준:
  //     'none' → 공제 0 / '4대' → 4대보험+소득세+지방세 / '3.3' → 사업소득 3.3%
  function recDeductionTotal(r) {
    const dt = r.deduction_type || 'none'
    const gross = fixGrand(r)              // 과세 기준(식대 제외)
    if (dt === '4대') {
      const pension    = Math.floor(gross * 0.0475 / 10) * 10
      const health     = Math.floor(gross * 0.03595 / 10) * 10
      const care       = Math.floor(health * 0.1314 / 10) * 10
      const employment = Math.floor(gross * 0.009 / 10) * 10
      const incomeTax  = r.income_tax || 0
      const localTax   = Math.floor((incomeTax * 0.1) / 10) * 10
      return pension + health + care + employment + incomeTax + localTax
    }
    if (dt === '3.3') {
      return Math.round(gross * 0.03) + Math.round(gross * 0.003)   // 3.3%
    }
    return 0   // 'none' = 공제 없음 (세전 전액 지급)
  }
  function transferAmt(r) { return fixGrand(r) + (r.meal_allowance || 0) - recDeductionTotal(r) }

  // ── 이체 상태 (작성중 → 수정중 → 확정 → 이체완료 순환) ──
  const STATUS_ORDER = ['작성중', '수정중', '확정', '이체완료']
  const STATUS_LABEL = { '작성중': '작성중', '수정중': '수정중', '확정': '확정', '이체완료': '이체완료' }

  // records 가 바뀌면 DB 의 transfer_status 로 상태맵 초기화
  useEffect(() => {
    const m = {}
    for (const r of records) m[r.id] = r.transfer_status || '작성중'
    setStatusMap(m)
  }, [records])

  function txStatus(r) { return statusMap[r.id] || '작성중' }

  // ── 같은 계좌 = 한 번의 이체로 묶기 ──
  //   한 사람을 직원분 + 별도분(예: 김현준 / 김현준p3)으로 나눠 입력한 경우,
  //   같은 계좌번호면 한 줄로 합쳐 총 이체금액을 보여준다.
  function buildUnits(list) {
    const units = []
    const byAcct = {}
    for (const r of list) {
      const acct = (r.account_number || '').trim()
      if (acct) {
        if (!byAcct[acct]) { byAcct[acct] = { key: 'a:' + acct, recs: [], account: acct }; units.push(byAcct[acct]) }
        byAcct[acct].recs.push(r)
      } else {
        units.push({ key: 'r:' + r.id, recs: [r], account: '' })   // 계좌 미입력은 합치지 않음
      }
    }
    return units
  }
  function unitNames(u) {
    const names = [...new Set(u.recs.map(r => r.emp_name))]
    return names.join(' + ')
  }
  function unitAmt(u) { return u.recs.reduce((s, r) => s + transferAmt(r), 0) }
  // 유닛에 포함된 공제방식들(중복 제거). 한 사람을 4대+3.3 둘로 나눈 경우 둘 다 표시.
  const DED_LABEL = { '4대': '4대보험', '3.3': '3.3%', 'none': '공제없음' }
  function unitDedTypes(u) { return [...new Set(u.recs.map(r => r.deduction_type || 'none'))] }
  function unitIsAlba(u) { return u.recs.every(r => r.emp_type !== '직원') }
  function unitMixed(u) { return u.recs.length > 1 }
  // 유닛 상태 = 가장 덜 진행된 레코드 기준 (모두 이체완료여야 '이체완료')
  function unitStatus(u) {
    let idx = STATUS_ORDER.length - 1
    for (const r of u.recs) idx = Math.min(idx, STATUS_ORDER.indexOf(txStatus(r)))
    return STATUS_ORDER[idx < 0 ? 0 : idx]
  }

  async function cycleUnit(u) {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(unitStatus(u)) + 1) % STATUS_ORDER.length]
    setStatusMap(m => { const n = { ...m }; for (const r of u.recs) n[r.id] = next; return n })
    for (const r of u.recs) {
      const { error } = await supabase.from('payroll').update({ transfer_status: next }).eq('id', r.id)
      if (error) setTxUnavailable(true)
    }
  }

  async function copyAcct(u) {
    try {
      await navigator.clipboard.writeText(u.account || '')
      setCopiedId(u.key)
      setTimeout(() => setCopiedId(c => (c === u.key ? null : c)), 1500)
    } catch (e) {
      // 클립보드 권한이 없으면 무시
    }
  }

  // ── 퇴직금 계산 ──
  // 선택 지점의 직원 목록 + 저장된 입·퇴사일 불러오기
  async function loadSevEmps(b) {
    setSevEmps([]); setSevEmp(''); setSevHire(''); setSevResign(''); setSevResult(null)
    if (!b) return
    const { data } = await supabase
      .from('payroll').select('emp_name, hire_date, resign_date, year, month')
      .eq('branch', b).order('year', { ascending: false }).order('month', { ascending: false })
    const map = {}
    for (const r of (data || [])) {
      if (!map[r.emp_name]) map[r.emp_name] = { name: r.emp_name, hire: r.hire_date || '', resign: r.resign_date || '' }
      else {
        if (!map[r.emp_name].hire && r.hire_date) map[r.emp_name].hire = r.hire_date
        if (!map[r.emp_name].resign && r.resign_date) map[r.emp_name].resign = r.resign_date
      }
    }
    setSevEmps(Object.values(map))
  }
  function pickSevEmp(name) {
    setSevEmp(name); setSevResult(null)
    const e = sevEmps.find(x => x.name === name)
    setSevHire(e?.hire || ''); setSevResign(e?.resign || '')
  }
  async function calcSeverance() {
    if (!sevBranch || !sevEmp || !sevHire) { alert('지점·직원·입사일을 확인해 주세요.'); return }
    setSevLoading(true); setSevResult(null)
    try {
      const { data } = await supabase
        .from('payroll').select('*').eq('branch', sevBranch).eq('emp_name', sevEmp)
        .order('year', { ascending: false }).order('month', { ascending: false })
      const recs = data || []
      if (recs.length === 0) { alert('해당 직원의 급여 데이터가 없어 계산할 수 없습니다.'); setSevLoading(false); return }
      // 퇴사일(없으면 오늘) 기준 직전 3개월(퇴사월 제외)
      const resignD = sevResign ? new Date(sevResign) : new Date()
      const rY = resignD.getFullYear(), rM = resignD.getMonth() + 1
      const wanted = []
      let y = rY, m = rM - 1
      for (let i = 0; i < 3; i++) { if (m < 1) { m = 12; y-- } wanted.push({ y, m }); m-- }
      let used = wanted.map(w => recs.find(r => r.year === w.y && r.month === w.m)).filter(Boolean)
      if (used.length < 3) {   // 직전 3개월 데이터가 부족하면 가장 최근 급여로 채움
        const extra = recs.filter(r => !used.includes(r)).slice(0, 3 - used.length)
        used = [...used, ...extra]
      }
      const wageSum = used.reduce((s, r) => s + fixGrand(r) + (r.meal_allowance || 0), 0)
      const daysSum = used.reduce((s, r) => s + new Date(r.year, r.month, 0).getDate(), 0)
      const avgDaily = daysSum > 0 ? wageSum / daysSum : 0
      const hireD = new Date(sevHire)
      const serviceDays = Math.max(0, Math.floor((resignD - hireD) / 86400000))
      const severance = avgDaily * 30 * (serviceDays / 365)
      setSevResult({ used, wageSum, daysSum, avgDaily, serviceDays, severance, eligible: serviceDays >= 365 })
    } catch (e) {
      alert('계산 오류: ' + e.message)
    } finally {
      setSevLoading(false)
    }
  }

  // ── 전 지점 집계 ──
  const byBranch = BRANCHES.map(b => {
    const rs = records.filter(r => r.branch === b)
    return {
      branch: b,
      count: rs.length,
      staff: rs.filter(r => r.emp_type === '직원').length,
      alba: rs.filter(r => r.emp_type !== '직원').length,
      total: rs.reduce((s, r) => s + fixGrand(r), 0),
      staffTotal: rs.filter(r => r.emp_type === '직원').reduce((s, r) => s + fixGrand(r), 0),
      albaTotal: rs.filter(r => r.emp_type !== '직원').reduce((s, r) => s + fixGrand(r), 0),
      staffNet: rs.filter(r => r.emp_type === '직원').reduce((s, r) => s + recNet(r), 0),
      albaNet: rs.filter(r => r.emp_type !== '직원').reduce((s, r) => s + recNet(r), 0),
      finalCount: rs.filter(r => r.status === 'final').length,
    }
  })
  const grandAll = byBranch.reduce((s, x) => s + x.total, 0)
  const staffAll = byBranch.reduce((s, x) => s + x.staffTotal, 0)
  const albaAll = byBranch.reduce((s, x) => s + x.albaTotal, 0)
  const staffNetAll = byBranch.reduce((s, x) => s + x.staffNet, 0)
  const albaNetAll = byBranch.reduce((s, x) => s + x.albaNet, 0)
  const netAll = staffNetAll + albaNetAll
  const majorAll = records.reduce((s, r) => s + recMajorIns(r), 0)     // 4대보험 공제 합계
  const withholdAll = records.reduce((s, r) => s + recWithholding(r), 0) // 원천세 공제 합계
  const totalPeople = byBranch.reduce((s, x) => s + x.count, 0)
  const totalFinal = byBranch.reduce((s, x) => s + x.finalCount, 0)

  // 현재(단일 지점) 집계
  const totalGrand = records.reduce((s, r) => s + fixGrand(r), 0)
  const curStaff = records.filter(r => r.emp_type === '직원').length
  const curAlba = records.filter(r => r.emp_type !== '직원').length
  const curStaffTotal = records.filter(r => r.emp_type === '직원').reduce((s, r) => s + fixGrand(r), 0)
  const curAlbaTotal = records.filter(r => r.emp_type !== '직원').reduce((s, r) => s + fixGrand(r), 0)
  const curStaffNet = records.filter(r => r.emp_type === '직원').reduce((s, r) => s + recNet(r), 0)
  const curAlbaNet = records.filter(r => r.emp_type !== '직원').reduce((s, r) => s + recNet(r), 0)
  const curMajor = records.reduce((s, r) => s + recMajorIns(r), 0)
  const curWithhold = records.reduce((s, r) => s + recWithholding(r), 0)
  const curFinal = records.filter(r => r.status === 'final').length

  // ── 전 지점 요약 엑셀(CSV) 내보내기 — 보고용 ──
  function downloadSummary() {
    const BOM = '﻿'
    const head = ['지점', '총인원', '직원수', '알바수', '직원지급액', '직원실지급', '알바지급액', '알바실지급', '세전인건비', '실지급합계', '마감완료', '전체대비']
    const lines = byBranch.map(x =>
      [x.branch, x.count, x.staff, x.alba, x.staffTotal, x.staffNet, x.albaTotal, x.albaNet, x.total, x.staffNet + x.albaNet, `${x.finalCount}/${x.count}`,
       x.count > 0 ? `${Math.round(x.finalCount / x.count * 100)}%` : '-']
        .map(v => `"${v}"`).join(','))
    const totalLine = ['전체 합계', totalPeople,
      byBranch.reduce((s, x) => s + x.staff, 0), byBranch.reduce((s, x) => s + x.alba, 0),
      staffAll, staffNetAll, albaAll, albaNetAll, grandAll, netAll, `${totalFinal}/${totalPeople}`,
      totalPeople > 0 ? `${Math.round(totalFinal / totalPeople * 100)}%` : '-']
      .map(v => `"${v}"`).join(',')
    const csv = BOM + [
      `"${year}년 ${month}월 전 지점 인건비 요약"`, '',
      `"세전 인건비(월급)","${grandAll}","4대보험 공제","${majorAll}","원천세 공제","${withholdAll}","실지급 합계","${netAll}"`, '',
      head.map(v => `"${v}"`).join(','),
      ...lines, totalLine,
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `전지점_인건비요약_${year}년${month}월.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const css = `
    .md-wrap { max-width: 920px; margin: 0 auto; padding: 24px 18px 48px; font-family: 'Pretendard', 'DM Sans', sans-serif; color: #1a1a1a; }

    .md-back { background: #fff; border: 1px solid #e0ddd6; color: #555; font-size: 13px; cursor: pointer; padding: 8px 14px; border-radius: 8px; font-family: inherit; font-weight: 600; margin-bottom: 16px; }
    .md-back:hover { border-color: #1a1a1a; color: #1a1a1a; }

    /* 헤더 */
    .md-header { margin-bottom: 18px; }
    .md-brand { font-size: 10px; letter-spacing: 0.2em; color: #b8954a; margin-bottom: 4px; }
    .md-title { font-weight: 700; font-size: 20px; color: #1a1a1a; }
    .md-title span { color: #b8954a; }

    /* 필터 */
    .md-filter { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .md-select {
      flex: 1; min-width: 100px;
      background: #fff; border: 1px solid #d0ccc5; color: #1a1a1a;
      border-radius: 8px; padding: 10px 12px; font-size: 13px;
      font-family: 'Pretendard', 'DM Sans', sans-serif; outline: none;
    }
    .md-select:focus { border-color: #b8954a; }
    .md-refresh {
      background: #fff; border: 1px solid #d0ccc5; border-radius: 8px;
      padding: 10px 16px; font-size: 12px; cursor: pointer;
      font-family: 'Pretendard', 'DM Sans', sans-serif; color: #666;
      display: flex; align-items: center; gap: 6px; white-space: nowrap;
    }
    .md-refresh:hover { border-color: #1a1a1a; color: #1a1a1a; }

    /* 히어로(월급/공제 요약) — 밝은 크림/골드 톤 */
    .md-hero { background: #fff; border: 1px solid #ebe9e4; border-radius: 14px; padding: 22px 24px; margin-bottom: 12px; }
    .md-hero-label { font-size: 11px; letter-spacing: 0.1em; color: #999; margin-bottom: 6px; }
    .md-hero-val { font-size: 30px; font-weight: 700; color: #1a1a1a; letter-spacing: -0.01em; }
    .md-hero-val small { font-size: 14px; font-weight: 500; color: #b8954a; margin-left: 3px; }
    /* 공제 구분 (월급/4대보험/원천세/실지급) */
    .md-breakdown { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 16px; }
    .md-bd-item { background: #faf8f3; border: 1px solid #efeadd; border-radius: 10px; padding: 12px 14px; }
    .md-bd-k { font-size: 11px; color: #999; margin-bottom: 4px; }
    .md-bd-v { font-size: 16px; font-weight: 700; color: #1a1a1a; }
    .md-net { display: flex; justify-content: space-between; align-items: baseline; margin-top: 14px; padding-top: 14px; border-top: 1px solid #f0ede8; }
    .md-net-k { font-size: 12px; color: #999; }
    .md-net-v { font-size: 21px; font-weight: 700; color: #b8954a; }
    .md-split { display: flex; flex-direction: column; gap: 5px; margin-top: 12px; }
    .md-split span { font-size: 11.5px; color: #777; display: flex; align-items: center; }
    .md-split .dot { width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; display: inline-block; flex: none; }
    .md-split .dot.staff { background: #b8954a; }
    .md-split .dot.alba { background: #c4c0b8; }

    /* 보조 KPI 2개 */
    .md-kpi-mini { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
    .md-kpi { background: #fff; border: 1px solid #ebe9e4; border-radius: 12px; padding: 15px 16px; }
    .md-kpi-label { font-size: 10.5px; letter-spacing: 0.1em; color: #999; margin-bottom: 6px; }
    .md-kpi-val { font-size: 20px; font-weight: 700; color: #1a1a1a; }
    .md-kpi-val small { font-size: 12px; font-weight: 500; color: #999; margin-left: 2px; }

    /* 섹션 제목 + 내보내기 */
    .md-sec-head { display: flex; justify-content: space-between; align-items: center; margin: 4px 2px 10px; }
    .md-sec-title { font-size: 13px; font-weight: 700; color: #555; letter-spacing: 0.04em; }
    .md-export {
      background: #b8954a; border: none; border-radius: 8px; color: #fff;
      padding: 8px 13px; font-size: 11.5px; font-weight: 600; cursor: pointer;
      font-family: 'Pretendard', sans-serif; letter-spacing: 0.03em;
    }
    .md-export:hover { background: #a07f3a; }

    /* 지점별 비교 행 */
    .md-branch-row {
      background: #fff; border: 1px solid #ebe9e4; border-radius: 12px;
      padding: 15px 16px; margin-bottom: 9px; cursor: pointer;
      display: flex; align-items: center; gap: 14px; transition: all 0.15s;
    }
    .md-branch-row:hover { border-color: #b8954a; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(0,0,0,0.05); }
    .md-branch-row.empty { opacity: 0.55; }
    .md-br-main { flex: 1; min-width: 0; }
    .md-br-name { font-size: 15px; font-weight: 700; color: #1a1a1a; margin-bottom: 3px; }
    .md-br-meta { font-size: 11.5px; color: #999; }
    .md-br-right { text-align: right; }
    .md-br-amt { font-size: 16px; font-weight: 700; color: #b8954a; letter-spacing: -0.01em; }
    .md-br-amt small { font-size: 11px; color: #bbb; font-weight: 500; }
    .md-br-split { font-size: 10.5px; color: #aaa; margin-top: 3px; }
    .md-br-prog { margin-top: 5px; display: flex; align-items: center; gap: 6px; justify-content: flex-end; }
    .md-br-prog-bar { width: 60px; height: 5px; border-radius: 3px; background: #eee; overflow: hidden; }
    .md-br-prog-fill { height: 100%; background: #2ecc71; border-radius: 3px; }
    .md-br-prog-txt { font-size: 10px; color: #aaa; }
    .md-br-chev { color: #ccc; font-size: 18px; }

    /* 합계 카드 (단일 지점) */
    .md-summary-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 12px; }
    .md-summary-card { background: #fff; border: 1px solid #ebe9e4; border-radius: 10px; padding: 14px 16px; }
    .md-summary-label { font-size: 10px; letter-spacing: 0.1em; color: #999; margin-bottom: 6px; }
    .md-summary-val { font-size: 18px; font-weight: 700; color: #1a1a1a; }
    .md-summary-val.gold { color: #b8954a; }
    .md-summary-val small { font-size: 11px; color: #aaa; font-weight: 500; }

    /* 단일 지점 공제 구분 */
    .md-cur-bd { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 12px; }
    .md-cur-card { background: #fff; border: 1px solid #ebe9e4; border-radius: 10px; padding: 12px 14px; text-align: center; }
    .md-cur-k { font-size: 10.5px; color: #999; margin-bottom: 4px; }
    .md-cur-v { font-size: 15px; font-weight: 700; color: #1a1a1a; }

    /* 직원/알바 금액 분리 (단일 지점) */
    .md-split-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
    .md-split-card { background: #fff; border: 1px solid #ebe9e4; border-radius: 10px; padding: 14px 16px; }
    .md-split-tag { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; padding: 3px 9px; border-radius: 20px; margin-bottom: 8px; }
    .md-split-tag.staff { background: #e3dfd5; color: #6b6253; }
    .md-split-tag.alba { background: #ece0c9; color: #9c7f44; }
    .md-split-line { display: flex; justify-content: space-between; align-items: baseline; padding: 3px 0; }
    .md-split-k { font-size: 11px; color: #999; letter-spacing: 0.04em; }
    .md-split-v { font-size: 16px; font-weight: 700; color: #1a1a1a; }
    .md-split-v.gold { color: #b8954a; }

    .md-back-inline { background: none; border: none; color: #888; font-size: 13px; cursor: pointer; padding: 4px 0; margin-bottom: 10px; font-family: 'Pretendard', sans-serif; font-weight: 500; }
    .md-back-inline:hover { color: #1a1a1a; }

    /* 직원 카드 */
    .md-emp { background: #fff; border: 1px solid #ebe9e4; border-radius: 12px; padding: 16px; margin-bottom: 10px; position: relative; }
    .md-emp-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
    .md-badge { font-size: 10px; font-weight: 600; letter-spacing: 0.1em; padding: 3px 8px; border-radius: 20px; margin-bottom: 4px; display: inline-block; }
    .md-badge.staff { background: #e3dfd5; color: #6b6253; }
    .md-badge.alba { background: #ece0c9; color: #9c7f44; }
    .md-emp-name { font-size: 17px; font-weight: 700; color: #1a1a1a; }
    .md-status { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .md-dot { width: 12px; height: 12px; border-radius: 50%; }
    .md-dot.final { background: #2ecc71; box-shadow: 0 0 8px #2ecc71; }
    .md-dot.saved { background: #f1c40f; box-shadow: 0 0 8px #f1c40f; }
    .md-status-lbl { font-size: 10px; font-weight: 600; }
    .md-status-lbl.final { color: #2ecc71; }
    .md-status-lbl.saved { color: #f39c12; }
    .md-pay-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
    .md-pay-label { font-size: 10px; color: #999; letter-spacing: 0.08em; margin-bottom: 2px; }
    .md-pay-val { font-size: 13px; font-weight: 600; color: #1a1a1a; }
    .md-emp-foot { border-top: 1px solid #f0ede8; padding-top: 12px; display: flex; justify-content: space-between; align-items: center; }
    .md-total-lbl { font-size: 11px; color: #999; letter-spacing: 0.1em; }
    .md-total-val { font-size: 22px; color: #b8954a; font-weight: 700; letter-spacing: -0.01em; }
    .md-del { position: absolute; top: 14px; right: 14px; background: none; border: none; color: #ddd; font-size: 16px; cursor: pointer; padding: 2px 6px; }
    .md-del:hover { color: #e05555; }

    .md-empty { text-align: center; color: #bbb; padding: 40px 0; font-size: 13px; letter-spacing: 0.05em; }
    .md-loading { text-align: center; color: #bbb; padding: 40px 0; font-size: 12px; letter-spacing: 0.1em; }

    /* 보기 전환 탭 */
    .md-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
    .md-tab {
      flex: 1; background: #fff; border: 1px solid #e0ddd6; color: #888;
      border-radius: 10px; padding: 11px 12px; font-size: 13px; font-weight: 600;
      cursor: pointer; font-family: 'Pretendard', 'DM Sans', sans-serif; transition: all 0.15s;
    }
    .md-tab:hover { border-color: #b8954a; color: #1a1a1a; }
    .md-tab.on { background: #b8954a; border-color: #b8954a; color: #fff; }

    /* ───── 이체 처리 ───── */
    .tx-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
    .tx-stat { background: #fff; border: 1px solid #ebe9e4; border-radius: 12px; padding: 16px 18px; }
    .tx-stat-k { font-size: 11px; letter-spacing: 0.06em; color: #999; margin-bottom: 7px; }
    .tx-stat-v { font-size: 22px; font-weight: 700; color: #1a1a1a; letter-spacing: -0.01em; }
    .tx-stat-v small { font-size: 12px; font-weight: 500; color: #aaa; margin-left: 3px; }
    .tx-stat-v.done { color: #1f9d57; }
    .tx-stat-v.remain { color: #d99021; }
    .tx-stat-v.gold { color: #b8954a; }
    .tx-stat-bar { margin-top: 10px; height: 6px; border-radius: 4px; background: #eee; overflow: hidden; }
    .tx-stat-fill { height: 100%; background: #2ecc71; border-radius: 4px; transition: width 0.3s; }

    .tx-bar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 6px; padding: 0 2px; }
    .tx-legend { display: flex; flex-wrap: wrap; gap: 12px; }
    .tx-leg { font-size: 11.5px; color: #777; display: flex; align-items: center; }
    .tx-chip { width: 12px; height: 12px; border-radius: 4px; margin-right: 5px; display: inline-block; border: 1px solid rgba(0,0,0,0.08); }
    .tx-toggle { font-size: 12px; color: #666; display: flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; }
    .tx-toggle input { width: 15px; height: 15px; accent-color: #b8954a; cursor: pointer; }

    /* 상태별 색상 칩 (작성중=주황 / 수정중=흰색 / 확정=노랑 / 이체완료=초록) */
    .tx-chip.작성중 { background: #f6b26b; }
    .tx-chip.수정중 { background: #ffffff; }
    .tx-chip.확정   { background: #ffe066; }
    .tx-chip.이체완료 { background: #57c98a; }

    .tx-hint { font-size: 11.5px; color: #aaa; margin: 4px 2px 12px; }
    .tx-warn { font-size: 12px; color: #b06a1a; background: #fdf3e6; border: 1px solid #f0d8b8; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; }
    .tx-warn b { font-family: monospace; }

    .tx-group { margin-bottom: 16px; }
    .tx-group-head { display: flex; justify-content: space-between; align-items: baseline; padding: 0 4px 7px; }
    .tx-group-name { font-size: 13px; font-weight: 700; color: #1a1a1a; }
    .tx-group-meta { font-size: 11.5px; color: #999; }

    .tx-row {
      display: flex; align-items: center; gap: 10px;
      background: #fff; border: 1px solid #ebe9e4; border-left-width: 5px;
      border-radius: 10px; padding: 11px 13px; margin-bottom: 7px;
    }
    /* 행 왼쪽 컬러 바 = 상태색 */
    .tx-row.st-작성중 { border-left-color: #f6b26b; }
    .tx-row.st-수정중 { border-left-color: #d8d4cc; }
    .tx-row.st-확정   { border-left-color: #ffe066; }
    .tx-row.st-이체완료 { border-left-color: #57c98a; background: #f4fbf6; }

    .tx-status {
      flex: none; width: 70px; padding: 7px 0; border-radius: 7px;
      font-size: 11.5px; font-weight: 700; cursor: pointer; font-family: inherit;
      border: 1px solid rgba(0,0,0,0.08); transition: all 0.12s;
    }
    .tx-status.작성중 { background: #f6b26b; color: #6b3d12; }
    .tx-status.수정중 { background: #ffffff; color: #777; }
    .tx-status.확정   { background: #ffe066; color: #7a6512; }
    .tx-status.이체완료 { background: #57c98a; color: #fff; }
    .tx-status:hover { filter: brightness(0.96); transform: translateY(-1px); }

    .tx-name-wrap { flex: none; width: 120px; display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
    .tx-name { font-size: 14px; font-weight: 700; color: #1a1a1a; }
    .tx-pt { font-size: 9px; font-weight: 700; color: #9c7f44; background: #ece0c9; padding: 1px 5px; border-radius: 10px; white-space: nowrap; }
    .tx-pt.merge { color: #2b6cb0; background: #dbeafe; }

    .tx-ded-wrap { flex: none; width: 92px; display: flex; flex-wrap: wrap; gap: 4px; }
    .tx-ded { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 10px; white-space: nowrap; border: 1px solid transparent; }
    .tx-ded.four { color: #2b6cb0; background: #dbeafe; }      /* 4대보험 = 파랑 */
    .tx-ded.three { color: #0a7a6b; background: #cffaf0; }     /* 3.3% = 청록 */
    .tx-ded.none { color: #c0392b; background: #fdecea; border-color: #f5c6c0; }  /* 공제없음 = 빨강(주의) */

    .tx-acct-wrap { flex: 1; min-width: 0; display: flex; align-items: center; gap: 7px; }
    .tx-acct { font-size: 12px; color: #555; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tx-copy { flex: none; background: #f3f1ec; border: 1px solid #e0ddd6; color: #777; font-size: 10.5px; font-weight: 600; padding: 4px 8px; border-radius: 6px; cursor: pointer; font-family: inherit; }
    .tx-copy:hover { border-color: #b8954a; color: #b8954a; }

    .tx-amt { flex: none; text-align: right; font-size: 15px; font-weight: 700; color: #1a1a1a; letter-spacing: -0.01em; min-width: 84px; }
    .tx-amt small { font-size: 10.5px; color: #bbb; font-weight: 500; margin-left: 2px; }

    /* ───── 퇴직금 계산기 (떠있는 버튼 + 팝업) ───── */
    .sev-fab {
      position: fixed; right: 24px; bottom: 24px; z-index: 50;
      display: flex; align-items: center; gap: 8px;
      background: linear-gradient(135deg, #cdaa5d, #b8954a); color: #fff;
      border: none; border-radius: 999px; padding: 12px 20px 12px 16px; cursor: pointer;
      box-shadow: 0 6px 20px rgba(184,149,74,0.45); font-family: 'Pretendard', sans-serif;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .sev-fab:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(184,149,74,0.55); }
    .sev-fab-ico { font-size: 22px; line-height: 1; }
    .sev-fab-txt { font-size: 12px; font-weight: 700; line-height: 1.15; text-align: left; letter-spacing: 0.02em; }

    .sev-overlay {
      position: fixed; inset: 0; z-index: 60; background: rgba(26,22,16,0.45);
      display: flex; align-items: flex-start; justify-content: center; padding: 40px 16px;
      overflow-y: auto; backdrop-filter: blur(2px);
      animation: sev-fade 0.15s ease;
    }
    @keyframes sev-fade { from { opacity: 0 } to { opacity: 1 } }
    .sev-panel {
      width: 100%; max-width: 460px; background: #faf8f3; border-radius: 18px;
      padding: 22px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); margin: auto 0;
      animation: sev-pop 0.18s ease;
    }
    @keyframes sev-pop { from { transform: translateY(12px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
    .sev-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
    .sev-head-ico { font-size: 26px; margin-bottom: 6px; }
    .sev-head-title { font-size: 19px; font-weight: 700; color: #1a1a1a; margin: 0 0 4px; }
    .sev-head-sub { font-size: 12px; color: #999; margin: 0; line-height: 1.5; }
    .sev-close { background: #fff; border: 1px solid #e0ddd6; color: #888; font-size: 15px; cursor: pointer; width: 32px; height: 32px; border-radius: 9px; flex: none; }
    .sev-close:hover { border-color: #1a1a1a; color: #1a1a1a; }

    /* ───── 퇴직금 폼/결과 (팝업 내부) ───── */
    .sv-form { background: #fff; border: 1px solid #ebe9e4; border-radius: 14px; padding: 18px 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px 14px; }
    .sv-field { display: flex; flex-direction: column; gap: 5px; }
    .sv-field label { font-size: 11px; font-weight: 600; color: #999; letter-spacing: 0.04em; }
    .sv-field select, .sv-field input {
      border: 1px solid #d0ccc5; border-radius: 8px; padding: 10px 12px; font-size: 13px;
      font-family: 'Pretendard', 'DM Sans', sans-serif; color: #1a1a1a; background: #fff; outline: none;
    }
    .sv-field select:focus, .sv-field input:focus { border-color: #b8954a; }
    .sv-field select:disabled { background: #f5f4f1; color: #bbb; }
    .sv-calc {
      grid-column: 1 / -1; margin-top: 4px; background: #b8954a; border: none; color: #fff;
      border-radius: 9px; padding: 13px; font-size: 14px; font-weight: 700; cursor: pointer;
      font-family: 'Pretendard', sans-serif; letter-spacing: 0.03em;
    }
    .sv-calc:hover { background: #a07f3a; }
    .sv-calc:disabled { background: #cfc7b5; cursor: default; }

    .sv-note { font-size: 11.5px; color: #999; line-height: 1.6; margin: 12px 4px; padding: 11px 13px; background: #faf8f3; border: 1px solid #efeadd; border-radius: 9px; }
    .sv-note b { color: #b06a1a; }

    .sv-result { background: #fff; border: 1px solid #ebe9e4; border-radius: 14px; padding: 20px; margin-top: 6px; }
    .sv-warn { font-size: 12px; color: #c0392b; background: #fdecea; border: 1px solid #f5c6c0; border-radius: 8px; padding: 10px 12px; margin-bottom: 14px; line-height: 1.5; }
    .sv-big { text-align: center; padding: 8px 0 18px; border-bottom: 1px solid #f0ede8; margin-bottom: 14px; }
    .sv-big-k { font-size: 12px; letter-spacing: 0.1em; color: #999; margin-bottom: 6px; }
    .sv-big-v { font-size: 34px; font-weight: 700; color: #b8954a; letter-spacing: -0.01em; }
    .sv-big-v small { font-size: 15px; font-weight: 500; color: #c9b78c; margin-left: 4px; }
    .sv-rows { display: flex; flex-direction: column; gap: 1px; background: #f0ede8; border-radius: 10px; overflow: hidden; }
    .sv-r { display: flex; justify-content: space-between; align-items: center; background: #fff; padding: 11px 14px; }
    .sv-r span { font-size: 12.5px; color: #777; }
    .sv-r b { font-size: 14px; font-weight: 700; color: #1a1a1a; }
    .sv-formula { font-size: 11.5px; color: #aaa; text-align: center; margin: 12px 0; font-family: 'DM Sans', monospace; }
    .sv-used { border-top: 1px solid #f0ede8; padding-top: 14px; }
    .sv-used-h { font-size: 11px; font-weight: 600; color: #999; letter-spacing: 0.04em; margin-bottom: 8px; }
    .sv-used-r { display: flex; justify-content: space-between; padding: 6px 2px; font-size: 12.5px; }
    .sv-used-r span { color: #777; }
    .sv-used-r b { color: #1a1a1a; font-weight: 600; }

    @media (max-width: 560px) { .sv-form { grid-template-columns: 1fr; } }

    @media (max-width: 720px) {
      .tx-stats { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width: 560px) {
      .tx-row { flex-wrap: wrap; }
      .tx-acct-wrap { order: 3; width: 100%; flex-basis: 100%; }
      .tx-name-wrap { width: auto; flex: 1; }
    }

    @media (max-width: 560px) {
      .md-breakdown { grid-template-columns: 1fr; }
      .md-summary-row { grid-template-columns: 1fr; }
      .md-cur-bd { grid-template-columns: 1fr; }
    }
  `

  const isAll = branch === ALL

  // 직원을 위, 알바를 아래로 정렬 (그 안에서는 이름순)
  const empRank = r => (r.emp_type === '직원' ? 0 : 1)
  const sortByType = (a, b) => empRank(a) - empRank(b) || String(a.emp_name).localeCompare(String(b.emp_name), 'ko')
  const sortedRecords = [...records].sort(sortByType)
  // 이체 유닛도 직원 포함 유닛을 위로
  const unitRank = u => (u.recs.some(r => r.emp_type === '직원') ? 0 : 1)

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="md-wrap">

        {onBack && <button className="md-back" onClick={onBack}>← 지점 선택으로</button>}

        {/* 헤더 */}
        <div className="md-header">
          <div className="md-brand">THE COMMA' LOUNGE</div>
          <h1 className="md-title">{isAll ? '전 지점' : branch} <span>급여 관리 현황</span></h1>
        </div>

        {/* 필터 */}
        <div className="md-filter">
          <select className="md-select" value={branch} onChange={e => setBranch(e.target.value)}>
            <option value={ALL}>{ALL}</option>
            {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="md-select" value={year} onChange={e => setYear(Number(e.target.value))}>
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select className="md-select" value={month} onChange={e => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
          </select>
          <button className="md-refresh" onClick={load}>🔄</button>
        </div>

        {/* 보기 전환 탭: 인건비 요약 / 이체 처리 */}
        <div className="md-tabs">
          <button className={`md-tab ${view === 'summary' ? 'on' : ''}`} onClick={() => setView('summary')}>📊 인건비 요약</button>
          <button className={`md-tab ${view === 'transfer' ? 'on' : ''}`} onClick={() => setView('transfer')}>💸 이체 처리</button>
        </div>

        {loading ? (
          <p className="md-loading">LOADING...</p>
        ) : view === 'transfer' ? (
          /* ───────── 이체 처리 화면 ───────── */
          (() => {
            // 지점별 → 같은 계좌끼리 묶은 '이체 단위(유닛)' 생성
            const groups = (isAll ? BRANCHES : [branch])
              .map(b => ({ branch: b, units: buildUnits(records.filter(r => r.branch === b)) }))
              .filter(g => g.units.length > 0)
            const allUnits = groups.flatMap(g => g.units)
            const doneUnits = allUnits.filter(u => unitStatus(u) === '이체완료')
            const doneCount = doneUnits.length
            const doneAmt = doneUnits.reduce((s, u) => s + unitAmt(u), 0)
            const totalAmt = allUnits.reduce((s, u) => s + unitAmt(u), 0)
            const remainAmt = totalAmt - doneAmt
            const totalUnits = allUnits.length

            return (
              <>
                {/* 진행 요약 (밝은 카드) */}
                <div className="tx-stats">
                  <div className="tx-stat">
                    <div className="tx-stat-k">이체 진행</div>
                    <div className="tx-stat-v">{doneCount}<small>/{totalUnits}건</small></div>
                    <div className="tx-stat-bar">
                      <div className="tx-stat-fill" style={{ width: `${totalUnits ? Math.round(doneCount / totalUnits * 100) : 0}%` }} />
                    </div>
                  </div>
                  <div className="tx-stat">
                    <div className="tx-stat-k">완료 금액</div>
                    <div className="tx-stat-v done">{fmt(doneAmt)}<small>원</small></div>
                  </div>
                  <div className="tx-stat">
                    <div className="tx-stat-k">남은 금액</div>
                    <div className="tx-stat-v remain">{fmt(remainAmt)}<small>원</small></div>
                  </div>
                  <div className="tx-stat">
                    <div className="tx-stat-k">총 이체액</div>
                    <div className="tx-stat-v gold">{fmt(totalAmt)}<small>원</small></div>
                  </div>
                </div>

                {/* 상태 범례 + 필터 */}
                <div className="tx-bar">
                  <div className="tx-legend">
                    <span className="tx-leg"><b className="tx-chip 작성중" />작성중</span>
                    <span className="tx-leg"><b className="tx-chip 수정중" />수정중</span>
                    <span className="tx-leg"><b className="tx-chip 확정" />확정</span>
                    <span className="tx-leg"><b className="tx-chip 이체완료" />이체완료</span>
                  </div>
                  <label className="tx-toggle">
                    <input type="checkbox" checked={onlyPending} onChange={e => setOnlyPending(e.target.checked)} />
                    미완료만 보기
                  </label>
                </div>

                <div className="tx-hint">금액 = 명세서 실지급액(공제 후). 같은 계좌는 한 줄로 합산됩니다. 상태 박스를 누르면 작성중 → 수정중 → 확정 → 이체완료 순으로 바뀝니다.</div>
                {txUnavailable && (
                  <div className="tx-warn">⚠ 이체 상태가 저장되지 않습니다. Supabase 에 <b>transfer_status</b> 컬럼을 추가해 주세요.</div>
                )}

                {groups.every(g => g.units.filter(u => !onlyPending || unitStatus(u) !== '이체완료').length === 0) ? (
                  <p className="md-empty">{onlyPending ? '미완료 건이 없습니다. 모두 이체 완료!' : '해당 월의 데이터가 없습니다.'}</p>
                ) : groups.map(g => {
                  const shown = g.units.filter(u => !onlyPending || unitStatus(u) !== '이체완료')
                    .sort((a, b) => unitRank(a) - unitRank(b) || unitNames(a).localeCompare(unitNames(b), 'ko'))
                  if (shown.length === 0) return null
                  const gTotal = g.units.reduce((s, u) => s + unitAmt(u), 0)
                  const gDone = g.units.filter(u => unitStatus(u) === '이체완료').length
                  return (
                    <div key={g.branch} className="tx-group">
                      <div className="tx-group-head">
                        <span className="tx-group-name">{g.branch}</span>
                        <span className="tx-group-meta">{gDone}/{g.units.length}건 · {fmt(gTotal)}원</span>
                      </div>
                      {shown.map(u => {
                        const st = unitStatus(u)
                        return (
                          <div key={u.key} className={`tx-row st-${st}`}>
                            <button className={`tx-status ${st}`} onClick={() => cycleUnit(u)}>
                              {STATUS_LABEL[st]}
                            </button>
                            <div className="tx-name-wrap">
                              <span className="tx-name">{unitNames(u)}</span>
                              {unitMixed(u) ? <span className="tx-pt merge">합산</span>
                                : unitIsAlba(u) ? <span className="tx-pt">알바</span> : null}
                            </div>
                            <div className="tx-ded-wrap">
                              {unitDedTypes(u).map(dt => (
                                <span key={dt} className={`tx-ded ${dt === 'none' ? 'none' : dt === '4대' ? 'four' : 'three'}`}>
                                  {DED_LABEL[dt] || dt}
                                </span>
                              ))}
                            </div>
                            <div className="tx-acct-wrap">
                              <span className="tx-acct">{u.account || '계좌 미입력'}</span>
                              {u.account && (
                                <button className="tx-copy" onClick={() => copyAcct(u)}>
                                  {copiedId === u.key ? '복사됨 ✓' : '복사'}
                                </button>
                              )}
                            </div>
                            <div className="tx-amt">{fmt(unitAmt(u))}<small>원</small></div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </>
            )
          })()
        ) : isAll ? (
          /* ───────── 전 지점 통합 대시보드 ───────── */
          <>
            {/* 히어로: 월급 / 4대보험 / 원천세 / 실지급 구분 */}
            <div className="md-hero">
              <div className="md-hero-label">전 지점 세전 인건비 (월급·지급액)</div>
              <div className="md-hero-val">{fmt(grandAll)}<small>원</small></div>

              <div className="md-breakdown">
                <div className="md-bd-item">
                  <div className="md-bd-k">월급 (세전 지급액)</div>
                  <div className="md-bd-v">{fmt(grandAll)}원</div>
                </div>
                <div className="md-bd-item">
                  <div className="md-bd-k">4대보험 공제</div>
                  <div className="md-bd-v">{fmt(majorAll)}원</div>
                </div>
                <div className="md-bd-item">
                  <div className="md-bd-k">원천세 공제</div>
                  <div className="md-bd-v">{fmt(withholdAll)}원</div>
                </div>
              </div>

              <div className="md-net">
                <span className="md-net-k">실지급 합계 (월급 − 공제)</span>
                <span className="md-net-v">{fmt(netAll)}원</span>
              </div>

              <div className="md-split">
                <span><b className="dot staff" />직원 지급 {fmt(staffAll)} · 실지급 {fmt(staffNetAll)}</span>
                <span><b className="dot alba" />알바 지급 {fmt(albaAll)} · 실지급 {fmt(albaNetAll)}</span>
              </div>
            </div>

            {/* 보조 KPI */}
            <div className="md-kpi-mini">
              <div className="md-kpi">
                <div className="md-kpi-label">총 인원</div>
                <div className="md-kpi-val">{totalPeople}<small>명</small></div>
              </div>
              <div className="md-kpi">
                <div className="md-kpi-label">마감 진행률</div>
                <div className="md-kpi-val">{totalFinal}<small>/{totalPeople}명</small></div>
              </div>
            </div>

            <div className="md-sec-head">
              <div className="md-sec-title">지점별 현황 (지점을 누르면 상세)</div>
              <button className="md-export" onClick={downloadSummary}>요약 엑셀 ↓</button>
            </div>

            {byBranch.map(x => (
              <div key={x.branch} className={`md-branch-row ${x.count === 0 ? 'empty' : ''}`}
                   onClick={() => setBranch(x.branch)}>
                <div className="md-br-main">
                  <div className="md-br-name">{x.branch}</div>
                  <div className="md-br-meta">
                    {x.count === 0 ? '입력 데이터 없음' : `총 ${x.count}명 · 직원 ${x.staff} · 알바 ${x.alba}`}
                  </div>
                </div>
                <div className="md-br-right">
                  <div className="md-br-amt">{fmt(x.total)}<small> 원</small></div>
                  {x.count > 0 && (
                    <>
                      <div className="md-br-split">직원 {fmt(x.staffTotal)} · 알바 {fmt(x.albaTotal)}</div>
                      <div className="md-br-prog">
                        <div className="md-br-prog-bar">
                          <div className="md-br-prog-fill" style={{ width: `${Math.round(x.finalCount / x.count * 100)}%` }} />
                        </div>
                        <span className="md-br-prog-txt">마감 {x.finalCount}/{x.count}</span>
                      </div>
                    </>
                  )}
                </div>
                <div className="md-br-chev">›</div>
              </div>
            ))}
          </>
        ) : (
          /* ───────── 단일 지점 상세 ───────── */
          <>
            <button className="md-back-inline" onClick={() => setBranch(ALL)}>← 전 지점으로</button>

            <div className="md-summary-row">
              <div className="md-summary-card">
                <div className="md-summary-label">인원</div>
                <div className="md-summary-val">{records.length}<small>명 (직원 {curStaff}·알바 {curAlba})</small></div>
              </div>
              <div className="md-summary-card">
                <div className="md-summary-label">마감</div>
                <div className="md-summary-val">{curFinal}<small>/{records.length}명</small></div>
              </div>
              <div className="md-summary-card">
                <div className="md-summary-label">세전 인건비(월급)</div>
                <div className="md-summary-val gold">{fmt(totalGrand)}<small>원</small></div>
              </div>
            </div>

            {records.length > 0 && (
              <>
                <div className="md-cur-bd">
                  <div className="md-cur-card">
                    <div className="md-cur-k">월급 (세전)</div>
                    <div className="md-cur-v">{fmt(totalGrand)}원</div>
                  </div>
                  <div className="md-cur-card">
                    <div className="md-cur-k">4대보험 공제</div>
                    <div className="md-cur-v">{fmt(curMajor)}원</div>
                  </div>
                  <div className="md-cur-card">
                    <div className="md-cur-k">원천세 공제</div>
                    <div className="md-cur-v">{fmt(curWithhold)}원</div>
                  </div>
                </div>

                <div className="md-split-row">
                  <div className="md-split-card">
                    <div className="md-split-tag staff">직원 {curStaff}명</div>
                    <div className="md-split-line"><span className="md-split-k">지급액</span><span className="md-split-v">{fmt(curStaffTotal)}원</span></div>
                    <div className="md-split-line"><span className="md-split-k">실지급</span><span className="md-split-v gold">{fmt(curStaffNet)}원</span></div>
                  </div>
                  <div className="md-split-card">
                    <div className="md-split-tag alba">알바 {curAlba}명</div>
                    <div className="md-split-line"><span className="md-split-k">지급액</span><span className="md-split-v">{fmt(curAlbaTotal)}원</span></div>
                    <div className="md-split-line"><span className="md-split-k">실지급</span><span className="md-split-v gold">{fmt(curAlbaNet)}원</span></div>
                  </div>
                </div>
              </>
            )}

            {records.length === 0 ? (
              <p className="md-empty">해당 월의 데이터가 없습니다.</p>
            ) : (
              sortedRecords.map(r => (
                <div key={r.id} className="md-emp">
                  <button className="md-del" onClick={() => deleteRecord(r.id, r.emp_name)}>✕</button>

                  <div className="md-emp-head">
                    <div>
                      <div className={`md-badge ${r.emp_type === '직원' ? 'staff' : 'alba'}`}>
                        {r.emp_type || '알바'}
                      </div>
                      <div className="md-emp-name">{r.emp_name}</div>
                    </div>
                    <div className="md-status">
                      <div className={`md-dot ${r.status === 'final' ? 'final' : 'saved'}`} />
                      <div className={`md-status-lbl ${r.status === 'final' ? 'final' : 'saved'}`}>
                        {r.status === 'final' ? '마감' : '진행중'}
                      </div>
                    </div>
                  </div>

                  <div className="md-pay-grid">
                    {[
                      ['기본급', fixBasic(r)],
                      ['주휴수당', r.weekly_holiday_pay],
                      ['연장수당', r.overtime_pay],
                      ['야간수당', r.night_pay],
                      ['휴일근로', r.holiday_pay],
                      ['휴일연장', r.holiday_overtime_pay],
                    ].map(([label, val]) => (
                      <div key={label}>
                        <div className="md-pay-label">{label}</div>
                        <div className="md-pay-val">{fmt(val)}원</div>
                      </div>
                    ))}
                  </div>

                  <div className="md-emp-foot">
                    <div className="md-total-lbl">세전 합계</div>
                    <div className="md-total-val">{fmt(fixGrand(r))}원</div>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>

      {/* ── 우측 하단 떠있는 퇴직금 계산기 버튼 ── */}
      <button className="sev-fab" onClick={() => setSevOpen(true)} title="퇴직금 계산기">
        <span className="sev-fab-ico">🧮</span>
        <span className="sev-fab-txt">퇴직금<br/>계산기</span>
      </button>

      {/* ── 퇴직금 계산기 팝업 ── */}
      {sevOpen && (
        <div className="sev-overlay" onClick={() => setSevOpen(false)}>
          <div className="sev-panel" onClick={e => e.stopPropagation()}>
            <div className="sev-head">
              <div>
                <div className="sev-head-ico">🧮</div>
                <h2 className="sev-head-title">퇴직금 계산기</h2>
                <p className="sev-head-sub">직원을 고르면 입·퇴사일과 직전 3개월 급여로 자동 계산해요.</p>
              </div>
              <button className="sev-close" onClick={() => setSevOpen(false)}>✕</button>
            </div>

            <div className="sv-form">
              <div className="sv-field">
                <label>지점</label>
                <select value={sevBranch} onChange={e => { setSevBranch(e.target.value); loadSevEmps(e.target.value) }}>
                  <option value="">지점 선택</option>
                  {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="sv-field">
                <label>직원</label>
                <select value={sevEmp} onChange={e => pickSevEmp(e.target.value)} disabled={!sevBranch}>
                  <option value="">{sevBranch ? '직원 선택' : '지점 먼저 선택'}</option>
                  {sevEmps.map(e => <option key={e.name} value={e.name}>{e.name}</option>)}
                </select>
              </div>
              <div className="sv-field">
                <label>입사일</label>
                <input type="date" value={sevHire} onChange={e => setSevHire(e.target.value)} />
              </div>
              <div className="sv-field">
                <label>퇴사일</label>
                <input type="date" value={sevResign} onChange={e => setSevResign(e.target.value)} />
              </div>
              <button className="sv-calc" onClick={calcSeverance} disabled={sevLoading}>
                {sevLoading ? '계산 중…' : '퇴직금 계산'}
              </button>
            </div>

            <div className="sv-note">
              ※ 퇴사일 직전 3개월 급여로 1일 평균임금을 구해 계산한 <b>추정치</b>입니다.
              연차수당·상여금 등 일부 항목과 통상임금 보정은 반영되지 않으니, 실제 지급 전 <b>노무사 확인</b>을 권합니다.
            </div>

            {sevResult && (
              <div className="sv-result">
                {!sevResult.eligible && (
                  <div className="sv-warn">⚠ 재직일수가 1년(365일) 미만입니다 — 법정 퇴직금 대상이 아닐 수 있습니다. (아래는 참고용 계산값)</div>
                )}
                <div className="sv-big">
                  <div className="sv-big-k">예상 퇴직금</div>
                  <div className="sv-big-v">{fmt(sevResult.severance)}<small>원</small></div>
                </div>
                <div className="sv-rows">
                  <div className="sv-r"><span>1일 평균임금</span><b>{fmt(sevResult.avgDaily)}원</b></div>
                  <div className="sv-r"><span>3개월 임금총액</span><b>{fmt(sevResult.wageSum)}원</b></div>
                  <div className="sv-r"><span>산정기간 일수</span><b>{sevResult.daysSum}일</b></div>
                  <div className="sv-r"><span>총 재직일수</span><b>{sevResult.serviceDays}일 ({(sevResult.serviceDays / 365).toFixed(2)}년)</b></div>
                </div>
                <div className="sv-formula">계산식 : {fmt(sevResult.avgDaily)} × 30일 × ({sevResult.serviceDays} ÷ 365)</div>
                <div className="sv-used">
                  <div className="sv-used-h">평균임금 산정에 사용한 급여 (식대 포함)</div>
                  {sevResult.used.map(r => (
                    <div key={r.id} className="sv-used-r">
                      <span>{r.year}년 {r.month}월</span>
                      <b>{fmt(fixGrand(r) + (r.meal_allowance || 0))}원</b>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
