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
    // .order('emp_name')를 추가하여 이름순 정렬을 제공하면 더 편리합니다.
    const { data, error } = await supabase
      .from('payroll')
      .select('*')
      .eq('branch', branch)
      .eq('year', year)
      .eq('month', month)
      .order('emp_name', { ascending: true })
    
    if (error) {
      console.error('데이터 로드 실패:', error.message)
    } else {
      setRecords(data || [])
    }
    setLoading(false)
  }

  async function deleteRecord(id, name) {
    if (confirm(`${name} 님의 해당 월 급여 기록을 삭제하시겠습니까?`)) {
      const { error } = await supabase.from('payroll').delete().eq('id', id)
      if (error) alert('삭제 실패: ' + error.message)
      else { 
        alert('정상적으로 삭제되었습니다.')
        load() 
      }
    }
  }

  useEffect(() => { 
    if (auth) load() 
  }, [auth, branch, year, month])

  function fmt(n) { 
    return Math.round(n || 0).toLocaleString('ko-KR') 
  }

  // 비밀번호 입력창
  if (!auth) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8f7f4' }}>
      <div style={{ background: '#fff', border: '1px solid #ebe9e4', borderRadius: 16, padding: '40px', width: 340, textAlign: 'center' }}>
        <h2 style={{ marginBottom: 20, fontSize: 18 }}>관리자 통합 로그인</h2>
        <input 
          type="password" 
          placeholder="마스터 비밀번호" 
          value={pw} 
          onChange={e => setPw(e.target.value)} 
          onKeyDown={e => e.key === 'Enter' && (pw === MASTER_PASSWORD ? setAuth(true) : setPwError(true))} 
          style={{ width: '100%', padding: '11px', marginBottom: 10, borderRadius: 8, border: '1px solid #ebe9e4', boxSizing: 'border-box' }} 
        />
        {pwError && <p style={{ color: '#e05555', fontSize: 12, marginBottom: 10 }}>비밀번호가 틀렸습니다.</p>}
        <button 
          onClick={() => pw === MASTER_PASSWORD ? setAuth(true) : setPwError(true)} 
          style={{ width: '100%', padding: '12px', background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
        >입장</button>
      </div>
    </div>
  )

  // 총 합계 계산 (grand_total 컬럼 기준)
  const totalGrand = records.reduce((s, r) => s + (Number(r.grand_total) || 0), 0)

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 1.5rem', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: 24 }}>{branch} <span style={{ color: '#b8954a' }}>급여 현황</span></h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <select style={{ padding: '8px', borderRadius: 6 }} value={branch} onChange={e => setBranch(e.target.value)}>{BRANCHES.map(b => <option key={b}>{b}</option>)}</select>
          <select style={{ padding: '8px', borderRadius: 6 }} value={year} onChange={e => setYear(Number(e.target.value))}>{[2025, 2026].map(y => <option key={y}>{y}</option>)}</select>
          <select style={{ padding: '8px', borderRadius: 6 }} value={month} onChange={e => setMonth(Number(e.target.value))}>{Array.from({length:12},(_,i)=>i+1).map(m => <option key={m}>{m}월</option>)}</select>
          <button onClick={load} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>새로고침</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <div style={{ background: '#fff', padding: 20, borderRadius: 10, border: '1px solid #ebe9e4', flex: 1 }}>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>총 직원 수</div>
          <div style={{ fontSize: 20, fontWeight: 'bold' }}>{records.length}명</div>
        </div>
        <div style={{ background: '#fff', padding: 20, borderRadius: 10, border: '1px solid #ebe9e4', flex: 1 }}>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>총 지급액 합계</div>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: '#b8954a' }}>{fmt(totalGrand)}원</div>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #ebe9e4', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
          <thead style={{ background: '#f8f7f4' }}>
            <tr>
              {['이름','시급','기본수당','주휴','연장/야간','휴일합계','총급여','상태','삭제'].map(h => (
                <th key={h} style={{ padding: '15px 12px', textAlign: 'left', fontSize: 12, color: '#999', borderBottom: '1px solid #ebe9e4' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="9" style={{ textAlign: 'center', padding: 40 }}>데이터를 불러오는 중...</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan="9" style={{ textAlign: 'center', padding: 40 }}>데이터가 없습니다.</td></tr>
            ) : records.map(r => {
              // DB 컬럼명 확인 필수 (snake_case로 저장되었다고 가정)
              const basic = r.total_basic || r.basic_pay || 0;
              const weekly = r.total_weekly_holiday || r.weekly_holiday_pay || 0;
              const extra = (r.total_overtime || 0) + (r.total_night || 0);
              const holiday = (r.total_holiday || 0) + (r.total_holiday_ot_pay || 0) + (r.total_holiday_night_pay || 0);

              return (
                <tr key={r.id} style={{ borderBottom: '1px solid #f0ede8' }}>
                  <td style={{ padding: 15, fontWeight: 'bold' }}>{r.emp_name}</td>
                  <td style={{ padding: 15 }}>{fmt(r.hourly_wage)}원</td>
                  <td style={{ padding: 15 }}>{fmt(basic)}</td>
                  <td style={{ padding: 15 }}>{fmt(weekly)}</td>
                  <td style={{ padding: 15 }}>{fmt(extra)}</td>
                  <td style={{ padding: 15 }}>{fmt(holiday)}</td>
                  <td style={{ padding: 15, fontWeight: 'bold', color: '#b8954a' }}>{fmt(r.grand_total)}원</td>
                  <td style={{ padding: 15, textAlign: 'center' }}>
                    <div style={{ 
                      width: 12, height: 12, borderRadius: '50%', margin: '0 auto',
                      background: r.status === 'final' ? '#4CAF50' : '#FFC107',
                      boxShadow: r.status === 'final' ? '0 0 8px #4CAF50' : '0 0 8px #FFC107'
                    }} title={r.status === 'final' ? '마감 완료' : '저장됨'} />
                  </td>
                  <td style={{ padding: 15, textAlign: 'center' }}>
                    <button onClick={() => deleteRecord(r.id, r.emp_name)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ccc', fontSize: 18 }}>✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
