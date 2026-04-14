import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ── 수정 #7: 서울마리나점 → 하남점 ──
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
    } catch (error) {
      console.error('데이터 로드 오류:', error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (auth) load()
  }, [auth, branch, year, month])

  async function deleteRecord(id, name) {
    if (confirm(`${name} 님의 기록을 삭제하시겠습니까?`)) {
      const { error } = await supabase.from('payroll').delete().eq('id', id)
      if (error) alert('삭제 실패'); else load()
    }
  }

  function downloadExcel() {
    const headers = ['구분', '지점', '이름', '시급', '기본수당', '주휴수당', '연장수당', '야간수당', '휴일수당', '교통/보너스', '세전합계']
    const rows = records.map(r => [
      r.emp_type || '-',
      r.branch,
      r.emp_name,
      Math.round(r.hourly_wage || 0),
      Math.round(r.basic_pay || r.total_basic || 0),
      Math.round(r.weekly_holiday_pay || r.total_weekly_holiday || 0),
      Math.round(r.overtime_pay || r.total_overtime || 0),
      Math.round(r.night_pay || r.total_night || 0),
      Math.round((r.holiday_pay || r.total_holiday || 0) + (r.holiday_overtime_pay || r.total_holiday_ot_pay || 0)),
      Math.round(r.bonus || 0),
      Math.round(r.grand_total || 0),
    ])
    const totalRow = [
      '', '합계', '', '', '', '', '', '', '', '',
      records.reduce((s, r) => s + Math.round(r.grand_total || 0), 0),
    ]

    const BOM = '\uFEFF'
    const csv = BOM + [headers, ...rows, totalRow]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `급여현황_${year}년${month}월_${branch}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function fmt(n) { return Math.round(n || 0).toLocaleString('ko-KR') }

  if (!auth) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f8f7f4' }}>
      <div style={{ background: '#fff', border: '1px solid #ebe9e4', borderRadius: 16, padding: '40px', width: 340, textAlign: 'center' }}>
        <h2 style={{ marginBottom: 20 }}>매니저 통합 관리</h2>
        <input
          type="password" placeholder="비밀번호" value={pw}
          onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (pw === MASTER_PASSWORD ? setAuth(true) : setPwError(true))}
          style={{ width: '100%', padding: '12px', marginBottom: 10, borderRadius: 8, border: '1px solid #ddd', boxSizing: 'border-box' }}
        />
        {pwError && <p style={{ color: 'red', fontSize: 12 }}>비밀번호가 틀렸습니다.</p>}
        <button
          onClick={() => pw === MASTER_PASSWORD ? setAuth(true) : setPwError(true)}
          style={{ width: '100%', padding: '12px', background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
        >입장하기</button>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: '22px' }}>
          {branch} <span style={{ color: '#b8954a' }}>급여 관리 현황</span>
        </h1>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select style={{ padding: '8px', borderRadius: '4px' }} value={branch} onChange={e => setBranch(e.target.value)}>
            {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select style={{ padding: '8px', borderRadius: '4px' }} value={year} onChange={e => setYear(Number(e.target.value))}>
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <select style={{ padding: '8px', borderRadius: '4px' }} value={month} onChange={e => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
          </select>
          <button
            onClick={load}
            style={{ padding: '8px 15px', borderRadius: '4px', background: '#fff', border: '1px solid #ccc', cursor: 'pointer' }}
          >🔄 새로고침</button>
          <button
            onClick={downloadExcel}
            disabled={records.length === 0}
            style={{
              padding: '8px 16px',
              background: records.length === 0 ? '#f0ede8' : '#1a1a1a',
              color: records.length === 0 ? '#ccc' : '#fff',
              border: 'none', borderRadius: 8,
              fontSize: 13, fontWeight: 600,
              cursor: records.length === 0 ? 'not-allowed' : 'pointer',
              letterSpacing: '0.05em', whiteSpace: 'nowrap',
            }}
          >엑셀 다운로드 ↓</button>
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
                <td style={{ padding: '15px' }}>
                  {/* ── 수정 #6: 직원/알바 뱃지 ── */}
                  {r.emp_type && (
                    <div style={{
                      fontSize: '10px', fontWeight: 700,
                      color: r.emp_type === '직원' ? '#4a90d9' : '#b8954a',
                      letterSpacing: '0.1em', marginBottom: 3,
                    }}>{r.emp_type}</div>
                  )}
                  <div style={{ fontWeight: 'bold' }}>{r.emp_name}</div>
                </td>
                <td>{fmt(r.basic_pay || r.total_basic)}</td>
                <td>{fmt(r.weekly_holiday_pay || r.total_weekly_holiday)}</td>
                <td>{fmt((r.overtime_pay || r.total_overtime || 0) + (r.night_pay || r.total_night || 0))}</td>
                <td>{fmt((r.holiday_pay || r.total_holiday || 0) + (r.holiday_overtime_pay || r.total_holiday_ot_pay || 0))}</td>
                <td style={{ fontWeight: 'bold', color: '#b8954a' }}>{fmt(r.grand_total)}원</td>
                <td style={{ verticalAlign: 'middle' }}>
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
                  <button
                    onClick={() => deleteRecord(r.id, r.emp_name)}
                    style={{ border: 'none', background: 'none', color: '#ccc', cursor: 'pointer', fontSize: '16px' }}
                  >✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
