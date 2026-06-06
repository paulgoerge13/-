import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BRANCHES = ['광명GIDC점', '인계점', '안양일번가점', '익산점', '인천주안점', '하남점']
const ALL = '전체 지점'
const MASTER_PASSWORD = process.env.NEXT_PUBLIC_MANAGER_PASSWORD || 'comma1234'

export default function PayrollManager() {
  const [auth, setAuth] = useState(false)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState(false)
  const [branch, setBranch] = useState(ALL)   // 기본은 전 지점 통합 대시보드
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
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

  useEffect(() => { if (auth) load() }, [auth, branch, year, month])

  async function deleteRecord(id, name) {
    if (confirm(`${name} 님의 기록을 삭제하시겠습니까?`)) {
      const { error } = await supabase.from('payroll').delete().eq('id', id)
      if (error) alert('삭제 실패'); else load()
    }
  }

  function fmt(n) { return Math.round(n || 0).toLocaleString('ko-KR') }

  // ── 옛 스냅샷 보정(표시용) ──
  // 직원 기본급은 통상시급 × 209(주휴 포함)인데, ×209 도입 이전에 저장된 일부 직원 레코드는
  // basic_pay가 0으로 굳어 있다. → 직원인데 기본급이 0인 "명백히 오래된" 레코드만 시급×209로 표시 보정.
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

  // ── 전 지점 집계 ──
  const byBranch = BRANCHES.map(b => {
    const rs = records.filter(r => r.branch === b)
    return {
      branch: b,
      count: rs.length,
      staff: rs.filter(r => r.emp_type === '직원').length,
      alba: rs.filter(r => r.emp_type !== '직원').length,
      total: rs.reduce((s, r) => s + fixGrand(r), 0),
      finalCount: rs.filter(r => r.status === 'final').length,
    }
  })
  const grandAll = byBranch.reduce((s, x) => s + x.total, 0)
  const totalPeople = byBranch.reduce((s, x) => s + x.count, 0)
  const totalFinal = byBranch.reduce((s, x) => s + x.finalCount, 0)

  // 현재(단일 지점) 집계
  const totalGrand = records.reduce((s, r) => s + fixGrand(r), 0)
  const curStaff = records.filter(r => r.emp_type === '직원').length
  const curAlba = records.filter(r => r.emp_type !== '직원').length
  const curFinal = records.filter(r => r.status === 'final').length

  // ── 전 지점 요약 엑셀(CSV) 내보내기 — 보고용 ──
  function downloadSummary() {
    const BOM = '﻿'
    const head = ['지점', '총인원', '직원', '알바', '세전인건비', '마감완료', '전체대비']
    const lines = byBranch.map(x =>
      [x.branch, x.count, x.staff, x.alba, x.total, `${x.finalCount}/${x.count}`,
       x.count > 0 ? `${Math.round(x.finalCount / x.count * 100)}%` : '-']
        .map(v => `"${v}"`).join(','))
    const totalLine = ['전체 합계', totalPeople,
      byBranch.reduce((s, x) => s + x.staff, 0), byBranch.reduce((s, x) => s + x.alba, 0),
      grandAll, `${totalFinal}/${totalPeople}`,
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
    @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css');
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=DM+Sans:wght@300;400;500;600&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #f8f7f4; font-family: 'Pretendard', 'DM Sans', sans-serif; color: #1a1a1a; }

    .wrap { max-width: 900px; margin: 0 auto; padding: 28px 16px; }

    /* 헤더 */
    .page-header { margin-bottom: 20px; }
    .page-brand { font-size: 10px; letter-spacing: 0.2em; color: #b8954a; margin-bottom: 4px; }
    .page-title { font-family: 'Pretendard', sans-serif; font-weight: 700; font-size: 19px; color: #1a1a1a; }
    .page-title span { color: #b8954a; }

    /* 필터 */
    .filter-wrap { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .filter-select {
      flex: 1; min-width: 100px;
      background: #fff; border: 1px solid #d0ccc5; color: #1a1a1a;
      border-radius: 8px; padding: 10px 12px; font-size: 13px;
      font-family: 'Pretendard', 'DM Sans', sans-serif; outline: none;
    }
    .filter-select:focus { border-color: #b8954a; }
    .btn-refresh {
      background: #fff; border: 1px solid #d0ccc5; border-radius: 8px;
      padding: 10px 16px; font-size: 12px; cursor: pointer;
      font-family: 'Pretendard', 'DM Sans', sans-serif; color: #666;
      display: flex; align-items: center; gap: 6px; white-space: nowrap;
    }
    .btn-refresh:hover { border-color: #1a1a1a; color: #1a1a1a; }

    /* KPI 카드 (전 지점) */
    .kpi-row { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 10px; margin-bottom: 18px; }
    .kpi-card { background: #fff; border: 1px solid #ebe9e4; border-radius: 12px; padding: 16px; }
    .kpi-card.hero { background: linear-gradient(135deg, #1a1a1a, #2c2c2c); border: none; }
    .kpi-label { font-size: 10px; letter-spacing: 0.13em; color: #999; margin-bottom: 7px; }
    .kpi-card.hero .kpi-label { color: #c9b78c; }
    .kpi-val { font-size: 21px; font-weight: 700; color: #1a1a1a; letter-spacing: -0.01em; }
    .kpi-card.hero .kpi-val { color: #fff; }
    .kpi-val small { font-size: 12px; font-weight: 500; color: #999; margin-left: 2px; }
    .kpi-card.hero .kpi-val small { color: #c9b78c; }
    @media (max-width: 620px) {
      .kpi-row { grid-template-columns: 1fr 1fr; }
      .kpi-card.hero { grid-column: 1 / -1; }
    }

    /* 섹션 제목 + 내보내기 */
    .sec-head { display: flex; justify-content: space-between; align-items: center; margin: 4px 2px 10px; }
    .sec-title { font-size: 13px; font-weight: 700; color: #555; letter-spacing: 0.04em; }
    .btn-export {
      background: #b8954a; border: none; border-radius: 8px; color: #fff;
      padding: 8px 13px; font-size: 11.5px; font-weight: 600; cursor: pointer;
      font-family: 'Pretendard', sans-serif; letter-spacing: 0.03em;
    }
    .btn-export:hover { background: #a07f3a; }

    /* 지점별 비교 행 */
    .branch-row {
      background: #fff; border: 1px solid #ebe9e4; border-radius: 12px;
      padding: 15px 16px; margin-bottom: 9px; cursor: pointer;
      display: flex; align-items: center; gap: 14px; transition: all 0.15s;
    }
    .branch-row:hover { border-color: #b8954a; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(0,0,0,0.05); }
    .branch-row.empty { opacity: 0.55; }
    .br-main { flex: 1; min-width: 0; }
    .br-name { font-size: 15px; font-weight: 700; color: #1a1a1a; margin-bottom: 3px; }
    .br-meta { font-size: 11.5px; color: #999; }
    .br-right { text-align: right; }
    .br-amt { font-size: 16px; font-weight: 700; color: #b8954a; letter-spacing: -0.01em; }
    .br-amt small { font-size: 11px; color: #bbb; font-weight: 500; }
    .br-prog { margin-top: 5px; display: flex; align-items: center; gap: 6px; justify-content: flex-end; }
    .br-prog-bar { width: 60px; height: 5px; border-radius: 3px; background: #eee; overflow: hidden; }
    .br-prog-fill { height: 100%; background: #2ecc71; border-radius: 3px; }
    .br-prog-txt { font-size: 10px; color: #aaa; }
    .br-chev { color: #ccc; font-size: 18px; }

    /* 합계 카드 (단일 지점) */
    .summary-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 20px; }
    .summary-card { background: #fff; border: 1px solid #ebe9e4; border-radius: 10px; padding: 14px 16px; }
    .summary-card-label { font-size: 10px; letter-spacing: 0.13em; color: #999; margin-bottom: 6px; }
    .summary-card-val { font-size: 18px; font-weight: 700; color: #1a1a1a; }
    .summary-card-val.gold { color: #b8954a; }
    .summary-card-val small { font-size: 11px; color: #aaa; font-weight: 500; }

    .back-btn {
      background: none; border: none; color: #888; font-size: 13px; cursor: pointer;
      padding: 4px 0; margin-bottom: 10px; font-family: 'Pretendard', sans-serif; font-weight: 500;
    }
    .back-btn:hover { color: #1a1a1a; }

    /* 직원 카드 */
    .emp-card { background: #fff; border: 1px solid #ebe9e4; border-radius: 12px; padding: 16px; margin-bottom: 10px; position: relative; }
    .emp-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
    .emp-type-badge { font-size: 10px; font-weight: 600; letter-spacing: 0.1em; padding: 3px 8px; border-radius: 20px; margin-bottom: 4px; display: inline-block; }
    .emp-type-badge.staff { background: #e3dfd5; color: #6b6253; }
    .emp-type-badge.alba { background: #ece0c9; color: #9c7f44; }
    .emp-name { font-size: 17px; font-weight: 700; color: #1a1a1a; }
    .status-wrap { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .status-dot { width: 12px; height: 12px; border-radius: 50%; }
    .status-dot.final { background: #2ecc71; box-shadow: 0 0 8px #2ecc71; }
    .status-dot.saved { background: #f1c40f; box-shadow: 0 0 8px #f1c40f; }
    .status-label { font-size: 10px; font-weight: 600; }
    .status-label.final { color: #2ecc71; }
    .status-label.saved { color: #f39c12; }
    .pay-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
    .pay-item-label { font-size: 10px; color: #999; letter-spacing: 0.08em; margin-bottom: 2px; }
    .pay-item-val { font-size: 13px; font-weight: 600; color: #1a1a1a; }
    .emp-card-footer { border-top: 1px solid #f0ede8; padding-top: 12px; display: flex; justify-content: space-between; align-items: center; }
    .total-label { font-size: 11px; color: #999; letter-spacing: 0.1em; }
    .total-val { font-family: 'Pretendard', sans-serif; font-size: 22px; color: #b8954a; font-weight: 700; letter-spacing: -0.01em; }
    .btn-delete { position: absolute; top: 14px; right: 14px; background: none; border: none; color: #ddd; font-size: 16px; cursor: pointer; padding: 2px 6px; }
    .btn-delete:hover { color: #e05555; }

    /* 로그인 */
    .login-wrap { display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f8f7f4; padding: 20px; }
    .login-box { background: #fff; border: 1px solid #ebe9e4; border-radius: 16px; padding: 36px 28px; width: 100%; max-width: 320px; text-align: center; }
    .login-brand { font-size: 10px; letter-spacing: 0.2em; color: #b8954a; margin-bottom: 4px; }
    .login-title { font-family: 'Pretendard', sans-serif; font-weight: 700; font-size: 19px; margin-bottom: 24px; }
    .login-input { width: 100%; background: #f8f7f4; border: 1.5px solid #d0ccc5; border-radius: 8px; padding: 12px 14px; font-size: 14px; color: #1a1a1a; font-family: 'Pretendard', 'DM Sans', sans-serif; outline: none; margin-bottom: 10px; }
    .login-input:focus { border-color: #b8954a; background: #fff; }
    .login-btn { width: 100%; padding: 13px; background: #1a1a1a; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: 'Pretendard', 'DM Sans', sans-serif; letter-spacing: 0.08em; }
    .login-btn:hover { background: #333; }
    .error-msg { font-size: 12px; color: #e05555; margin-bottom: 10px; }

    .empty-msg { text-align: center; color: #bbb; padding: 40px 0; font-size: 13px; letter-spacing: 0.05em; }
    .loading-msg { text-align: center; color: #bbb; padding: 40px 0; font-size: 12px; letter-spacing: 0.1em; }
  `

  if (!auth) return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="login-wrap">
        <div className="login-box">
          <div className="login-brand">THE COMMA' LOUNGE</div>
          <h2 className="login-title">매니저 통합 관리</h2>
          <input
            type="password" className="login-input" placeholder="마스터 비밀번호"
            value={pw} onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (pw === MASTER_PASSWORD ? setAuth(true) : setPwError(true))}
          />
          {pwError && <p className="error-msg">비밀번호가 틀렸습니다.</p>}
          <button className="login-btn" onClick={() => pw === MASTER_PASSWORD ? setAuth(true) : setPwError(true)}>입장하기</button>
        </div>
      </div>
    </>
  )

  const isAll = branch === ALL

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="wrap">

        {/* 헤더 */}
        <div className="page-header">
          <div className="page-brand">THE COMMA' LOUNGE</div>
          <h1 className="page-title">{isAll ? '전 지점' : branch} <span>급여 관리 현황</span></h1>
        </div>

        {/* 필터 */}
        <div className="filter-wrap">
          <select className="filter-select" value={branch} onChange={e => setBranch(e.target.value)}>
            <option value={ALL}>{ALL}</option>
            {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="filter-select" value={year} onChange={e => setYear(Number(e.target.value))}>
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select className="filter-select" value={month} onChange={e => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
          </select>
          <button className="btn-refresh" onClick={load}>🔄</button>
        </div>

        {loading ? (
          <p className="loading-msg">LOADING...</p>
        ) : isAll ? (
          /* ───────── 전 지점 통합 대시보드 ───────── */
          <>
            <div className="kpi-row">
              <div className="kpi-card hero">
                <div className="kpi-label">전 지점 세전 인건비</div>
                <div className="kpi-val">{fmt(grandAll)}<small>원</small></div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">총 인원</div>
                <div className="kpi-val">{totalPeople}<small>명</small></div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">마감 진행률</div>
                <div className="kpi-val">{totalFinal}<small>/{totalPeople}명</small></div>
              </div>
            </div>

            <div className="sec-head">
              <div className="sec-title">지점별 현황 (지점을 누르면 상세)</div>
              <button className="btn-export" onClick={downloadSummary}>요약 엑셀 ↓</button>
            </div>

            {byBranch.map(x => (
              <div key={x.branch} className={`branch-row ${x.count === 0 ? 'empty' : ''}`}
                   onClick={() => setBranch(x.branch)}>
                <div className="br-main">
                  <div className="br-name">{x.branch}</div>
                  <div className="br-meta">
                    {x.count === 0 ? '입력 데이터 없음' : `총 ${x.count}명 · 직원 ${x.staff} · 알바 ${x.alba}`}
                  </div>
                </div>
                <div className="br-right">
                  <div className="br-amt">{fmt(x.total)}<small> 원</small></div>
                  {x.count > 0 && (
                    <div className="br-prog">
                      <div className="br-prog-bar">
                        <div className="br-prog-fill" style={{ width: `${Math.round(x.finalCount / x.count * 100)}%` }} />
                      </div>
                      <span className="br-prog-txt">마감 {x.finalCount}/{x.count}</span>
                    </div>
                  )}
                </div>
                <div className="br-chev">›</div>
              </div>
            ))}
          </>
        ) : (
          /* ───────── 단일 지점 상세 ───────── */
          <>
            <button className="back-btn" onClick={() => setBranch(ALL)}>← 전 지점으로</button>

            <div className="summary-row">
              <div className="summary-card">
                <div className="summary-card-label">인원</div>
                <div className="summary-card-val">{records.length}<small>명 (직원 {curStaff}·알바 {curAlba})</small></div>
              </div>
              <div className="summary-card">
                <div className="summary-card-label">마감</div>
                <div className="summary-card-val">{curFinal}<small>/{records.length}명</small></div>
              </div>
              <div className="summary-card">
                <div className="summary-card-label">세전 인건비</div>
                <div className="summary-card-val gold">{fmt(totalGrand)}<small>원</small></div>
              </div>
            </div>

            {records.length === 0 ? (
              <p className="empty-msg">해당 월의 데이터가 없습니다.</p>
            ) : (
              records.map(r => (
                <div key={r.id} className="emp-card">
                  <button className="btn-delete" onClick={() => deleteRecord(r.id, r.emp_name)}>✕</button>

                  <div className="emp-card-header">
                    <div>
                      <div className={`emp-type-badge ${r.emp_type === '직원' ? 'staff' : 'alba'}`}>
                        {r.emp_type || '알바'}
                      </div>
                      <div className="emp-name">{r.emp_name}</div>
                    </div>
                    <div className="status-wrap">
                      <div className={`status-dot ${r.status === 'final' ? 'final' : 'saved'}`} />
                      <div className={`status-label ${r.status === 'final' ? 'final' : 'saved'}`}>
                        {r.status === 'final' ? '마감' : '진행중'}
                      </div>
                    </div>
                  </div>

                  <div className="pay-grid">
                    {[
                      ['기본급', fixBasic(r)],
                      ['주휴수당', r.weekly_holiday_pay],
                      ['연장수당', r.overtime_pay],
                      ['야간수당', r.night_pay],
                      ['휴일근로', r.holiday_pay],
                      ['휴일연장', r.holiday_overtime_pay],
                    ].map(([label, val]) => (
                      <div key={label}>
                        <div className="pay-item-label">{label}</div>
                        <div className="pay-item-val">{fmt(val)}원</div>
                      </div>
                    ))}
                  </div>

                  <div className="emp-card-footer">
                    <div className="total-label">세전 합계</div>
                    <div className="total-val">{fmt(fixGrand(r))}원</div>
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
