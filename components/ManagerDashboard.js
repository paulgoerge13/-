import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BRANCHES = ['광명GIDC점', '인계점', '안양일번가점', '익산점', '인천주안점', '하남점']
const ALL = '전체 지점'

// ── 전 지점 통합 관리 대시보드 (재사용 컴포넌트) ──
// manager.js(별도 페이지)와 index.js(메인 앱의 관리자 화면) 양쪽에서 공통으로 사용.
// 로그인/인증은 부모가 처리하고, 이 컴포넌트는 인증 이후의 대시보드만 그린다.
export default function ManagerDashboard() {
  const [branch, setBranch] = useState(ALL)   // 기본은 전 지점 통합 대시보드
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

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
      const { error } = await supabase.from('payroll').delete().eq('id', id)
      if (error) alert('삭제 실패'); else load()
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

  // ── 공제 계산 (2026 요율, 근로자 부담분) — 메인 앱과 동일 ──
  function recDeduction(r) {
    const taxable = fixGrand(r)
    if (r.emp_type === '직원') {
      const pension    = Math.floor(taxable * 0.0475 / 10) * 10
      const health     = Math.floor(taxable * 0.03595 / 10) * 10
      const care       = Math.floor(health * 0.1314 / 10) * 10
      const employment = Math.floor(taxable * 0.009 / 10) * 10
      const incomeTax  = r.income_tax || 0
      const localTax   = Math.floor((incomeTax * 0.1) / 10) * 10
      return pension + health + care + employment + incomeTax + localTax
    }
    return Math.round(taxable * 0.03) + Math.round(taxable * 0.003)  // 3.3%
  }
  function recNet(r) { return fixGrand(r) + (r.meal_allowance || 0) - recDeduction(r) }

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
    .md-wrap { max-width: 900px; margin: 0 auto; padding: 28px 16px; font-family: 'Pretendard', 'DM Sans', sans-serif; color: #1a1a1a; }

    /* 헤더 */
    .md-header { margin-bottom: 20px; }
    .md-brand { font-size: 10px; letter-spacing: 0.2em; color: #b8954a; margin-bottom: 4px; }
    .md-title { font-weight: 700; font-size: 19px; color: #1a1a1a; }
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

    /* KPI 카드 */
    .md-kpi-row { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 10px; margin-bottom: 18px; }
    .md-kpi { background: #fff; border: 1px solid #ebe9e4; border-radius: 12px; padding: 16px; }
    .md-kpi.hero { background: linear-gradient(135deg, #1a1a1a, #2c2c2c); border: none; }
    .md-kpi-label { font-size: 10px; letter-spacing: 0.13em; color: #999; margin-bottom: 7px; }
    .md-kpi.hero .md-kpi-label { color: #c9b78c; }
    .md-kpi-val { font-size: 21px; font-weight: 700; color: #1a1a1a; letter-spacing: -0.01em; }
    .md-kpi.hero .md-kpi-val { color: #fff; }
    .md-kpi-val small { font-size: 12px; font-weight: 500; color: #999; margin-left: 2px; }
    .md-kpi.hero .md-kpi-val small { color: #c9b78c; }
    .md-netline { font-size: 12px; color: #e6d6ab; margin-top: 8px; font-weight: 600; }
    .md-netnote { font-size: 10px; color: #9c8e6a; font-weight: 400; }
    .md-kpi-split { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; padding-top: 9px; border-top: 1px solid rgba(201,183,140,0.18); }
    .md-kpi-split span { font-size: 11px; color: #cfc09a; display: flex; align-items: center; }
    .md-kpi-split .dot { width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; display: inline-block; flex: none; }
    .md-kpi-split .dot.staff { background: #e7c98a; }
    .md-kpi-split .dot.alba { background: #8a8a8a; }
    @media (max-width: 620px) {
      .md-kpi-row { grid-template-columns: 1fr 1fr; }
      .md-kpi.hero { grid-column: 1 / -1; }
    }

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
    .md-summary-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 20px; }
    .md-summary-card { background: #fff; border: 1px solid #ebe9e4; border-radius: 10px; padding: 14px 16px; }
    .md-summary-label { font-size: 10px; letter-spacing: 0.13em; color: #999; margin-bottom: 6px; }
    .md-summary-val { font-size: 18px; font-weight: 700; color: #1a1a1a; }
    .md-summary-val.gold { color: #b8954a; }
    .md-summary-val small { font-size: 11px; color: #aaa; font-weight: 500; }

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

    .md-back { background: none; border: none; color: #888; font-size: 13px; cursor: pointer; padding: 4px 0; margin-bottom: 10px; font-family: 'Pretendard', sans-serif; font-weight: 500; }
    .md-back:hover { color: #1a1a1a; }

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
  `

  const isAll = branch === ALL

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="md-wrap">

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

        {loading ? (
          <p className="md-loading">LOADING...</p>
        ) : isAll ? (
          /* ───────── 전 지점 통합 대시보드 ───────── */
          <>
            <div className="md-kpi-row">
              <div className="md-kpi hero">
                <div className="md-kpi-label">전 지점 세전 인건비</div>
                <div className="md-kpi-val">{fmt(grandAll)}<small>원</small></div>
                <div className="md-netline">실지급 합계 {fmt(netAll)}원 <span className="md-netnote">(직원 4대보험·알바 3.3% 공제)</span></div>
                <div className="md-kpi-split">
                  <span><b className="dot staff" />직원 지급 {fmt(staffAll)} · 실지급 {fmt(staffNetAll)}</span>
                  <span><b className="dot alba" />알바 지급 {fmt(albaAll)} · 실지급 {fmt(albaNetAll)}</span>
                </div>
              </div>
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
            <button className="md-back" onClick={() => setBranch(ALL)}>← 전 지점으로</button>

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
                <div className="md-summary-label">세전 인건비</div>
                <div className="md-summary-val gold">{fmt(totalGrand)}<small>원</small></div>
              </div>
            </div>

            {records.length > 0 && (
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
            )}

            {records.length === 0 ? (
              <p className="md-empty">해당 월의 데이터가 없습니다.</p>
            ) : (
              records.map(r => (
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
    </>
  )
}
