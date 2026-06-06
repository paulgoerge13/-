import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BRANCHES = ['광명GIDC점', '인계점', '안양일번가점', '익산점', '인천주안점', '하남점']
const MASTER_PASSWORD = process.env.NEXT_PUBLIC_MANAGER_PASSWORD || 'comma1234'

export default function PayrollManager() {
  const [auth, setAuth] = useState(false)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState(false)
  const [branch, setBranch] = useState('광명GIDC점')
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('payroll')
        .select('*')
        .eq('branch', branch)
        .eq('year', year)
        .eq('month', month)
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
  // basic_pay가 0으로 굳어 있다(예: 인계점 김민주·김수혜·조윤솔). 사이트는 매번 다시 계산해
  // 209로 보여주지만, 이 관리자 페이지는 저장 스냅샷을 그대로 읽어 0으로 보였다.
  // → 직원인데 기본급이 0인 "명백히 오래된" 레코드만 시급×209로 표시 보정한다.
  //   (정상 저장됐거나 일할계산된 직원 레코드는 basic_pay가 0이 아니므로 손대지 않음.) DB는 안 건드림.
  function fixBasic(r) {
    if (r.emp_type === '직원' && !(r.basic_pay > 0) && r.hourly_wage > 0) {
      return Math.round(r.hourly_wage * 209)
    }
    return r.basic_pay || 0
  }
  function fixGrand(r) {
    const b = fixBasic(r)
    if (b === (r.basic_pay || 0)) return r.grand_total || 0
    // 기본급만 교체하고 나머지 항목 스냅샷은 그대로 합산
    return b
      + (r.weekly_holiday_pay || 0) + (r.overtime_pay || 0) + (r.night_pay || 0)
      + (r.holiday_pay || 0) + (r.holiday_overtime_pay || 0) + (r.holiday_night_pay || 0)
  }

  const totalGrand = records.reduce((s, r) => s + fixGrand(r), 0)

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
      display: flex; align-items: center; gap: 6px;
    }
    .btn-refresh:hover { border-color: #1a1a1a; color: #1a1a1a; }

    /* 합계 카드 */
    .summary-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
    .summary-card {
      background: #fff; border: 1px solid #ebe9e4; border-radius: 10px; padding: 14px 16px;
    }
    .summary-card-label { font-size: 10px; letter-spacing: 0.15em; color: #999; margin-bottom: 6px; }
    .summary-card-val { font-size: 18px; font-weight: 700; color: #1a1a1a; }
    .summary-card-val.gold { color: #b8954a; }

    /* 직원 카드 */
    .emp-card {
      background: #fff; border: 1px solid #ebe9e4; border-radius: 12px;
      padding: 16px; margin-bottom: 10px; position: relative;
    }
    .emp-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
    .emp-type-badge {
      font-size: 10px; font-weight: 600; letter-spacing: 0.1em;
      padding: 3px 8px; border-radius: 20px; margin-bottom: 4px; display: inline-block;
    }
    .emp-type-badge.staff { background: #e3dfd5; color: #6b6253; }
    .emp-type-badge.alba { background: #ece0c9; color: #9c7f44; }
    .emp-name { font-size: 17px; font-weight: 700; color: #1a1a1a; }

    .status-wrap { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .status-dot {
      width: 12px; height: 12px; border-radius: 50%;
    }
    .status-dot.final { background: #2ecc71; box-shadow: 0 0 8px #2ecc71; }
    .status-dot.saved { background: #f1c40f; box-shadow: 0 0 8px #f1c40f; }
    .status-label { font-size: 10px; font-weight: 600; }
    .status-label.final { color: #2ecc71; }
    .status-label.saved { color: #f39c12; }

    /* 급여 그리드 */
    .pay-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
    .pay-item-label { font-size: 10px; color: #999; letter-spacing: 0.08em; margin-bottom: 2px; }
    .pay-item-val { font-size: 13px; font-weight: 600; color: #1a1a1a; }

    .emp-card-footer {
      border-top: 1px solid #f0ede8; padding-top: 12px;
      display: flex; justify-content: space-between; align-items: center;
    }
    .total-label { font-size: 11px; color: #999; letter-spacing: 0.1em; }
    .total-val { font-family: 'Pretendard', sans-serif; font-size: 22px; color: #b8954a; font-weight: 700; letter-spacing: -0.01em; }

    .btn-delete {
      position: absolute; top: 14px; right: 14px;
      background: none; border: none; color: #ddd; font-size: 16px; cursor: pointer; padding: 2px 6px;
    }
    .btn-delete:hover { color: #e05555; }

    /* 로그인 */
    .login-wrap { display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #f8f7f4; padding: 20px; }
    .login-box {
      background: #fff; border: 1px solid #ebe9e4; border-radius: 16px;
      padding: 36px 28px; width: 100%; max-width: 320px; text-align: center;
    }
    .login-brand { font-size: 10px; letter-spacing: 0.2em; color: #b8954a; margin-bottom: 4px; }
    .login-title { font-family: 'Pretendard', sans-serif; font-weight: 700; font-size: 19px; margin-bottom: 24px; }
    .login-input {
      width: 100%; background: #f8f7f4; border: 1.5px solid #d0ccc5;
      border-radius: 8px; padding: 12px 14px; font-size: 14px; color: #1a1a1a;
      font-family: 'Pretendard', 'DM Sans', sans-serif; outline: none; margin-bottom: 10px;
    }
    .login-input:focus { border-color: #b8954a; background: #fff; }
    .login-btn {
      width: 100%; padding: 13px; background: #1a1a1a; color: #fff;
      border: none; border-radius: 8px; font-size: 13px; font-weight: 600;
      cursor: pointer; font-family: 'Pretendard', 'DM Sans', sans-serif; letter-spacing: 0.08em;
    }
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

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="wrap">

        {/* 헤더 */}
        <div className="page-header">
          <div className="page-brand">THE COMMA' LOUNGE</div>
          <h1 className="page-title">{branch} <span>급여 관리 현황</span></h1>
        </div>

        {/* 필터 */}
        <div className="filter-wrap">
          <select className="filter-select" value={branch} onChange={e => setBranch(e.target.value)}>
            {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="filter-select" value={year} onChange={e => setYear(Number(e.target.value))}>
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select className="filter-select" value={month} onChange={e => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
          </select>
          <button className="btn-refresh" onClick={load}>🔄 새로고침</button>
        </div>

        {/* 합계 카드 */}
        <div className="summary-row">
          <div className="summary-card">
            <div className="summary-card-label">총 직원 수</div>
            <div className="summary-card-val">{records.length}명</div>
          </div>
          <div className="summary-card">
            <div className="summary-card-label">총 지급액</div>
            <div className="summary-card-val gold">{fmt(totalGrand)}원</div>
          </div>
        </div>

        {/* 직원 카드 목록 */}
        {loading ? (
          <p className="loading-msg">LOADING...</p>
        ) : records.length === 0 ? (
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
      </div>
    </>
  )
}
