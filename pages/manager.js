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
  
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  // 데이터 로드 함수
  async function load() {
    setLoading(true)
    try {
      // 쿼리 시점에 캐시를 타지 않도록 날짜와 지점을 명확히 필터링
      const { data, error } = await supabase
        .from('payroll')
        .select('*')
        .eq('branch', branch)
        .eq('year', year)
        .eq('month', month)
        .order('emp_name', { ascending: true })
      
      if (error) throw error
      
      // 데이터가 오면 로그로 status 값을 확인해볼 수 있습니다 (개발자 도구용)
      console.log('불러온 데이터:', data)
      setRecords(data || [])
    } catch (error) {
      console.error('데이터 로드 오류:', error.message)
    } finally {
      setLoading(false)
    }
  }

  // 지점, 년, 월이 바뀔 때마다 실행
  useEffect(() => { 
    if (auth) load() 
  }, [auth, branch, year, month])

  async function deleteRecord(id, name) {
    if (confirm(`${name} 님의 기록을 삭제하시겠습니까?`)) {
      const { error } = await supabase.from('payroll').delete().eq('id', id)
      if (error) alert('삭제 실패'); else load();
    }
  }

  function fmt(n) { return Math.round(n || 0).toLocaleString('ko-KR') }

  if (!auth) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8f7f4' }}>
      <div style={{ background: '#fff', border: '1px solid #ebe9e4', borderRadius: 16, padding: '40px', width: 340, textAlign: 'center' }}>
        <h2 style={{ marginBottom: 20 }}>매니저 통합 관리</h2>
        <input type="password" placeholder="비밀번호" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && (pw === MASTER_PASSWORD ? setAuth(true) : setPwError(true))} style={{ width: '100%', padding: '12px', marginBottom: 10, borderRadius: 8, border: '1px solid #ddd', boxSizing: 'border-box' }} />
        {pwError && <p style={{ color: 'red', fontSize: 12 }}>비밀번호가 틀렸습니다.</p>}
        <button onClick={() => pw === MASTER_PASSWORD ? setAuth(true) : setPwError(true)} style={{ width: '100%', padding: '12px', background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>입장하기</button>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '22px' }}>{branch} <span style={{ color: '#b8954a' }}>급여 관리 현황</span></h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <select style={{ padding: '8px', borderRadius: '4px' }} value={branch} onChange={e => setBranch(e.target.value)}>{BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}</select>
          <select style={{ padding: '8px', borderRadius: '4px' }} value={year} onChange={e => setYear(Number(e.target.value))}>{[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}년</option>)}</select>
          <select style={{ padding: '8px', borderRadius: '4px' }} value={month} onChange={e => setMonth(Number(e.target.value))}>{Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}월</option>)}</select>
          <button onClick={load} style={{ padding: '8px 15px', borderRadius: '4px', background: '#fff', border: '1px solid #ccc', cursor: 'pointer' }}>🔄 새로고침</button>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #ebe9e4', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f8f7f4' }}>
            <tr style={{ fontSize: '13px', color: '#666' }}>
              <th style={{ padding: '15px' }}>이름</th>
              <th>기본수당</th>
              <th>주휴수당</th>
              <th>연장/야간</th>
              <th>휴일수당</th>
              <th>총지급액</th>
              <th>마감상태</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" style={{ padding: '40px', textAlign: 'center' }}>데이터 로딩 중...</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan="8" style={{ padding: '40px', textAlign: 'center' }}>해당 월의 데이터가 없습니다.</td></tr>
            ) : records.map(r => (
              <tr key={r.id} style={{ borderBottom: '1px solid #eee', textAlign: 'center' }}>
                <td style={{ padding: '15px', fontWeight: 'bold' }}>{r.emp_name}</td>
                <td>{fmt(r.total_basic || r.basic_pay)}</td>
                <td>{fmt(r.total_weekly_holiday || r.weekly_holiday_pay)}</td>
                <td>{fmt((r.total_overtime || 0) + (r.total_night || 0))}</td>
                <td>{fmt((r.total_holiday || 0) + (r.total_holiday_ot_pay || 0))}</td>
                <td style={{ fontWeight: 'bold', color: '#b8954a' }}>{fmt(r.grand_total)}원</td>
                <td style={{ verticalAlign: 'middle' }}>
                  {/* 불빛 로직: r.status 값이 'final'인지 확인 */}
                  <div style={{ 
                    width: '14px', height: '14px', borderRadius: '50%', margin: '0 auto',
                    background: r.status === 'final' ? '#2ecc71' : '#f1c40f',
                    boxShadow: r.status === 'final' ? '0 0 10px #2ecc71' : '0 0 10px #f1c40f',
                    transition: 'all 0.3s'
                  }} title={r.status === 'final' ? '최종마감 완료' : '임시저장/작성중'} />
                  <div style={{ fontSize: '10px', marginTop: '4px', color: r.status === 'final' ? '#2ecc71' : '#f39c12' }}>
                    {r.status === 'final' ? '마감' : '진행중'}
                  </div>
                </td>
                <td>
                  <button onClick={() => deleteRecord(r.id, r.emp_name)} style={{ border: 'none', background: 'none', color: '#ccc', cursor: 'pointer', fontSize: '16px' }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
