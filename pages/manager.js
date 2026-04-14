import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BRANCHES = ['광명GIDC점', '인계점', '안양일번가점', '익산점', '인천주안점', '서울마리나점']
const MASTER_PASSWORD = process.env.NEXT_PUBLIC_MANAGER_PASSWORD || 'comma1234'

export default function PayrollManager() {
  const [auth, setAuth] = useState(false)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState(false)
  const [branch, setBranch] = useState('광명GIDC점') // 기본값을 첫 지점으로 설정
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)

  async function load() {
    setLoading(true)
    // 선택된 지점, 연도, 월에 딱 맞는 데이터만 가져옵니다.
    let query = supabase
      .from('payroll')
      .select('*')
      .eq('branch', branch)
      .eq('year', year)
      .eq('month', month)
    
    const { data, error } = await query
    if (error) console.error(error)
    setRecords(data || [])
    setLoading(false)
  }

  // 데이터 삭제 함수
  async function deleteRecord(id, name) {
    if (confirm(`${name} 님의 해당 월 급여 기록을 삭제하시겠습니까?`)) {
      const { error } = await supabase
        .from('payroll')
        .delete()
        .eq('id', id)
      
      if (error) {
        alert('삭제 실패: ' + error.message)
      } else {
        alert('삭제되었습니다.')
        load() // 목록 새로고침
      }
    }
  }

  useEffect(() => { if (auth) load() }, [auth, branch, year, month])

  function fmt(n) {
    return Math.round(n || 0).toLocaleString('ko-KR')
  }

  if (!auth) return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=DM+Sans:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f8f7f4; font-family: 'DM Sans', sans-serif; }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8f7f4' }}>
        <div style={{ background: '#fff', border: '1px solid #ebe9e4', borderRadius: 16, padding: '40px', width: 340, textAlign: 'center', boxShadow: '0 8px 40px rgba(0,0,0,0.06)' }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: '#1a1a1a', marginBottom: 4 }}>COMMA<span style={{color:'#b8954a',fontStyle:'italic'}}>'</span></div>
          <div style={{ fontSize: 10, letterSpacing: '0.2em', color: '#999', marginBottom: 28 }}>PAYROLL MANAGER</div>
          <input
            type="password"
            placeholder="마스터 비밀번호"
            value={pw}
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (pw === MASTER_PASSWORD ? (setAuth(true), setPwError(false)) : setPwError(true))}
            style={{ width: '100%', background: '#f8f7f4', border: '1px solid #ebe9e4', borderRadius: 8, padding: '11px 14px', fontSize: 14, fontFamily: 'DM Sans, sans-serif', outline: 'none', marginBottom: 10 }}
          />
          {pwError && <p style={{ fontSize: 12, color: '#e05555', marginBottom: 10 }}>비밀번호가 틀렸습니다.</p>}
          <button
            onClick={() => pw === MASTER_PASSWORD ? (setAuth(true), setPwError(false)) : setPwError(true)}
            style={{ width: '100%', padding: '12px', background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.1em', fontFamily: 'DM Sans, sans-serif' }}
          >입장</button>
        </div>
      </div>
    </>
  )

  const totalGrand = records.reduce((s, r) => s + (r.grand_total || 0), 0)

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=DM+Sans:wght@300;400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f8f7f4; font-family: 'DM Sans', sans-serif; color: #1a1a1a; }
        select {
          background: #fff;
          border: 1px solid #ebe9e4;
          color: #1a1a1a;
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 13px;
          font-family: 'DM Sans', sans-serif;
          outline: none;
          cursor: pointer;
        }
        select:focus { border-color: #b8954a; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: 10px 14px; background: #f8f7f4; font-size: 10px; letter-spacing: 0.12em; color: #999; border-bottom: 1px solid #ebe9e4; font-weight: 600; }
        td { padding: 13px 14px; font-size: 13px; border-bottom: 1px solid #f0ede8; }
        tr:hover td { background: #faf9f6; }
        .delete-btn { color: #ccc; cursor: pointer; border: none; background: none; font-size: 16px; transition: color 0.2s; }
        .delete-btn:hover { color: #e05555; }
      `}</style>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: '2rem' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.2em', color: '#b8954a', marginBottom: 4 }}>THE COMMA' LOUNGE</div>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, color: '#1a1a1a' }}>{branch} 급여 현황</h1>
          </div>
          <select value={branch} onChange={e => setBranch(e.target.value)}>
            {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))}>
            {[2024,2025,2026].map(y => <option key={y}>{y}</option>)}
          </select>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}>
            {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}월</option>)}
          </select>
        </div>

        {/* 선택된 지점의 합계 카드 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[[`${branch} 직원 수`, `${records.length}명`], [`${branch} 총 지급액`, `${fmt(totalGrand)}원`]].map(([l, v]) => (
            <div key={l} style={{ background: '#fff', border: '1px solid #ebe9e4', borderRadius: 10, padding: '16px 20px' }}>
              <div style={{ fontSize: 10, letterSpacing: '0.15em', color: '#999', marginBottom: 6 }}>{l}</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a' }}>{v}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: '#999', padding: '3rem', fontSize: 12, letterSpacing: '0.1em' }}>LOADING...</p>
        ) : records.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#ccc', padding: '3rem', fontSize: 12 }}>해당 지점의 데이터가 없습니다.</p>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #ebe9e4', borderRadius: 12, overflow: 'hidden' }}>
            <table>
              <thead>
                <tr>
                  {['이름','시급','기본수당','주휴수당','연장','야간','휴일','세전합계','삭제'].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.emp_name}</td>
                    <td>{fmt(r.hourly_wage)}원</td>
                    <td>{fmt(r.basic_pay)}</td>
                    <td>{fmt(r.weekly_holiday_pay)}</td>
                    <td>{fmt(r.overtime_pay)}</td>
                    <td>{fmt(r.night_pay)}</td>
                    <td>{fmt(r.holiday_pay)}</td>
                    <td style={{ fontWeight: 700, color: '#b8954a' }}>{fmt(r.grand_total)}원</td>
                    <td style={{ textAlign: 'center' }}>
                      <button 
                        className="delete-btn" 
                        onClick={() => deleteRecord(r.id, r.emp_name)}
                        title="데이터 삭제"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
