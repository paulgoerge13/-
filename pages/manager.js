import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const BRANCHES = ['광명GIDC점', '인계점', '안양일번가점', '익산점', '인천주안점', '서울마리나점']
const MASTER_PASSWORD = process.env.NEXT_PUBLIC_MANAGER_PASSWORD || 'comma1234'

export default function PayrollManager() {
  const [auth, setAuth] = useState(false)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState(false)
  const [branch, setBranch] = useState('광명GIDC점') 
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('payroll')
      .select('*')
      .eq('branch', branch)
      .eq('year', year)
      .eq('month', month)
    
    if (error) console.error(error)
    setRecords(data || [])
    setLoading(false)
  }

  async function deleteRecord(id, name) {
    if (confirm(`${name} 님의 해당 월 급여 기록을 삭제하시겠습니까?`)) {
      const { error } = await supabase.from('payroll').delete().eq('id', id)
      if (error) alert('삭제 실패: ' + error.message)
      else { alert('정상적으로 삭제되었습니다.'); load(); }
    }
  }

  useEffect(() => { if (auth) load() }, [auth, branch, year, month])

  function fmt(n) { return Math.round(n || 0).toLocaleString('ko-KR') }

  if (!auth) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8f7f4' }}>
      <div style={{ background: '#fff', border: '1px solid #ebe9e4', borderRadius: 16, padding: '40px', width: 340, textAlign: 'center' }}>
        <input type="password" placeholder="마스터 비밀번호" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && (pw === MASTER_PASSWORD ? setAuth(true) : setPwError(true))} style={{ width: '100%', padding: '11px', marginBottom: 10, borderRadius: 8, border: '1px solid #ebe9e4' }} />
        {pwError && <p style={{ color: '#e05555', fontSize: 12 }}>비밀번호가 틀렸습니다.</p>}
        <button onClick={() => pw === MASTER_PASSWORD ? setAuth(true) : setPwError(true)} style={{ width: '100%', padding: '12px', background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 8 }}>입장</button>
      </div>
    </div>
  )

  const totalGrand = records.reduce((s, r) => s + (r.grand_total || 0), 0)

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 1.5rem', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
        <h1>{branch} 급여 현황</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={branch} onChange={e => setBranch(e.target.value)}>{BRANCHES.map(b => <option key={b}>{b}</option>)}</select>
          <select value={year} onChange={e => setYear(Number(e.target.value))}>{[2025, 2026].map(y => <option key={y}>{y}</option>)}</select>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}>{Array.from({length:12},(_,i)=>i+1).map(m => <option key={m}>{m}월</option>)}</select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <div style={{ background: '#fff', padding: 20, borderRadius: 10, border: '1px solid #ebe9e4', flex: 1 }}>
          <div style={{ fontSize: 12, color: '#999' }}>총 직원 수</div>
          <div style={{ fontSize: 20, fontWeight: 'bold' }}>{records.length}명</div>
        </div>
        <div style={{ background: '#fff', padding: 20, borderRadius: 10, border: '1px solid #ebe9e4', flex: 1 }}>
          <div style={{ fontSize: 12, color: '#999' }}>총 지급액</div>
          <div style={{ fontSize: 20, fontWeight: 'bold' }}>{fmt(totalGrand)}원</div>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #ebe9e4', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f8f7f4' }}>
            <tr>
              {['이름','시급','기본','주휴','연장','야간','휴일','총급여','상태','삭제'].map(h => <th key={h} style={{ padding: 12, textAlign: 'left', fontSize: 12, color: '#999' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #f0ede8' }}>
                <td style={{ padding: 12, fontWeight: 'bold' }}>{r.emp_name}</td>
                <td style={{ padding: 12 }}>{fmt(r.hourly_wage)}원</td>
                <td style={{ padding: 12 }}>{fmt(r.basic_pay)}</td>
                <td style={{ padding: 12 }}>{fmt(r.weekly_holiday_pay)}</td>
                <td style={{ padding: 12 }}>{fmt(r.overtime_pay)}</td>
                <td style={{ padding: 12 }}>{fmt(r.night_pay)}</td>
                <td style={{ padding: 12 }}>{fmt(r.holiday_pay)}</td>
                <td style={{ padding: 12, fontWeight: 'bold', color: '#b8954a' }}>{fmt(r.grand_total)}원</td>
                <td style={{ padding: 12, textAlign: 'center' }}>
                  {/* 상태 표시등: status가 'final'이면 초록색, 아니면 노란색 */}
                  <div style={{ 
                    width: 12, height: 12, borderRadius: '50%', margin: '0 auto',
                    background: r.status === 'final' ? '#4CAF50' : '#FFC107',
                    boxShadow: r.status === 'final' ? '0 0 8px #4CAF50' : '0 0 8px #FFC107'
                  }} title={r.status === 'final' ? '마감 완료' : '저장됨'} />
                </td>
                <td style={{ padding: 12, textAlign: 'center' }}>
                  <button onClick={() => deleteRecord(r.id, r.emp_name)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ccc' }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
