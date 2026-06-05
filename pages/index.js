import { useState, useEffect, useRef } from 'react'

// ── 수정 #7: 서울마리나점 → 하남점 ──
const BRANCHES = [
  { id: 'gidc',   name: '광명GIDC점',  password: 'gidc1234' },
  { id: 'ingye',  name: '인계점',       password: 'ingye13' },
  { id: 'anyang', name: '안양일번가점', password: 'anyang30' },
  { id: 'iksan',  name: '익산점',       password: 'iksan08' },
  { id: 'juan',   name: '인천주안점',   password: 'juan00' },
  { id: 'hanam',  name: '하남점',       password: 'hanam77' },
]

function calcBasic(h, w)        { return Math.round(h * w) }
function calcOvertime(h, w)     { return Math.round(h * w * 1.5) }
function calcNight(h, w)        { return Math.round(h * w * 0.5) }
function calcHoliday(h, w)      { return Math.round(h * w * 1.5) }
function calcHolidayOt(h, w)    { return Math.round(h * w * 2.0) }
function calcHolidayNight(h, w) { return Math.round(h * w * 0.5) }
function calcWeeklyHoliday(weekH, w) {
  if (weekH < 15) return 0
  return Math.round((weekH / 40) * 8 * w)
}

function getWeeksInMonth(year, month) {
  const lastDay = new Date(year, month, 0)
  const weeks = []
  let current = new Date(year, month - 1, 1)
  const dow = current.getDay()
  current = new Date(current.getTime() + (dow === 0 ? -6 : 1 - dow) * 86400000)
  while (current <= lastDay) {
    const week = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(current.getTime() + i * 86400000)
      week.push(d.getMonth() + 1 === month ? d.getDate() : null)
    }
    if (week.some(d => d !== null)) weeks.push(week)
    current = new Date(current.getTime() + 7 * 86400000)
  }
  return weeks
}

// ── 수정 #2: 시간 문자열 자동 포맷 (9→09:00, 930→09:30, 18→18:00 등) ──
function formatTimeInput(raw) {
  const s = String(raw).replace(/[^0-9]/g, '')
  if (!s) return '00:00'
  if (s.length <= 2) {
    const h = parseInt(s, 10)
    return `${String(h).padStart(2, '0')}:00`
  }
  if (s.length === 3) {
    const h = parseInt(s.slice(0, 1), 10)
    const m = s.slice(1)
    return `${String(h).padStart(2, '0')}:${m}`
  }
  const h = parseInt(s.slice(0, 2), 10)
  const m = s.slice(2, 4)
  return `${String(h).padStart(2, '0')}:${m}`
}

// ── 수정 #2: 시작~종료 시간으로 기본 근무시간 자동 계산 ──
function calcAutoHours(startStr, endStr) {
  if (!startStr || !endStr) return null
  const parseTime = (t) => {
    const [h, m] = t.split(':').map(Number)
    return h + (m || 0) / 60
  }
  let start = parseTime(startStr)
  let end = parseTime(endStr)
  if (isNaN(start) || isNaN(end)) return null
  if (end <= start) end += 24 // 자정 넘기는 케이스
  const raw = end - start // 휴게 차감 없음 (수동 입력)
  return raw > 0 ? Math.round(raw * 2) / 2 : 0
}

// ── 시작~종료 시간을 주간/야간으로 자동 분리 ──
// 주간: 06:00~22:00 / 야간: 22:00~다음날 06:00
function calcDayNightHours(startStr, endStr) {
  if (!startStr || !endStr) return null
  const parseTime = (t) => { const [h, m] = t.split(':').map(Number); return h + (m || 0) / 60 }
  let s = parseTime(startStr)
  let e = parseTime(endStr)
  if (isNaN(s) || isNaN(e)) return null
  if (e === s) return { day: 0, night: 0, total: 0 } // 시작=종료 → 0시간
  if (e < s) e += 24 // 자정 넘기는 케이스
  const overlap = (a, b) => Math.max(0, Math.min(e, b) - Math.max(s, a))
  // 야간 구간: 매일 22:00~다음날 06:00 (전날/당일/다음날 반복)
  let night = 0
  for (let d = -1; d <= 1; d++) night += overlap(d * 24 + 22, d * 24 + 30)
  const total = e - s
  const r = (x) => Math.round(x * 2) / 2
  const nightR = r(night)
  return { day: r(total - night), night: nightR, total: r(total) }
}

// ── 휴게시간을 야간에서 먼저 차감, 모자라면 주간에서 차감 ──
// 예: 20:00~05:00(주간2/야간7) + 휴게1 → 주간2 / 야간6
function netSplit(startStr, endStr, rest) {
  const split = calcDayNightHours(startStr, endStr)
  if (!split) return null
  const restH = Number(rest) || 0
  const night = Math.max(0, split.night - restH)
  const leftover = Math.max(0, restH - split.night)
  const day = Math.max(0, split.day - leftover)
  return { day, night }
}

// ── 주간/야간 보정 (보수적: 수동 입력값은 절대 안 건드림) ──
// 매니저가 직접 넣은 주간/야간 값을 시간 기준으로 덮어쓰면 안 됨(예: 박태주 5/16 주간8).
// 그래서 "명백히 비었거나(0/0) 물리적으로 불가능하거나 휴게 미반영"인 경우에만 보정한다.
// 멱등(idempotent) — 여러 번 돌려도 결과 동일.
function fixRestDeduction(d) {
  if (!d || typeof d !== 'object') return d
  const type = d.type || '평'
  if (type === '공' || type === '연' || type === '결') return d // 휴무·연차·결근은 시간 없음
  if (!d.timeStart || !d.timeEnd) return d      // 시간이 직접 저장된 날만 대상
  const gross = calcDayNightHours(d.timeStart, d.timeEnd)
  if (!gross || gross.total <= 0) return d       // 0시간(시작=종료)이면 손대지 않음

  const isHol = type === '휴'
  const dayKey   = isHol ? 'holidayDaytimeH' : 'daytimeH'
  const nightKey = isHol ? 'holidayNightH'   : 'nightH'
  const restKey  = isHol ? 'holidayRestH'    : 'restH'
  const sDay   = d[dayKey]   || 0
  const sNight = d[nightKey] || 0
  const rest   = d[restKey]  || 0

  // ★ 휴게 미차감 정정: 휴게를 입력했는데 주간+야간 합이 "실근무 시계시간"과 똑같으면
  //   = 휴게가 주간/야간에서 전혀 안 빠진 것(명백) → 휴게만큼 차감해 정정한다.
  //   (예: 09:30~18:30(9시간) 휴게1인데 주간9로 저장된 날 → 주간8. 야간에서 먼저 빼고 모자라면 주간.)
  //   매니저가 시간과 다르게 직접 늘리거나 줄인 값(합 ≠ 시계시간)은 건드리지 않는다. 멱등.
  if (rest > 0 && Math.abs((sDay + sNight) - gross.total) < 0.001) {
    const night2 = Math.max(0, sNight - rest)
    const leftover = Math.max(0, rest - sNight)
    const day2 = Math.max(0, sDay - leftover)
    return { ...d, [dayKey]: day2, [nightKey]: night2 }
  }

  // ★ 매니저가 입력한 값은 (휴게 정정 외에는) 절대 건드리지 않는다.
  //   주간·야간 중 하나라도 0이 아니면 = 사람이 직접 넣은 값 → 그대로 둠.
  if (sDay !== 0 || sNight !== 0) return d

  // 주간·야간이 "완전히 비어있는(0/0)" 날만, 입력된 시간 기준으로 채움.
  //   (시간은 있는데 분리값이 누락된 경우. 안 채우면 0시간=0원으로 보임.)
  const net = netSplit(d.timeStart, d.timeEnd, rest)
  if (!net) return d
  return { ...d, [dayKey]: net.day, [nightKey]: net.night }
}

// ── 구버전 데이터 마이그레이션 ──
// 예전 버전은 평일 근무를 basicH(주간+야간 합), 휴일을 holidayH 에 저장했음.
// 새 버전은 daytimeH(주간)/nightH(야간), holidayDaytimeH/holidayNightH 로 분리해 계산함.
// 5월 등 기존 입력 데이터가 새 계산식에서도 동일하게 나오도록 옛 필드를 새 필드로 접어 넣음.
// 멱등(idempotent): 이미 변환된 데이터는 basicH/holidayH 가 0 이라 그대로 통과.
function migrateWorkData(workData) {
  if (!workData || typeof workData !== 'object') return workData || {}
  const out = {}
  for (const [ds, d] of Object.entries(workData)) {
    let nd
    if (d && ((d.basicH || 0) > 0 || (d.holidayH || 0) > 0)) {
      const night = d.nightH || 0
      // 옛 필드(basicH/holidayH)가 권위 있는 값이므로 새 필드를 "덮어쓰기"(누적 X)
      nd = {
        ...d,
        daytimeH: Math.max(0, (d.basicH || 0) - night),
        nightH: night,
        holidayDaytimeH: (d.holidayH || 0),
        holidayNightH: d.holidayNightH || 0,
        basicH: 0,
        holidayH: 0,
      }
    } else {
      nd = d
    }
    out[ds] = fixRestDeduction(nd) // 시간 기준 주간/야간 자동 재계산
  }
  return out
}

// ── 근무기록 엑셀 파싱 헬퍼 ──
const pad2 = (n) => String(n).padStart(2, '0')

function parseExcelDate(v) {
  if (v == null || v === '') return null
  if (v instanceof Date) return { year: v.getFullYear(), month: v.getMonth() + 1, day: v.getDate() }
  const m = String(v).match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/)
  return m ? { year: +m[1], month: +m[2], day: +m[3] } : null
}

function parseExcelTime(v) {
  if (v == null || v === '') return null
  if (v instanceof Date) return `${pad2(v.getHours())}:${pad2(v.getMinutes())}`
  const s = String(v)
  const m = s.match(/(\d{1,2}):(\d{2})/) // "20:48" 또는 "2026-05-01 20:48:00"
  if (m) return `${pad2(+m[1])}:${m[2]}`
  const num = Number(s) // 엑셀 시간 소수 (0~1)
  if (!isNaN(num) && num >= 0 && num < 1) {
    const totalMin = Math.round(num * 24 * 60)
    return `${pad2(Math.floor(totalMin / 60))}:${pad2(totalMin % 60)}`
  }
  return null
}

function parseExcelHours(v) {
  if (!v) return 0
  if (v instanceof Date) return v.getHours() + v.getMinutes() / 60
  const s = String(v).trim()
  const colon = s.match(/(\d{1,2}):(\d{2})/) // "01:00" → 1.0
  if (colon) return +colon[1] + (+colon[2]) / 60
  // 한글 형식: "1시간 30분", "90분", "30분", "1시간"
  if (s.includes('시간') || s.includes('분')) {
    const hM = s.match(/(\d+)\s*시간/)
    const mM = s.match(/(\d+)\s*분/)
    return (hM ? +hM[1] : 0) + (mM ? +mM[1] / 60 : 0)
  }
  const num = Number(s)
  if (!isNaN(num)) return num // 숫자만 있으면 시간 단위로 간주 (예: 0.5 → 30분)
  return 0
}

// 지점명 매칭: "더콤마라운지 광명점" ↔ "광명GIDC점"
function normBranch(s) { return String(s || '').replace(/더콤마라운지|점|\s/g, '') }
function branchMatches(appName, wsName) {
  const a = normBranch(appName), w = normBranch(wsName)
  return !!(a && w && (a.includes(w) || w.includes(a)))
}

const EMPTY_EMP = {
  name: '', residentId: '', phone: '', email: '',
  accountNumber: '',
  empType: '알바',
  useBasicCalc: false,  // 직원일 때 기본/주휴 계산기 켜기
  hourlyWage: 10320,                          // ── 수정 A: 기본 시급 변경 ──
  defaultTimeStart: '00:00', defaultTimeEnd: '00:00', // ── 수정 A: 기본 시간 00:00 ──
  workData: {}, specialNote: '',
  manualBasic: 0, manualWeeklyHoliday: 0, manualOvertime: 0,
  manualNight: 0, manualHoliday: 0, manualHolidayOt: 0, manualHolidayNight: 0,
  deductionType: 'none',   // 공제 방식: 'none' | '3.3' | '4대'
  manualIncomeTax: 0,      // 4대보험 모드일 때 소득세(세무사 안내값 수동입력)
  mealAllowance: 0,        // 식대 (비과세) — 4대보험·소득세 산정에서 제외
  birthDate: '',           // 생년월일 (명세서용, 비우면 주민번호 앞자리에서 자동)
  hireDate: '',            // 입사일 (YYYY-MM-DD) — 직원 기본급 일할계산용. 비우면 월초부터 만근
  resignDate: '',          // 퇴사일 (YYYY-MM-DD) — 직원 기본급 일할계산용. 비우면 월말까지 만근
  year: new Date().getFullYear(), month: new Date().getMonth() + 1,
}

// ── DB에 컬럼이 없는 '직원 고정 설정' 영구 저장 ──
// 공제방식·소득세·식대·생년월일·입사일·퇴사일은 Supabase payroll 테이블에 컬럼이 없어서
// DB에서 다시 불러올 때 매번 초기화됐다(=리셋 버그). 이 값들은 지점별·직원이름별로
// 별도 localStorage 키에 따로 저장해 두고, DB 로드 후 다시 덮어 씌워 유지한다.
const EMP_SETTINGS_FIELDS = ['deductionType', 'manualIncomeTax', 'mealAllowance', 'birthDate', 'hireDate', 'resignDate']
function empSettingsKey(branchName) { return `payroll_empsettings_${branchName}` }
function loadAllEmpSettings(branchName) {
  if (typeof window === 'undefined' || !branchName) return {}
  try { return JSON.parse(localStorage.getItem(empSettingsKey(branchName)) || '{}') } catch { return {} }
}
function saveEmpSettings(branchName, empName, emp) {
  if (typeof window === 'undefined' || !branchName || !empName) return
  const all = loadAllEmpSettings(branchName)
  const patch = {}
  EMP_SETTINGS_FIELDS.forEach(f => { patch[f] = emp[f] })
  all[empName] = patch
  localStorage.setItem(empSettingsKey(branchName), JSON.stringify(all))
}
function applyEmpSettings(emp, settingsMap) {
  const s = settingsMap[emp.name]
  if (!s) return emp
  const out = { ...emp }
  EMP_SETTINGS_FIELDS.forEach(f => { if (s[f] !== undefined && s[f] !== '') out[f] = s[f] })
  return out
}

// ── 날짜 문자열(YYYY-MM-DD) → Date (시각 0시), 못 읽으면 null ──
function parseYMD(s) {
  if (!s) return null
  const m = String(s).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

// ── 입사일 이전 / 퇴사일 이후 근무표 칸 제거 (퇴사자 정리) ──
// 입사일·퇴사일을 입력하면 그 범위 밖의 날짜 데이터를 깔끔하게 비운다.
function pruneWorkDataToEmployment(workData, hireDate, resignDate) {
  if (!workData || typeof workData !== 'object') return workData || {}
  const hire = parseYMD(hireDate)
  const resign = parseYMD(resignDate)
  if (!hire && !resign) return workData
  const out = {}
  for (const [ds, d] of Object.entries(workData)) {
    const dd = parseYMD(ds)
    if (dd && hire && dd < hire) continue        // 입사 전 → 제거
    if (dd && resign && dd > resign) continue     // 퇴사 후 → 제거
    out[ds] = d
  }
  return out
}

// ── 직원 중도 입·퇴사 일할계산: 해당 월의 재직일수 / 그 달 총일수 비율 ──
// hireDate/resignDate가 해당 월 범위에 걸치면 재직일수를 역일(달력일) 기준으로 계산.
// 반환: { ratio, activeDays, monthDays } — 만근이면 ratio 1
function calcProration(emp) {
  const monthDays = new Date(emp.year, emp.month, 0).getDate()
  const monthStart = new Date(emp.year, emp.month - 1, 1)
  const monthEnd   = new Date(emp.year, emp.month - 1, monthDays)
  const hire = parseYMD(emp.hireDate)
  const resign = parseYMD(emp.resignDate)
  // 입사일이 이 달 이후이거나, 퇴사일이 이 달 이전이면 재직 0일
  if (hire && hire > monthEnd) return { ratio: 0, activeDays: 0, monthDays }
  if (resign && resign < monthStart) return { ratio: 0, activeDays: 0, monthDays }
  const start = hire && hire > monthStart ? hire : monthStart
  const end   = resign && resign < monthEnd ? resign : monthEnd
  if (end < start) return { ratio: 0, activeDays: 0, monthDays }
  const activeDays = Math.round((end - start) / 86400000) + 1 // 양끝 포함
  // 만근(둘 다 월 범위 밖)이면 그대로 1
  const isFull = (!hire || hire <= monthStart) && (!resign || resign >= monthEnd)
  return { ratio: isFull ? 1 : activeDays / monthDays, activeDays, monthDays, partial: !isFull }
}

// ── 4대보험 요율 (2025년 기준 · 근로자 부담분) ──
// 매년 변동될 수 있어, 필요 시 이 숫자만 수정하면 전체에 반영됩니다.
const RATE_PENSION    = 0.045    // 국민연금 4.5%
const RATE_HEALTH     = 0.03545  // 건강보험 3.545%
const RATE_CARE       = 0.1295   // 장기요양 (건강보험료의 12.95%)
const RATE_EMPLOYMENT = 0.009    // 고용보험 0.9%

// ── 공제 계산: 세전 총액(gross) 기준으로 항목별 공제액 산출 ──
function calcDeductions(gross, emp) {
  const dt = emp.deductionType || 'none'
  let pension = 0, health = 0, care = 0, employment = 0, incomeTax = 0, localTax = 0, bizTax = 0
  if (dt === '4대') {
    pension    = Math.floor(gross * RATE_PENSION / 10) * 10   // 10원 미만 절사 (4대보험 관행)
    health     = Math.floor(gross * RATE_HEALTH / 10) * 10
    care       = Math.floor(health * RATE_CARE / 10) * 10
    employment = Math.floor(gross * RATE_EMPLOYMENT / 10) * 10
    incomeTax  = emp.manualIncomeTax || 0
    localTax   = Math.floor((incomeTax * 0.1) / 10) * 10
  } else if (dt === '3.3') {
    bizTax     = Math.round(gross * 0.03)    // 사업소득세 3%
    localTax   = Math.round(gross * 0.003)   // 지방소득세 0.3%
  }
  const total = pension + health + care + employment + incomeTax + localTax + bizTax
  return { dt, pension, health, care, employment, incomeTax, localTax, bizTax, total, net: gross - total }
}

// ── 법정공휴일 (참고용 시각 표시 · 급여 계산에는 영향 없음) ──
// 휴일근로 수당은 달력에서 직접 '휴' 유형으로 지정해야 적용됩니다.
const HOLIDAYS = {
  '2025-01-01': '신정', '2025-01-28': '설날', '2025-01-29': '설날', '2025-01-30': '설날',
  '2025-03-01': '삼일절', '2025-03-03': '대체휴일', '2025-05-05': '어린이날·석가탄신일', '2025-05-06': '대체휴일',
  '2025-06-06': '현충일', '2025-08-15': '광복절', '2025-10-03': '개천절',
  '2025-10-05': '추석', '2025-10-06': '추석', '2025-10-07': '추석', '2025-10-08': '대체휴일',
  '2025-10-09': '한글날', '2025-12-25': '성탄절',
  '2026-01-01': '신정', '2026-02-16': '설날', '2026-02-17': '설날', '2026-02-18': '설날',
  '2026-03-01': '삼일절', '2026-03-02': '대체휴일', '2026-05-05': '어린이날', '2026-05-24': '석가탄신일', '2026-05-25': '대체휴일',
  '2026-06-06': '현충일', '2026-08-15': '광복절', '2026-08-17': '대체휴일', '2026-09-24': '추석', '2026-09-25': '추석', '2026-09-26': '추석',
  '2026-10-03': '개천절', '2026-10-05': '대체휴일', '2026-10-09': '한글날', '2026-12-25': '성탄절',
}

export default function Home() {
  const [step, setStep] = useState('branch')
  const [selectedBranch, setSelectedBranch] = useState(null)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState(false)
  const [employees, setEmployees] = useState([{ ...EMPTY_EMP, id: Date.now() }])
  const [activeEmpId, setActiveEmpId] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [tooltipInfo, setTooltipInfo] = useState(null)
  // ── 수정 #2: 시간 입력 임시 상태 (셀별) ──
  const [timeInputs, setTimeInputs] = useState({}) // { [ds]: { start, end } }
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef(null)
  const saveTimer = useRef(null)

  useEffect(() => {
    const saved = localStorage.getItem('payroll_backup')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setEmployees(parsed.map(e => ({ ...e, workData: migrateWorkData(e.workData) })))
      } catch (e) {}
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('payroll_backup', JSON.stringify(employees))
  }, [employees])

  // ── 버그픽스: empId를 인자로 받아 클로저 stale 문제 해결 ──
  async function loadData(branchName, empName, yr, mo, empId) {
    if (!branchName || !empName) return
    const targetId = empId || activeEmpId
    try {
      const res = await fetch(`/api/load?branch=${encodeURIComponent(branchName)}&name=${encodeURIComponent(empName)}&year=${yr}&month=${mo}`)
      const result = await res.json()
      if (result.success && result.data) {
        setEmployees(prev => prev.map(e => {
          if (e.id !== targetId) return e
          if (e._dirty) return e   // 엑셀로 불러온/미저장 데이터는 덮어쓰지 않음
          const r = result.data
          // DB에 저장된 고정 설정이 있으면 그것을 우선, 없으면 기존 값 유지
          const keepIf = (dbVal, cur) => (dbVal !== undefined && dbVal !== null && dbVal !== '') ? dbVal : cur
          const merged = {
            ...e,
            workData: migrateWorkData(r.work_data || {}),
            specialNote: r.special_note || '',
            hourlyWage: r.hourly_wage || 10320,
            hireDate:        keepIf(r.hire_date, e.hireDate),
            resignDate:      keepIf(r.resign_date, e.resignDate),
            birthDate:       keepIf(r.birth_date, e.birthDate),
            deductionType:   keepIf(r.deduction_type, e.deductionType),
            manualIncomeTax: keepIf(r.income_tax, e.manualIncomeTax),
            mealAllowance:   keepIf(r.meal_allowance, e.mealAllowance),
          }
          merged.workData = pruneWorkDataToEmployment(merged.workData, merged.hireDate, merged.resignDate)
          return merged
        }))
      }
      // 데이터 없으면 workData 빈 상태 유지 (이미 초기화됐으므로 OK)
    } catch (e) { console.error('데이터 로드 실패:', e) }
  }

  const activeEmp = employees.find(e => e.id === activeEmpId) || employees[0]

  useEffect(() => {
    if (step === 'main' && selectedBranch && activeEmp?.name) {
      loadData(selectedBranch.name, activeEmp.name, activeEmp.year, activeEmp.month, activeEmpId)
    }
  }, [activeEmpId, activeEmp?.month, activeEmp?.year])

  useEffect(() => {
    if (selectedBranch) {
      const storageKey = `payroll_backup_${selectedBranch.name}`
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          setEmployees(parsed.map(e => ({ ...e, workData: migrateWorkData(e.workData) })))
          if (parsed.length > 0) setActiveEmpId(parsed[0].id)
        } catch (e) {}
      } else {
        const initialEmp = [{ ...EMPTY_EMP, id: Date.now() }]
        setEmployees(initialEmp)
        setActiveEmpId(initialEmp[0].id)
      }
    }
  }, [selectedBranch])

  useEffect(() => {
    if (selectedBranch && employees.length > 0) {
      const storageKey = `payroll_backup_${selectedBranch.name}`
      localStorage.setItem(storageKey, JSON.stringify(employees))
    }
  }, [employees, selectedBranch])

  const handleBranchChange = () => {
    if (confirm('지점을 변경하시겠습니까? 현재 입력 중인 내용은 이 지점에 자동 저장됩니다.')) {
      setStep('branch')
      setSelectedBranch(null)
      setPw('')
      setPwError(false)
    }
  }

  function updateEmp(field, value) {
    setEmployees(prev => prev.map(e => {
      if (e.id !== activeEmpId) return e
      const next = { ...e, [field]: value }
      // 입사일/퇴사일을 바꾸면 그 범위 밖의 근무표 칸을 즉시 정리(퇴사자 정리)
      if (field === 'hireDate' || field === 'resignDate') {
        next.workData = pruneWorkDataToEmployment(next.workData, next.hireDate, next.resignDate)
      }
      // DB 컬럼이 없는 고정 설정(입·퇴사일·공제·식대 등)은 별도 키에 영구 저장 → 리셋 방지
      if (EMP_SETTINGS_FIELDS.includes(field) && selectedBranch && next.name) {
        saveEmpSettings(selectedBranch.name, next.name, next)
      }
      return next
    }))
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => autoSave(), 1500)
  }

  // ── 월 변경 시 로컬스토리지 저장 후 새 월 로드 (Supabase 호출 없음) ──
  async function handleMonthChange(newMonth) {
    const emp = employees.find(e => e.id === activeEmpId) || employees[0]
    // 1. 현재 데이터 로컬스토리지에 저장
    if (selectedBranch) {
      const storageKey = `payroll_backup_${selectedBranch.name}`
      localStorage.setItem(storageKey, JSON.stringify(employees))
    }
    // 2. 월 변경 + workData 초기화
    const newId = emp?.id
    setEmployees(prev => prev.map(e =>
      e.id === newId ? { ...e, month: newMonth, workData: {} } : e
    ))
    // 3. 새 월 데이터 Supabase에서 로드
    if (selectedBranch && emp?.name) {
      setTimeout(() => loadData(selectedBranch.name, emp.name, emp.year, newMonth, newId), 150)
    }
  }

  async function handleYearChange(newYear) {
    const emp = employees.find(e => e.id === activeEmpId) || employees[0]
    if (selectedBranch) {
      const storageKey = `payroll_backup_${selectedBranch.name}`
      localStorage.setItem(storageKey, JSON.stringify(employees))
    }
    const newId = emp?.id
    setEmployees(prev => prev.map(e =>
      e.id === newId ? { ...e, year: newYear, workData: {} } : e
    ))
    if (selectedBranch && emp?.name) {
      setTimeout(() => loadData(selectedBranch.name, emp.name, newYear, emp.month, newId), 150)
    }
  }

  function updateWorkDay(dateStr, field, value) {
    setEmployees(prev => prev.map(e => {
      if (e.id !== activeEmpId) return e
      return {
        ...e,
        workData: {
          ...e.workData,
          [dateStr]: {
            type: '평', basicH: 0, restH: 0, overtimeH: 0, nightH: 0,
            holidayH: 0, holidayRestH: 0, holidayOtH: 0, holidayNightH: 0,
            timeStart: e.defaultTimeStart, timeEnd: e.defaultTimeEnd,
            ...e.workData[dateStr], [field]: value
          }
        }
      }
    }))
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => autoSave(), 1500)
  }

  // ── 수정 #2: 시간 입력 포커스 아웃 시 자동 포맷 + 기본시간 자동계산 ──
  function handleTimeBlur(dateStr, field, rawVal) {
    const formatted = formatTimeInput(rawVal)
    updateWorkDay(dateStr, field, formatted)

    const currentData = activeEmp.workData[dateStr] || {}
    const start = field === 'timeStart' ? formatted : (currentData.timeStart || activeEmp.defaultTimeStart)
    const end   = field === 'timeEnd'   ? formatted : (currentData.timeEnd   || activeEmp.defaultTimeEnd)

    const isHol = (currentData.type || '평') === '휴'
    const rest = isHol ? (currentData.holidayRestH || 0) : (currentData.restH || 0)
    const split = netSplit(start, end, rest) // 휴게를 야간에서 먼저 차감
    if (split) {
      // 시작~종료 시간을 주간/야간으로 자동 분리 (휴일이면 휴일주간/휴일야간)
      if (isHol) {
        updateWorkDay(dateStr, 'holidayDaytimeH', split.day)
        updateWorkDay(dateStr, 'holidayNightH', split.night)
      } else {
        updateWorkDay(dateStr, 'daytimeH', split.day)
        updateWorkDay(dateStr, 'nightH', split.night)
      }
    }
    // 임시 입력 상태 초기화
    setTimeInputs(prev => {
      const next = { ...prev }
      if (next[dateStr]) {
        delete next[dateStr][field === 'timeStart' ? 'start' : 'end']
      }
      return next
    })
  }

  function handleTimeChange(dateStr, field, val) {
    setTimeInputs(prev => ({
      ...prev,
      [dateStr]: { ...prev[dateStr], [field === 'timeStart' ? 'start' : 'end']: val }
    }))
  }

  // ── 휴게시간 입력 시 야간에서 자동 차감 후 주간/야간 재계산 ──
  function handleRestChange(dateStr, val, isHol) {
    const restVal = Number(val) || 0
    const currentData = activeEmp.workData[dateStr] || {}
    const start = currentData.timeStart || activeEmp.defaultTimeStart
    const end   = currentData.timeEnd   || activeEmp.defaultTimeEnd
    if (isHol) {
      updateWorkDay(dateStr, 'holidayRestH', restVal)
      const split = netSplit(start, end, restVal)
      if (split) {
        updateWorkDay(dateStr, 'holidayDaytimeH', split.day)
        updateWorkDay(dateStr, 'holidayNightH', split.night)
      }
    } else {
      updateWorkDay(dateStr, 'restH', restVal)
      const split = netSplit(start, end, restVal)
      if (split) {
        updateWorkDay(dateStr, 'daytimeH', split.day)
        updateWorkDay(dateStr, 'nightH', split.night)
      }
    }
  }

  // ── 기본 근무시간 입력 포커스 아웃 시 자동 포맷 ──
  function handleDefaultTimeBlur(field, rawVal) {
    const formatted = formatTimeInput(rawVal)
    updateEmp(field, formatted)
  }

  function toggleDayType(dateStr) {
    const current = activeEmp.workData[dateStr]?.type || '평'
    // 평일 → 휴일근로(휴) → 휴무(공) → 연차(연) → 결근(결) → 평일
    let nextType = '평'
    if (current === '평') nextType = '휴'
    else if (current === '휴') nextType = '공'
    else if (current === '공') nextType = '연'
    else if (current === '연') nextType = '결'
    else nextType = '평'

    // ── 유형 전환 시 입력해 둔 시간을 그대로 유지 ──
    // 평일은 daytimeH/nightH/restH/overtimeH, 휴일은 holidayDaytimeH/holidayNightH/holidayRestH/holidayOtH
    // 로 칸 이름이 달라서, 그냥 type만 바꾸면 휴일로 전환했을 때 숫자가 0으로 보였음.
    // → 현재 유형에 들어있는 값을 읽어 양쪽 칸에 똑같이 써 둠. 시간(timeStart/timeEnd)은 공용이라 그대로.
    setEmployees(prev => prev.map(e => {
      if (e.id !== activeEmpId) return e
      const existing = e.workData[dateStr] || {}
      const fromHol = current === '휴'
      const h = {
        day:   fromHol ? (existing.holidayDaytimeH || 0) : (existing.daytimeH || 0),
        night: fromHol ? (existing.holidayNightH   || 0) : (existing.nightH   || 0),
        rest:  fromHol ? (existing.holidayRestH    || 0) : (existing.restH    || 0),
        ot:    fromHol ? (existing.holidayOtH      || 0) : (existing.overtimeH || 0),
      }
      return {
        ...e,
        workData: {
          ...e.workData,
          [dateStr]: {
            ...existing,
            type: nextType,
            daytimeH: h.day, nightH: h.night, restH: h.rest, overtimeH: h.ot,
            holidayDaytimeH: h.day, holidayNightH: h.night, holidayRestH: h.rest, holidayOtH: h.ot,
          }
        }
      }
    }))

    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => autoSave(), 1500)
  }

  function addEmployee(empType = '알바') {
    const newEmp = {
      ...EMPTY_EMP, id: Date.now(),
      empType,
      year: activeEmp.year, month: activeEmp.month,
      hourlyWage: activeEmp.hourlyWage,
      defaultTimeStart: activeEmp.defaultTimeStart,
      defaultTimeEnd: activeEmp.defaultTimeEnd,
    }
    setEmployees(prev => [...prev, newEmp])
    setActiveEmpId(newEmp.id)
  }

  function confirmDelete(id) { setDeleteConfirm(id) }

  function doDelete() {
    if (!deleteConfirm || employees.length === 1) { setDeleteConfirm(null); return }
    const remaining = employees.filter(e => e.id !== deleteConfirm)
    setEmployees(remaining)
    if (activeEmpId === deleteConfirm) setActiveEmpId(remaining[0].id)
    setDeleteConfirm(null)
  }

  function calcWeekPay(week, emp) {
    // ── 주간/야간/휴게/연장 시간을 주별로 합산 (기본·휴일근로 칸 폐지) ──
    let weekDayH = 0, weekNightH = 0, weekRestH = 0, weekOtH = 0, weekRegH = 0
    let weekHolidayH = 0 // 휴일근무(주간+야간) — 일반 야간과 분리
    week.forEach(day => {
      if (!day) return
      const ds = `${emp.year}-${String(emp.month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
      const d = emp.workData[ds] || {}
      if (d.type === '공' || d.type === '연') return // 휴무·연차 제외
      if (d.type === '휴') {
        // 휴일근로는 일반 주간/야간에 섞지 않고 휴일근무로만 집계 (중복 방지)
        weekHolidayH += (d.holidayDaytimeH || 0) + (d.holidayNightH || 0) + (d.holidayOtH || 0)
        weekRestH    += d.holidayRestH || 0
      } else {
        weekDayH   += d.daytimeH || 0
        weekNightH += d.nightH || 0
        weekRestH  += d.restH || 0
        weekOtH    += d.overtimeH || 0
        weekRegH   += (d.daytimeH || 0) + (d.nightH || 0) // 주휴 산정용 소정근로(주간+야간, 휴일 제외)
      }
    })
    const weekWorkH = weekDayH + weekNightH + weekOtH + weekHolidayH // 휴게 제외 (휴일 포함)
    const isStaffNoCalc = emp.empType === '직원' // 직원은 기본급(시급×209)에 주휴 포함 → 주휴 별도계산 안 함
    // 주휴수당: 소정근로(주간+야간) 시간 기준으로 계산
    return {
      weekDayH, weekNightH, weekRestH, weekOtH, weekWorkH, weekHolidayH,
      weeklyHolidayPay: isStaffNoCalc ? 0 : calcWeeklyHoliday(weekRegH, emp.hourlyWage)
    }
  }

  // ── 수정 #5: 수동 입력 고정값 + 캘린더 계산값 합산 ──
  function calcTotal(emp) {
    const weeks = getWeeksInMonth(emp.year, emp.month)
    let totalWeeklyHoliday = 0
    weeks.forEach(week => { totalWeeklyHoliday += calcWeekPay(week, emp).weeklyHolidayPay })

    // ── 시간 집계 (기본·휴일근로 칸 폐지, 휴게는 근무시간에서 제외) ──
    let hoursDay = 0, hoursNight = 0, hoursRest = 0, hoursOvertime = 0
    let mDayH = 0, mNightH = 0, mOtH = 0, mHolidayDayH = 0, mHolidayNightH = 0, mHolidayOtH = 0
    let workDays = 0, offDays = 0, annualDays = 0, holidayDays = 0, absentDays = 0
    const absentWeekSet = new Set()  // 결근이 포함된 주(주휴 1회씩만 차감)
    Object.entries(emp.workData).forEach(([ds, d]) => {
      if (d.type === '결') {                          // 결근
        absentDays++
        const dd = parseYMD(ds)
        if (dd) {
          const dayNum = dd.getDate()
          const wi = weeks.findIndex(w => w.includes(dayNum))
          if (wi >= 0) absentWeekSet.add(wi)
        }
        return
      }
      if (d.type === '공') { offDays++; return }     // 휴무
      if (d.type === '연') { annualDays++; return }   // 연차
      if (d.type === '휴') {
        // 휴일근로: 일반 주간/야간과 분리해서 휴일 항목으로만 집계 (중복 방지)
        const dh = (d.holidayDaytimeH || 0) + (d.holidayNightH || 0) + (d.holidayOtH || 0)
        if (dh > 0) { workDays++; holidayDays++ }
        hoursRest      += d.holidayRestH || 0
        mHolidayDayH   += d.holidayDaytimeH || 0
        mHolidayNightH += d.holidayNightH || 0
        mHolidayOtH    += d.holidayOtH || 0
      } else {
        const dh = (d.daytimeH || 0) + (d.nightH || 0) + (d.overtimeH || 0)
        if (dh > 0) workDays++
        hoursDay      += d.daytimeH || 0
        hoursNight    += d.nightH || 0
        hoursRest     += d.restH || 0
        hoursOvertime += d.overtimeH || 0
        mDayH   += d.daytimeH || 0
        mNightH += d.nightH || 0
        mOtH    += d.overtimeH || 0
      }
    })
    // 휴일근무 시간(주간+야간) — 휴일근로수당(×1.5) 산정 기준
    const hoursHolidayWork = mHolidayDayH + mHolidayNightH
    // 총 근로시간: 일반(주간+야간+연장) + 휴일(주간+야간+연장), 휴게 제외
    const hoursWork = hoursDay + hoursNight + hoursOvertime + hoursHolidayWork + mHolidayOtH

    const autoOvertime        = calcOvertime(mOtH, emp.hourlyWage)
    const autoNight           = calcNight(mNightH, emp.hourlyWage)
    // 휴일근로수당: 휴일 전체 근무시간(주간+야간) × 시급 × 1.5
    const autoHoliday         = calcHoliday(hoursHolidayWork, emp.hourlyWage)
    const autoHolidayOtPay    = calcHolidayOt(mHolidayOtH, emp.hourlyWage)
    // 휴일야간 가산: 휴일 야간시간 × 시급 × 0.5 (휴일근로 1.5에 추가)
    const autoHolidayNightPay = calcHolidayNight(mHolidayNightH, emp.hourlyWage)

    const isStaff = emp.empType === '직원'
    const isStaffNoCalc = isStaff // 직원은 기본급(시급×209)에 주휴 포함
    // ── 중도 입·퇴사 일할계산 (직원만): 재직일수 / 그 달 총일수 ──
    const proration = calcProration(emp)
    // ── 기본수당: 직원 = 시급 × 209 (중도 입·퇴사 시 일할계산) / 알바 = 실제 근무(주간+야간) × 시급 ──
    const hoursBaseAlba = mDayH + mNightH
    const staffMonthlyBasic = Math.round(emp.hourlyWage * 209)
    // ── 결근 공제 (직원만): 결근 1일당 시급×8(하루치) + 결근이 든 주마다 시급×8(주휴) ──
    //   연차 없는 직원이 무단결근하면 209기준 기본급에서 하루치 + 그 주 주휴를 차감.
    const absentHours = isStaff ? (absentDays * 8 + absentWeekSet.size * 8) : 0
    const absentDeduction = Math.round(absentHours * emp.hourlyWage)
    const totalBasic           = isStaff
      ? Math.max(0, Math.round(staffMonthlyBasic * proration.ratio) - absentDeduction)
      : Math.round(hoursBaseAlba * emp.hourlyWage) + (emp.manualBasic || 0)
    const totalOvertime        = (emp.manualOvertime || 0) + autoOvertime
    const totalNight           = (emp.manualNight || 0) + autoNight
    const totalHoliday         = (emp.manualHoliday || 0) + autoHoliday   // 휴일 전체근무(주간+야간) × 시급 × 1.5 자동계산
    const totalHolidayOtPay    = (emp.manualHolidayOt || 0) + autoHolidayOtPay
    const totalHolidayNightPay = (emp.manualHolidayNight || 0) + autoHolidayNightPay
    const totalWeeklyFinal     = isStaffNoCalc ? (emp.manualWeeklyHoliday || 0) : (emp.manualWeeklyHoliday || 0) + totalWeeklyHoliday
    const grandTotal = totalBasic + totalWeeklyFinal + totalOvertime + totalNight + totalHoliday + totalHolidayOtPay + totalHolidayNightPay

    const hoursWeekly = emp.hourlyWage > 0 ? Math.round((totalWeeklyFinal / emp.hourlyWage) * 10) / 10 : 0

    // ── 식대(비과세) · 지급액계 · 공제 · 실수령액 ──
    const meal = emp.mealAllowance || 0
    const grossPay = grandTotal + meal                      // 지급액계 (과세 + 비과세)
    const deductions = calcDeductions(grandTotal, emp)        // 공제는 과세급여(식대 제외) 기준
    const netPay = grossPay - deductions.total                // 실지급액

    return { totalBasic, totalWeeklyHoliday: totalWeeklyFinal, totalOvertime, totalNight, totalHoliday, totalHolidayOtPay, totalHolidayNightPay, grandTotal,
      meal, grossPay,
      hoursDay, hoursNight, hoursRest, hoursOvertime, hoursWork, hoursWeekly, hoursBaseAlba, isStaff,
      hoursOvertimePay: mOtH, hoursNightPay: mNightH, hoursHolidayDay: mHolidayDayH, hoursHolidayOt: mHolidayOtH, hoursHolidayNight: mHolidayNightH,
      hoursHolidayWork, proration, staffMonthlyBasic,
      absentDays, absentWeeks: absentWeekSet.size, absentDeduction,
      deductions, netPay, totalDeduction: deductions.total,
      workDays, offDays, annualDays, holidayDays }
  }

  // ── 자동저장: 로컬스토리지에만 저장 (Supabase 호출 없음) ──
  function autoSave() {
    if (!selectedBranch) return
    const emp = employees.find(e => e.id === activeEmpId)
    if (!emp || !emp.name) return
    const storageKey = `payroll_backup_${selectedBranch.name}`
    localStorage.setItem(storageKey, JSON.stringify(employees))
  }

  // ── Supabase 저장: 임시저장/최종마감 버튼 클릭 시에만 호출 ──
  async function doSaveEmp(emp, status = 'saved') {
    if (!emp || !emp.name || !selectedBranch) return
    const totals = calcTotal(emp)
    const payload = {
      branch: selectedBranch.name,
      emp_name: emp.name,
      emp_type: emp.empType || '알바',
      resident_id: emp.residentId || '',
      phone: emp.phone || '',
      email: emp.email || '',
      account_number: emp.accountNumber || '',
      hourly_wage: emp.hourlyWage,
      scheduled_hours: emp.scheduledHours || 8,
      default_time: `${emp.defaultTimeStart}~${emp.defaultTimeEnd}`,
      year: emp.year,
      month: emp.month,
      work_data: emp.workData,
      special_note: emp.specialNote || '',
      status,
      totalBasic: totals.totalBasic,
      totalWeeklyHoliday: totals.totalWeeklyHoliday,
      totalOvertime: totals.totalOvertime,
      totalNight: totals.totalNight,
      totalHoliday: totals.totalHoliday,
      totalHolidayOtPay: totals.totalHolidayOtPay,
      totalHolidayNightPay: totals.totalHolidayNightPay,
      grandTotal: totals.grandTotal,
      // ── 여러 기기 공유용 고정 설정 (DB 저장) ──
      hire_date:      emp.hireDate || '',
      resign_date:    emp.resignDate || '',
      birth_date:     emp.birthDate || '',
      deduction_type: emp.deductionType || 'none',
      income_tax:     emp.manualIncomeTax || 0,
      meal_allowance: emp.mealAllowance || 0,
    }
    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (res.ok) {
        setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, status, _dirty: false } : e))
      } else {
        const errData = await res.json()
        console.error('저장 API 오류:', errData)
      }
    } catch (e) {
      console.error('저장 실패:', e)
    }
  }

  async function doSave(emp, status = 'saved') {
    await doSaveEmp(emp, status)
  }


  // ── DB에서 해당 지점 이번달 전체 직원 데이터 불러오기 ──
  async function loadAllEmployees(branchName) {
    const now = new Date()
    const yr = now.getFullYear()
    const mo = now.getMonth() + 1

    const settingsMap = loadAllEmpSettings(branchName)
    // DB 값 우선, 비어있으면 브라우저 저장값(보조)으로 채움
    const pick = (dbVal, lsVal, dflt) => {
      if (dbVal !== undefined && dbVal !== null && dbVal !== '') return dbVal
      if (lsVal !== undefined && lsVal !== null && lsVal !== '') return lsVal
      return dflt
    }
    function parseEmployees(data, fallbackYr, fallbackMo) {
      return data.map(r => {
        const s = settingsMap[r.emp_name] || {}
        const emp = {
          ...EMPTY_EMP,
          id: Date.now() + Math.random(),
          name: r.emp_name || '',
          residentId: r.resident_id || '',
          phone: r.phone || '',
          email: r.email || '',
          accountNumber: r.account_number || '',
          empType: r.emp_type || '알바',
          hourlyWage: r.hourly_wage || 10320,
          scheduledHours: r.scheduled_hours || 8,
          defaultTimeStart: r.default_time ? r.default_time.split('~')[0] : '00:00',
          defaultTimeEnd: r.default_time ? r.default_time.split('~')[1] : '00:00',
          workData: migrateWorkData(r.work_data || {}),
          specialNote: r.special_note || '',
          status: r.status || 'saved',
          year: r.year || fallbackYr,
          month: r.month || fallbackMo,
          // ── 고정 설정: DB 우선 + 브라우저 저장값 보조 ──
          hireDate:        pick(r.hire_date, s.hireDate, ''),
          resignDate:      pick(r.resign_date, s.resignDate, ''),
          birthDate:       pick(r.birth_date, s.birthDate, ''),
          deductionType:   pick(r.deduction_type, s.deductionType, 'none'),
          manualIncomeTax: pick(r.income_tax, s.manualIncomeTax, 0),
          mealAllowance:   pick(r.meal_allowance, s.mealAllowance, 0),
        }
        // 퇴사일이 있으면 그 범위 밖 근무표도 정리
        emp.workData = pruneWorkDataToEmployment(emp.workData, emp.hireDate, emp.resignDate)
        return emp
      })
    }

    try {
      // 1) 현재 달 먼저 시도
      const res = await fetch(`/api/load-all?branch=${encodeURIComponent(branchName)}&year=${yr}&month=${mo}`)
      const result = await res.json()
      if (result.success && result.data && result.data.length > 0) {
        const loaded = parseEmployees(result.data, yr, mo)
        setEmployees(loaded)
        setActiveEmpId(loaded[0].id)
        return true
      }

      // 2) 현재 달 데이터 없으면 이전 달 시도
      const prevMo = mo === 1 ? 12 : mo - 1
      const prevYr = mo === 1 ? yr - 1 : yr
      const res2 = await fetch(`/api/load-all?branch=${encodeURIComponent(branchName)}&year=${prevYr}&month=${prevMo}`)
      const result2 = await res2.json()
      if (result2.success && result2.data && result2.data.length > 0) {
        const loaded = parseEmployees(result2.data, prevYr, prevMo)
        setEmployees(loaded)
        setActiveEmpId(loaded[0].id)
        return true
      }
    } catch (e) {
      console.error('직원 데이터 불러오기 실패:', e)
    }
    return false
  }

  async function handleManualSave(targetStatus) {
    if (!activeEmp.name) { alert('직원 이름을 입력해주세요.'); return }
    await doSave(activeEmp, targetStatus)
    alert(targetStatus === 'final' ? '✅ 최종 마감이 완료되었습니다!' : '💾 임시 저장되었습니다!')
  }

  function handleTabSwitch(id) {
    // 탭 전환 시 로컬스토리지만 저장 (Supabase 호출 없음)
    if (selectedBranch) {
      const storageKey = `payroll_backup_${selectedBranch.name}`
      localStorage.setItem(storageKey, JSON.stringify(employees))
    }
    setActiveEmpId(id)
  }

  function fmt(n) { return Math.round(n || 0).toLocaleString('ko-KR') }

  function numInput(val, onChange) {
    return (
      <input type="number" min="0" step="0.5"
        value={val || ''} placeholder="0"
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="hour-input"
      />
    )
  }

  // ── 수정 #8: 급여계산 페이지 엑셀 다운로드 ──
  // ── 근무기록 엑셀 업로드 → 현재 지점 직원들의 캘린더 자동 입력 ──
  async function handleExcelImport(file) {
    if (!selectedBranch) return
    setImporting(true)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { cellDates: true })

      const imported = []          // { name, year, month, workData, empType }
      const skippedBranches = new Set()
      let skippedSheets = 0

      wb.SheetNames.forEach(sheetName => {
        const ws = wb.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
        const hIdx = rows.findIndex(r => Array.isArray(r) && r.includes('날짜'))
        if (hIdx < 0) return
        const header = rows[hIdx]
        const ci = (label) => header.indexOf(label)
        const cDate = ci('날짜'), cWs = ci('워크스페이스명'), cName = ci('이름')
        const cIn = ci('출근'), cOut = ci('퇴근'), cRest = ci('휴게시간'), cWage = ci('시급/월급')

        const dataRows = rows.slice(hIdx + 1).filter(r => parseExcelDate(r[cDate]))
        if (dataRows.length === 0) return

        const wsBranch = dataRows[0][cWs]
        if (!branchMatches(selectedBranch.name, wsBranch)) {
          skippedBranches.add(String(wsBranch || '알수없음').replace('더콤마라운지', '').trim())
          skippedSheets++
          return
        }

        const empName = String(dataRows[0][cName] || sheetName.split('_')[0] || '').trim()
        const empType = String(dataRows[0][cWage] || '').includes('월급') ? '직원' : '알바'
        const workData = {}
        const monthCount = {}
        dataRows.forEach(r => {
          const d = parseExcelDate(r[cDate]); if (!d) return
          const start = parseExcelTime(r[cIn]); const end = parseExcelTime(r[cOut])
          if (!start || !end) return
          const rest = parseExcelHours(r[cRest])
          const ds = `${d.year}-${pad2(d.month)}-${pad2(d.day)}`
          const split = netSplit(start, end, rest)
          workData[ds] = {
            type: '평', timeStart: start, timeEnd: end,
            daytimeH: split ? split.day : 0, nightH: split ? split.night : 0,
            restH: rest, overtimeH: 0,
            holidayDaytimeH: 0, holidayNightH: 0, holidayRestH: 0, holidayOtH: 0,
          }
          const mk = `${d.year}-${d.month}`
          monthCount[mk] = (monthCount[mk] || 0) + 1
        })
        if (Object.keys(workData).length === 0) return

        const dom = Object.entries(monthCount).sort((a, b) => b[1] - a[1])[0]
        const [yy, mm] = dom ? dom[0].split('-').map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1]
        imported.push({ name: empName, year: yy, month: mm, workData, empType })
      })

      if (imported.length === 0) {
        const msg = skippedBranches.size > 0
          ? `현재 지점(${selectedBranch.name})에 해당하는 직원이 없습니다.\n파일에 있는 지점: ${[...skippedBranches].join(', ')}`
          : '불러올 근무기록을 찾지 못했습니다. 파일 형식을 확인해주세요.'
        alert(msg)
        return
      }

      // 기존 직원과 이름으로 매칭: 있으면 근무데이터 갱신, 없으면 새로 추가
      let firstId = null
      setEmployees(prev => {
        let next = [...prev]
        imported.forEach((imp, idx) => {
          const existIdx = next.findIndex(e => e.name && e.name.trim() === imp.name)
          if (existIdx >= 0) {
            next[existIdx] = { ...next[existIdx], workData: imp.workData, year: imp.year, month: imp.month, _dirty: true }
            if (idx === 0) firstId = next[existIdx].id
          } else {
            const id = Date.now() + idx
            next.push({ ...EMPTY_EMP, id, name: imp.name, empType: imp.empType, workData: imp.workData, year: imp.year, month: imp.month, _dirty: true })
            if (idx === 0) firstId = id
          }
        })
        // 빈 기본 직원(이름 미입력) 제거
        next = next.filter(e => e.name && e.name.trim())
        return next
      })
      if (firstId) setActiveEmpId(firstId)

      let msg = `✅ ${imported.length}명의 근무기록을 불러왔습니다.\n${imported.map(e => `· ${e.name} (${e.month}월, ${Object.keys(e.workData).length}일)`).join('\n')}`
      if (skippedBranches.size > 0) {
        msg += `\n\n다른 지점 ${skippedSheets}명은 건너뛰었습니다: ${[...skippedBranches].join(', ')}`
      }
      msg += `\n\n※ 이 엑셀은 휴게시간이 0이라 출퇴근 시계상 시간 그대로 들어왔어요.\n휴게가 필요한 날은 '휴게' 칸에 숫자만 넣으면 자동으로 차감됩니다.`
      alert(msg)
    } catch (err) {
      console.error('엑셀 불러오기 실패:', err)
      alert('엑셀을 읽는 중 오류가 발생했습니다.\n' + (err?.message || ''))
    } finally {
      setImporting(false)
    }
  }

  function downloadExcelSingle() {
    if (!activeEmp) return
    const totals = calcTotal(activeEmp)
    const headers = ['날짜', '유형', '시작', '종료', '주간', '야간', '휴게', '연장', '휴일주간', '휴일야간', '휴일휴게', '휴일연장']
    const rows = []
    const weeks = getWeeksInMonth(activeEmp.year, activeEmp.month)
    weeks.forEach(week => {
      week.forEach(day => {
        if (!day) return
        const ds = `${activeEmp.year}-${String(activeEmp.month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
        const d = activeEmp.workData[ds]
        if (!d) return
        rows.push([
          ds, d.type || '평',
          d.timeStart || '', d.timeEnd || '',
          d.daytimeH || 0, d.nightH || 0, d.restH || 0, d.overtimeH || 0,
          d.holidayDaytimeH || 0, d.holidayNightH || 0, d.holidayRestH || 0, d.holidayOtH || 0,
        ])
      })
    })
    const summaryHeaders = ['', '기본급', '주휴수당', '연장수당', '야간수당', '휴일수당', '휴일연장', '휴일야간', '식대', '지급액계']
    const summaryRow = [
      '급여합계',
      Math.round(totals.totalBasic), Math.round(totals.totalWeeklyHoliday),
      Math.round(totals.totalOvertime), Math.round(totals.totalNight),
      Math.round(totals.totalHoliday), Math.round(totals.totalHolidayOtPay),
      Math.round(totals.totalHolidayNightPay), Math.round(totals.meal), Math.round(totals.grossPay),
    ]
    const deductHeaders = ['공제', '국민연금', '건강보험', '장기요양', '고용보험', '소득세', '사업소득세', '지방소득세', '공제합계']
    const deductRow = [
      totals.deductions.dt === '4대' ? '4대보험' : totals.deductions.dt === '3.3' ? '3.3%' : '없음',
      totals.deductions.pension, totals.deductions.health, totals.deductions.care,
      totals.deductions.employment, totals.deductions.incomeTax, totals.deductions.bizTax,
      totals.deductions.localTax, totals.totalDeduction,
    ]
    const infoRow = [`직원명: ${activeEmp.name}`, `지점: ${selectedBranch?.name}`, `${activeEmp.year}년 ${activeEmp.month}월`, `구분: ${activeEmp.empType || '알바'}`]
    const BOM = '\uFEFF'
    const csv = BOM + [
      infoRow.map(v => `"${v}"`).join(','),
      '',
      headers.map(v => `"${v}"`).join(','),
      ...rows.map(row => row.map(v => `"${String(v)}"`).join(',')),
      '',
      summaryHeaders.map(v => `"${v}"`).join(','),
      summaryRow.map(v => `"${String(v)}"`).join(','),
      '',
      deductHeaders.map(v => `"${v}"`).join(','),
      deductRow.map(v => `"${String(v)}"`).join(','),
      '',
      `"실지급액","${totals.netPay}"`,
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `급여명세_${activeEmp.year}년${activeEmp.month}월_${activeEmp.name}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── 지점 전체 엑셀: 한 파일 안에 직원별 시트로 분리 ──
  async function downloadExcelBranch() {
    const named = employees.filter(e => e.name && e.name.trim())
    if (named.length === 0) { alert('저장할 직원이 없습니다.'); return }
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    const usedNames = {}
    // 시트명 정리: 엑셀 금지문자 제거 + 31자 제한 + 중복 방지
    const safeSheetName = (raw) => {
      let n = String(raw).replace(/[\\\/\?\*\[\]:]/g, ' ').trim().slice(0, 28) || '직원'
      if (usedNames[n] === undefined) { usedNames[n] = 1; return n }
      usedNames[n] += 1
      return `${n}(${usedNames[n]})`
    }
    named.forEach(emp => {
      const totals = calcTotal(emp)
      const headers = ['날짜', '유형', '시작', '종료', '주간', '야간', '휴게', '연장', '휴일주간', '휴일야간', '휴일휴게', '휴일연장']
      const dayRows = []
      const weeks = getWeeksInMonth(emp.year, emp.month)
      weeks.forEach(week => {
        week.forEach(day => {
          if (!day) return
          const ds = `${emp.year}-${String(emp.month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
          const d = emp.workData[ds]
          if (!d) return
          dayRows.push([
            ds, d.type || '평',
            d.timeStart || '', d.timeEnd || '',
            d.daytimeH || 0, d.nightH || 0, d.restH || 0, d.overtimeH || 0,
            d.holidayDaytimeH || 0, d.holidayNightH || 0, d.holidayRestH || 0, d.holidayOtH || 0,
          ])
        })
      })
      const aoa = [
        [`직원명: ${emp.name}`, `지점: ${selectedBranch?.name || ''}`, `${emp.year}년 ${emp.month}월`, `구분: ${emp.empType || '알바'}`],
        [],
        headers,
        ...dayRows,
        [],
        ['', '기본급', '주휴수당', '연장수당', '야간수당', '휴일수당', '휴일연장', '휴일야간', '식대', '지급액계'],
        [
          '급여합계',
          Math.round(totals.totalBasic), Math.round(totals.totalWeeklyHoliday),
          Math.round(totals.totalOvertime), Math.round(totals.totalNight),
          Math.round(totals.totalHoliday), Math.round(totals.totalHolidayOtPay),
          Math.round(totals.totalHolidayNightPay), Math.round(totals.meal), Math.round(totals.grossPay),
        ],
        [],
        ['공제', '국민연금', '건강보험', '장기요양', '고용보험', '소득세', '사업소득세', '지방소득세', '공제합계'],
        [
          totals.deductions.dt === '4대' ? '4대보험' : totals.deductions.dt === '3.3' ? '3.3%' : '없음',
          totals.deductions.pension, totals.deductions.health, totals.deductions.care,
          totals.deductions.employment, totals.deductions.incomeTax, totals.deductions.bizTax,
          totals.deductions.localTax, totals.totalDeduction,
        ],
        [],
        ['실지급액', totals.netPay],
      ]
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      ws['!cols'] = headers.map(() => ({ wch: 11 }))
      XLSX.utils.book_append_sheet(wb, ws, safeSheetName(emp.name))
    })
    const ym = `${activeEmp?.year || named[0].year}년${activeEmp?.month || named[0].month}월`
    XLSX.writeFile(wb, `급여명세_${selectedBranch?.name || '지점'}_${ym}.xlsx`)
  }

  // ── 급여명세서 인쇄/PDF (근로기준법 제48조 · 더콤마 표준 양식) ──
  function printPayslip() {
    if (!activeEmp?.name) { alert('직원 이름을 먼저 입력해주세요.'); return }
    const t = calcTotal(activeEmp)
    const w = (n) => Number(n || 0).toLocaleString()
    const wage = activeEmp.hourlyWage || 0

    // 생년월일: 입력값 우선, 없으면 주민번호 앞자리에서 추정
    const birth = (() => {
      if (activeEmp.birthDate) return activeEmp.birthDate
      const g = String(activeEmp.residentId || '').replace(/[^0-9]/g, '')
      if (g.length < 7) return ''
      const yy = g.slice(0,2), mm = g.slice(2,4), dd = g.slice(4,6)
      const c = ['1','2','5','6'].includes(g[6]) ? '19' : ['3','4','7','8'].includes(g[6]) ? '20' : '19'
      return `${c}${yy}.${mm}.${dd}`
    })()

    // 지급 항목: [라벨, 금액, 산출식]
    const payItems = [
      ['기본급', t.totalBasic, t.isStaff ? '통상시급 × 월 209시간 (주휴 포함)' : `통상시급 × ${t.hoursBaseAlba}시간 (주간+야간)`],
      ['주휴수당', t.totalWeeklyHoliday, '주간근로시간 ÷ 40 × 8 × 통상시급'],
      ['식대', t.meal, '비과세 식대'],
      ['연장근로수당', t.totalOvertime, `통상시급 × 연장근로시간(${t.hoursOvertimePay}h) × 1.5배`],
      ['야간근로수당', t.totalNight, `통상시급 × 야간근로시간(${t.hoursNightPay}h) × 0.5배 가산`],
      ['휴일근로수당', t.totalHoliday, `통상시급 × 휴일근무시간(주간+야간 ${t.hoursHolidayWork}h) × 1.5배`],
      ['휴일연장수당', t.totalHolidayOtPay, `통상시급 × 휴일연장시간(${t.hoursHolidayOt}h) × 2.0배`],
      ['휴일야간수당', t.totalHolidayNightPay, `통상시급 × 휴일야간시간(${t.hoursHolidayNight}h) × 0.5배 가산`],
    ].filter(([l, v]) => v > 0 || l === '기본급')

    // 공제 항목: [라벨, 금액]
    const d = t.deductions
    const dedItems = d.dt === 'none' ? [] : [
      ['국민연금', d.pension], ['건강보험', d.health], ['고용보험', d.employment],
      ['장기요양보험료', d.care], ['소득세', d.incomeTax], ['사업소득세', d.bizTax], ['지방소득세', d.localTax],
    ].filter(([l, v]) => v > 0)

    // 세부내역 본문 (좌: 지급 / 우: 공제) 행별 정렬
    const maxRows = Math.max(payItems.length, dedItems.length)
    let bodyRows = ''
    for (let i = 0; i < maxRows; i++) {
      const p = payItems[i], de = dedItems[i]
      bodyRows += `<tr>
        <td class="c-gubun">${p ? '매월' : ''}</td>
        <td class="c-item">${p ? p[0] : ''}</td>
        <td class="c-amt">${p ? w(p[1]) : ''}</td>
        <td class="c-item">${de ? de[0] : ''}</td>
        <td class="c-amt">${de ? w(de[1]) : ''}</td>
      </tr>`
    }

    // 계산방법 표
    const methodRows = payItems.map(([l, v, f]) => `<tr><td class="c-item">${l}</td><td class="c-formula">${f}</td><td class="c-amt">${w(v)}</td></tr>`).join('')

    const today = new Date()
    const pay = `${today.getFullYear()}.${String(today.getMonth()+1).padStart(2,'0')}.${String(today.getDate()).padStart(2,'0')}`

    const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>급여명세서_${activeEmp.name}_${activeEmp.year}년${activeEmp.month}월</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  body { font-family:'Malgun Gothic','맑은 고딕',sans-serif; color:#000; padding:30px 36px; background:#fff; font-size:12px; }
  .sheet { max-width:760px; margin:0 auto; }
  h1 { text-align:center; font-size:22px; font-weight:700; margin-bottom:18px; letter-spacing:0.06em; }
  .hdr { display:flex; justify-content:space-between; font-size:12px; margin-bottom:10px; padding:0 2px; }
  table { width:100%; border-collapse:collapse; table-layout:fixed; }
  table.bordered td, table.bordered th { border:1px solid #555; padding:6px 8px; font-weight:400; vertical-align:middle; }
  .unit { text-align:right; font-size:11px; color:#333; margin:3px 2px 14px; }
  .lbl-cell { background:#eee; font-weight:700; text-align:center; }
  .ctr { text-align:center; }
  .c-amt { text-align:right; }
  .c-formula { text-align:left; }
  .sect-title { background:#ddd; font-weight:700; text-align:center; }
  .total-lbl { background:#eee; font-weight:700; text-align:center; }
  .foot { text-align:center; margin-top:30px; font-size:13px; }
  @media print { body { padding:0; } @page { size:A4; margin:14mm; } }
</style></head><body><div class="sheet">
  <h1>${activeEmp.year}년 ${activeEmp.month}월분 급여명세서</h1>
  <div class="hdr"><span>회사명: ${selectedBranch?.name || '더콤마라운지'}</span><span>지급일: ${pay}</span></div>

  <table class="bordered">
    <colgroup><col style="width:14%"><col style="width:36%"><col style="width:18%"><col style="width:14%"><col style="width:18%"></colgroup>
    <tr><td class="lbl-cell">성명</td><td>${activeEmp.name}</td><td class="lbl-cell">생년월일</td><td colspan="2">${birth}</td></tr>
    <tr><td class="lbl-cell">부서</td><td></td><td class="lbl-cell">직급</td><td colspan="2"></td></tr>
  </table>
  <div style="height:8px"></div>
  <table class="bordered">
    <colgroup><col><col><col><col><col><col></colgroup>
    <tr>
      <td class="lbl-cell">근로일수</td><td class="lbl-cell">총 근무시간</td><td class="lbl-cell">연장근로시간</td>
      <td class="lbl-cell">야간근로시간</td><td class="lbl-cell">휴일근로시간</td><td class="lbl-cell">통상시급(원)</td>
    </tr>
    <tr>
      <td class="ctr">${t.workDays}</td><td class="ctr">${t.hoursWork}</td><td class="ctr">${t.hoursOvertimePay}</td>
      <td class="ctr">${t.hoursNightPay}</td><td class="ctr">${t.hoursHolidayDay + t.hoursHolidayOt + t.hoursHolidayNight}</td><td class="ctr">${w(wage)}</td>
    </tr>
  </table>
  <div class="unit">(단위, 원)</div>

  <table class="bordered">
    <colgroup><col style="width:11%"><col style="width:25%"><col style="width:19%"><col style="width:24%"><col style="width:21%"></colgroup>
    <tr><td class="sect-title" colspan="5">세부내역</td></tr>
    <tr><td class="lbl-cell">구분</td><td class="lbl-cell">지급 항목</td><td class="lbl-cell">지급 금액</td><td class="lbl-cell">공제 항목</td><td class="lbl-cell">공제 금액</td></tr>
    ${bodyRows}
    <tr><td></td><td></td><td></td><td class="total-lbl">공 제 액 계</td><td class="c-amt">${w(t.totalDeduction)}</td></tr>
    <tr><td class="total-lbl" colspan="2">지 급 액 계</td><td class="c-amt">${w(t.grossPay)}</td><td class="total-lbl">실지급액</td><td class="c-amt"><b>${w(t.netPay)}</b></td></tr>
  </table>
  <div class="unit">(단위, 원)</div>

  <table class="bordered">
    <colgroup><col style="width:22%"><col style="width:58%"><col style="width:20%"></colgroup>
    <tr><td class="sect-title" colspan="3">계산방법</td></tr>
    <tr><td class="lbl-cell">구분</td><td class="lbl-cell">산출식 또는 산출방법</td><td class="lbl-cell">지급액</td></tr>
    ${methodRows}
  </table>

  <div class="foot">귀하의 노고에 감사드립니다.</div>
</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`
    const win = window.open('', '_blank')
    if (!win) { alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.'); return }
    win.document.write(html)
    win.document.close()
  }

  const totals = activeEmp ? calcTotal(activeEmp) : null
  const weeks = activeEmp ? getWeeksInMonth(activeEmp.year, activeEmp.month) : []
  const DAY_LABELS = ['월','화','수','목','금','토','일']

  const css = `
    @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css');
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600&family=DM+Sans:wght@300;400;500;600&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #f8f7f4; color: #1a1a1a; font-family: 'Pretendard', 'DM Sans', sans-serif; min-height: 100vh; }
    .wrap { min-height: 100vh; display: flex; flex-direction: column; }

    .header {
      background: #fff; border-bottom: 1px solid #ebe9e4;
      padding: 18px 40px; display: flex; justify-content: space-between; align-items: center;
    }
    .logo-the { font-size: 9px; letter-spacing: 0.3em; color: #b8954a; font-weight: 500; }
    .logo-main { font-family: 'Playfair Display', serif; font-size: 24px; color: #1a1a1a; }
    .logo-main span { font-style: italic; color: #b8954a; }
    .logo-sub { font-size: 9px; letter-spacing: 0.25em; color: #999; margin-top: 1px; }
    .header-tag { font-size: 10px; letter-spacing: 0.2em; color: #999; }

    .main { flex: 1; padding: 48px 40px; max-width: 1200px; width: 100%; margin: 0 auto; }
    @media (max-width: 640px) { .header { padding: 16px 20px; } .main { padding: 28px 16px; } }

    .page-title { font-family: 'Pretendard', sans-serif; font-weight: 700; font-size: 30px; margin-bottom: 10px; }
    .page-sub { font-size: 15px; color: #999; letter-spacing: 0.04em; margin-bottom: 48px; }
    .branch-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; max-width: 900px; margin: 0 auto; }
    @media (max-width: 640px) { .branch-grid { grid-template-columns: repeat(2, 1fr); } }
    .branch-card {
      background: #fff; border: 1px solid #ebe9e4; border-radius: 16px;
      padding: 40px 32px; cursor: pointer; transition: all 0.2s; position: relative; overflow: hidden;
    }
    .branch-card::after {
      content: ''; position: absolute; bottom: 0; left: 0; right: 0;
      height: 3px; background: #b8954a; transform: scaleX(0); transition: transform 0.25s;
    }
    .branch-card:hover { border-color: #d4b87a; box-shadow: 0 8px 32px rgba(184,149,74,0.12); transform: translateY(-2px); }
    .branch-card:hover::after { transform: scaleX(1); }
    .branch-num { font-size: 12px; color: #ccc; letter-spacing: 0.2em; margin-bottom: 16px; font-weight: 500; }
    .branch-name { font-size: 21px; font-weight: 600; color: #1a1a1a; }

    .login-wrap { display: flex; justify-content: center; align-items: center; min-height: 60vh; }
    .login-box {
      background: #fff; border: 1px solid #ebe9e4; border-radius: 16px;
      padding: 40px; width: 340px; text-align: center; box-shadow: 0 8px 40px rgba(0,0,0,0.06);
    }
    .login-branch { font-size: 11px; letter-spacing: 0.2em; color: #b8954a; margin-bottom: 6px; }
    .login-title { font-family: 'Pretendard', sans-serif; font-weight: 700; font-size: 21px; margin-bottom: 28px; }
    .field-label { font-size: 11px; letter-spacing: 0.12em; color: #999; margin-bottom: 6px; font-weight: 500; }
    .text-input {
      width: 100%; background: #fff; border: 1.5px solid #d0ccc5;
      border-radius: 8px; padding: 11px 14px; font-size: 14px; color: #1a1a1a;
      font-family: 'Pretendard', 'DM Sans', sans-serif; outline: none; transition: border-color 0.2s; margin-bottom: 12px;
    }
    .text-input:focus { border-color: #b8954a; }
    .text-input::placeholder { color: #bbb; }

    .btn {
      background: #1a1a1a; color: #fff; border: none; border-radius: 8px;
      padding: 12px 26px; font-size: 14px; font-weight: 600; cursor: pointer;
      letter-spacing: 0.08em; font-family: 'Pretendard', 'DM Sans', sans-serif; transition: all 0.2s; white-space: nowrap;
    }
    .btn:hover { background: #333; }
    .btn.outline { background: #fff; color: #1a1a1a; border: 1px solid #d0ccc5; }
    .btn.outline:hover { border-color: #1a1a1a; }
    .btn.accent { background: #b8954a; }
    .btn.accent:hover { background: #a07c38; }
    .btn.danger { background: #e05555; }
    .btn.danger:hover { background: #c03030; }
    .btn.full { width: 100%; padding: 13px; }
    .error-msg { font-size: 12px; color: #e05555; margin-bottom: 12px; }

    .section-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; gap: 12px; flex-wrap: wrap; }
    .section-title { font-family: 'Pretendard', sans-serif; font-weight: 700; font-size: 24px; }
    .section-sub { font-size: 13px; color: #999; margin-top: 5px; }

    /* ── 수정 #6: 직원/알바 탭 스타일 ── */
    .emp-type-tabs { display: flex; gap: 0; margin-bottom: 10px; border-radius: 8px; overflow: hidden; border: 1.5px solid #d0ccc5; width: fit-content; }
    .emp-type-tab {
      padding: 8px 22px; font-size: 14px; font-weight: 600; cursor: pointer;
      background: #fff; color: #999; transition: all 0.15s; letter-spacing: 0.06em;
      border: none; font-family: 'Pretendard', 'DM Sans', sans-serif;
    }
    .emp-type-tab.active { background: #1a1a1a; color: #fff; }
    .emp-type-tab:first-child { border-right: 1.5px solid #d0ccc5; }

    .emp-tabs { display: flex; align-items: center; border-bottom: 2px solid #ebe9e4; margin-bottom: 28px; overflow-x: auto; }
    .emp-tab {
      padding: 12px 14px; font-size: 15px; font-weight: 500; cursor: pointer;
      border-bottom: 2px solid transparent; margin-bottom: -2px; white-space: nowrap;
      color: #999; transition: all 0.15s; display: flex; align-items: center; gap: 6px;
      box-sizing: border-box; width: 150px;
    }
    .emp-tab-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
    .emp-tab:hover { color: #1a1a1a; }
    .emp-tab.active { color: #1a1a1a; border-bottom-color: #b8954a; font-weight: 600; }
    .emp-tab.staff-tab { background: #f1efe9; border-radius: 8px 8px 0 0; }
    .emp-tab.staff-tab.active { background: #faf8f3; border-bottom-color: #b8954a; }
    .emp-tab.alba-tab { background: #f6f1e7; border-radius: 8px 8px 0 0; }
    .emp-tab.alba-tab.active { background: #faf8f3; border-bottom-color: #b8954a; }
    .emp-tab-badge { font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 10px; margin-left: 2px; }
    .emp-tab-badge.staff { background: #e3dfd5; color: #6b6253; }
    .emp-tab-badge.alba { background: #ece0c9; color: #9c7f44; }
    .hour-label.daytime { color: #8a8378; }
    .emp-tab-del {
      width: 18px; height: 18px; border-radius: 50%; background: #e8e5e0;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; color: #999; cursor: pointer; flex-shrink: 0; transition: all 0.15s;
    }
    .emp-tab-del:hover { background: #e05555; color: #fff; }
    .emp-tab-add { padding: 8px 16px; font-size: 20px; cursor: pointer; color: #b8954a; font-weight: 300; }
    .emp-tab-add:hover { color: #a07c38; }

    .modal-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex;
      align-items: center; justify-content: center; z-index: 1000; backdrop-filter: blur(2px);
    }
    .modal-box {
      background: #fff; border-radius: 16px; padding: 36px 40px; width: 360px;
      text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.15);
    }
    .modal-icon { font-size: 36px; margin-bottom: 16px; }
    .modal-title { font-family: 'Pretendard', sans-serif; font-weight: 700; font-size: 19px; margin-bottom: 10px; color: #1a1a1a; }
    .modal-desc { font-size: 13px; color: #888; line-height: 1.6; margin-bottom: 28px; }
    .modal-emp-name { font-weight: 700; color: #e05555; }
    .modal-btns { display: flex; gap: 10px; }
    .modal-btns .btn { flex: 1; }

    .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 12px; }
    .info-grid-2 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
    @media (max-width: 900px) { .info-grid, .info-grid-2 { grid-template-columns: repeat(2, 1fr); } }
    .info-card { background: #fff; border: 1px solid #d0ccc5; border-radius: 10px; padding: 16px 18px; }
    .info-card-label { font-size: 12px; letter-spacing: 0.1em; color: #888; margin-bottom: 10px; font-weight: 500; }
    .info-card input, .info-card select {
      width: 100%; background: transparent; border: none;
      border-bottom: 1.5px solid #d0ccc5; padding: 5px 0;
      font-size: 16px; font-weight: 600; color: #1a1a1a;
      font-family: 'Pretendard', 'DM Sans', sans-serif; outline: none;
    }
    .info-card input:focus, .info-card select:focus { border-bottom-color: #b8954a; }
    .time-range { display: flex; align-items: center; gap: 6px; }
    .time-sep { font-size: 14px; color: #bbb; flex-shrink: 0; }

    .note-row { margin-bottom: 24px; }
    .note-input {
      width: 100%; background: #fff; border: 1.5px solid #d0ccc5;
      border-radius: 8px; padding: 13px 16px; font-size: 15px; color: #1a1a1a;
      font-family: 'Pretendard', 'DM Sans', sans-serif; outline: none; transition: border-color 0.2s;
    }
    .note-input:focus { border-color: #b8954a; }
    .note-input::placeholder { color: #bbb; }

    /* ── 지점별 인건비 총금액 카드 ── */
    .branch-cost-card {
      background: linear-gradient(135deg, #1f1d1a 0%, #2e2a24 100%);
      border-radius: 14px; padding: 20px 24px; margin-bottom: 24px;
      box-shadow: 0 8px 24px rgba(26,24,20,0.12);
    }
    .branch-cost-head { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 4px; margin-bottom: 16px; }
    .branch-cost-title { font-size: 14px; font-weight: 700; color: #e7c98a; letter-spacing: 0.04em; }
    .branch-cost-sub { font-size: 12px; color: #a39c90; letter-spacing: 0.02em; }
    .branch-cost-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    @media (max-width: 600px) { .branch-cost-grid { grid-template-columns: 1fr; } }
    .branch-cost-item {
      background: rgba(255,255,255,0.05); border: 1px solid rgba(231,201,138,0.18);
      border-radius: 10px; padding: 14px 18px;
    }
    .bc-label { font-size: 11px; color: #b3aa9b; letter-spacing: 0.06em; margin-bottom: 6px; }
    .bc-val { font-family: 'Pretendard', sans-serif; font-size: 26px; font-weight: 700; color: #fff; line-height: 1; }
    .bc-val.net { color: #e7c98a; }
    .bc-val .won { font-size: 14px; font-weight: 500; margin-left: 2px; color: #c9c0b0; }

    /* ── 월 합계 요약 박스 ── */
    .month-stat-box { background: #fff; border: 1px solid #e6e3dd; border-radius: 12px; padding: 18px 20px; margin-bottom: 18px; }
    .month-stat-title { font-size: 13px; letter-spacing: 0.08em; color: #b8954a; font-weight: 700; margin-bottom: 14px; }
    .month-stat-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 10px; }
    @media (max-width: 720px) { .month-stat-grid { grid-template-columns: repeat(4, 1fr); gap: 14px 6px; } }
    .month-stat { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 0; border-right: 1px solid #f0ede8; }
    .month-stat:last-child { border-right: none; }
    @media (max-width: 720px) { .month-stat { border-right: none; } }
    .ms-val { font-size: 22px; font-weight: 700; color: #1a1a1a; line-height: 1; }
    .ms-val small { font-size: 11px; font-weight: 500; color: #999; margin-left: 1px; }
    .ms-label { font-size: 12px; color: #999; letter-spacing: 0.02em; }

    .cal-wrap { background: #fff; border: 1px solid #d0ccc5; border-radius: 12px; overflow: hidden; margin-bottom: 24px; }
    /* 주마다 표시되는 요일 헤더 */
    .week-dow-row { display: grid; grid-template-columns: 60px repeat(7, 1fr); background: #f6f4f0; border-bottom: 1px solid #ebe9e4; }
    .week-dow-corner {
      display: flex; align-items: center; padding-left: 12px;
      font-size: 13px; font-weight: 700; color: #b8954a; letter-spacing: 0.02em;
    }
    .week-dow {
      padding: 8px 4px; font-size: 13px; font-weight: 600; color: #888;
      text-align: center; letter-spacing: 0.05em; user-select: none;
    }

    .week-block { border-bottom: 2px solid #e8e4dd; }
    .week-block:last-child { border-bottom: none; }
    .week-row { display: grid; grid-template-columns: 60px repeat(7, 1fr); }
    .week-label { padding: 10px 0 10px 12px; font-size: 12px; color: #aaa; font-weight: 600; display: flex; align-items: flex-start; padding-top: 16px; }

    /* ── 수정 #3: 칸이 4개로 늘어 min-height 증가 ── */
    .day-cell { padding: 10px 7px; border-left: 1.5px solid #e6e3dd; min-height: 200px; position: relative; transition: background 0.2s; }
    .day-cell:first-child { border-left: none; }
    .day-cell.empty { background: #fafaf9; }
    .day-cell.is-holiday { background: linear-gradient(160deg, #fff5f5 0%, #fff0e8 100%); }
    .day-cell.is-off {
      background: linear-gradient(160deg, #f0f0f0 0%, #e6e6e6 100%);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
    }
    .off-text { font-size: 18px; font-weight: 800; color: #999; letter-spacing: 0.1em; margin-top: 10px; }

    /* 날짜 숫자와 아래 입력값 구분용 가로선 */
    .day-sep { height: 1px; background: #e8e4dd; margin: 0 -7px 9px; }
    .day-cell.is-holiday .day-sep { background: #f4d6cf; }
    .day-cell.is-off .day-sep { display: none; }

    /* 날짜+공휴일명 영역: 모든 칸이 같은 높이를 갖도록 고정 → 공휴일이 있어도 줄이 안 밀림 */
    .day-head {
      min-height: 46px; display: flex; flex-direction: column;
      align-items: center; justify-content: flex-start; margin-bottom: 8px;
    }
    .day-date {
      font-size: 15px; font-weight: 700; color: #555; cursor: pointer;
      width: 30px; height: 30px; border-radius: 50%; background: #f1efe9; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.15s;
    }
    .day-date:hover { background: #e6e2da; color: #1a1a1a; }
    .day-date.holiday-type { background: #ffe0e0; color: #e05555; }
    .day-date.holiday-type:hover { background: #ffc0c0; }
    .day-date.off-type { background: #dcdcdc; color: #777; }
    .day-date.annual-type { background: #dbeafe; color: #3b82c4; }
    .day-date.annual-type:hover { background: #c3ddfb; }
    .day-date.absent-type { background: #ffd9d9; color: #d32f2f; font-weight: 700; }
    .day-date.absent-type:hover { background: #ffbdbd; }
    .day-cell.out-of-emp { opacity: 0.5; background: #f3f1ee; }
    .day-cell.out-of-emp .day-date { cursor: default; }
    /* 법정공휴일 (참고용 표시) */
    .day-date.gov-holiday { color: #e05555; box-shadow: 0 0 0 1.5px #f4c4c4 inset; }
    .gov-holiday-name { font-size: 10px; color: #e05555; text-align: center; font-weight: 600; margin: 3px 0 0; letter-spacing: -0.02em; line-height: 1.1; }

    /* ── 근무 없는 날(0시간)은 흐리게: 근무한 날이 한눈에 도드라지도록 ── */
    .day-cell.empty-work { background: #fbfbfa; }
    .day-cell.empty-work .hour-input,
    .day-cell.empty-work .time-input-small { color: #c9c6c0; }
    .day-cell.empty-work .hour-label { color: #cdcac4; }

    .day-total {
      margin-top: 10px; padding-top: 8px; border-top: 1px dashed #e6e3dd;
      font-size: 14px; font-weight: 700; color: #b8954a; text-align: center; letter-spacing: 0.03em;
    }
    .day-total.is-zero { color: #c4c0b8; font-weight: 600; }

    .hour-label { font-size: 11px; color: #8a8378; font-weight: 500; text-align: center; margin-bottom: 2px; letter-spacing: 0.04em; }
    .hour-input {
      width: 100%; border: none; border-bottom: 1px solid #ebe9e4;
      background: transparent; font-size: 15px; font-weight: 500; color: #1a1a1a;
      font-family: 'Pretendard', 'DM Sans', sans-serif; padding: 4px 2px; outline: none; text-align: center; margin-bottom: 6px;
    }
    .hour-input:focus { border-bottom-color: #b8954a; }
    .time-input-small {
      width: 100%; border: none; border-bottom: 1px solid #ebe9e4;
      background: transparent; font-size: 13px; color: #777;
      font-family: 'Pretendard', 'DM Sans', sans-serif; padding: 4px 2px; outline: none; text-align: center;
    }
    .time-input-small:focus { border-bottom-color: #b8954a; }
    .time-row { display: flex; gap: 3px; align-items: center; margin-bottom: 8px; }
    .time-tilde { font-size: 11px; color: #ccc; }

    .week-summary { background: #faf9f6; border-top: 1px solid #f0ede8; padding: 11px 14px; display: flex; justify-content: flex-start; align-items: center; gap: 8px; flex-wrap: wrap; }
    .week-summary-label { font-size: 13px; color: #888; }
    .week-summary-val { font-size: 13px; font-weight: 700; color: #b8954a; }

    /* ── 급여 내역 (읽기 전용, 자동계산) ── */
    .summary-card { background: #1a1a1a; border-radius: 16px; padding: 30px 32px; color: #fff; margin-bottom: 20px; }
    .summary-title { font-size: 13px; letter-spacing: 0.12em; color: #aaa; margin-bottom: 20px; }
    .summary-list { display: flex; flex-direction: column; }
    .summary-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 16px 0; border-bottom: 1px solid #2a2a2a;
    }
    .summary-row-left { display: flex; flex-direction: column; gap: 4px; }
    .summary-row-label { font-size: 17px; font-weight: 600; color: #fff; letter-spacing: 0.02em; }
    .summary-row-desc { font-size: 12px; color: #999; letter-spacing: 0.02em; }
    .summary-row-val { font-size: 19px; font-weight: 600; color: #e8e0d0; white-space: nowrap; }
    .summary-row-val .won { font-size: 13px; color: #999; margin-left: 2px; font-weight: 400; }
    .summary-total-row {
      display: flex; justify-content: space-between; align-items: center;
      margin-top: 22px; padding-top: 20px; border-top: 2px solid #b8954a;
    }
    .summary-total-label { font-size: 15px; color: #ddd; letter-spacing: 0.08em; font-weight: 500; }
    .summary-total-val { font-family: 'Pretendard', sans-serif; font-size: 32px; color: #b8954a; font-weight: 700; letter-spacing: -0.01em; }
    .summary-total-val .won-big { font-size: 20px; margin-left: 3px; }

    /* ── 공제 내역 & 실수령액 ── */
    .deduct-title { font-size: 13px; letter-spacing: 0.12em; color: #e0a0a0; margin: 26px 0 4px; }
    .summary-row-val.deduct-val { color: #f0a0a0; }
    .net-pay-row {
      display: flex; justify-content: space-between; align-items: center;
      margin-top: 18px; padding: 20px 22px; border-radius: 12px;
      background: linear-gradient(135deg, #b8954a 0%, #9c7d36 100%);
    }
    .net-pay-label { font-size: 17px; color: #fff; letter-spacing: 0.06em; font-weight: 600; }
    .net-pay-val { font-family: 'Pretendard', sans-serif; font-size: 34px; color: #fff; font-weight: 700; letter-spacing: -0.01em; }
    .net-pay-val .won-big { font-size: 20px; margin-left: 3px; }

    .action-row { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
    .autosave-hint { font-size: 12px; color: #bbb; align-self: center; }
  `

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-icon">⚠️</div>
            <div className="modal-title">직원 삭제</div>
            <div className="modal-desc">
              <span className="modal-emp-name">
                {employees.find(e => e.id === deleteConfirm)?.name || '이름 미입력'}
              </span>
              의 데이터를 삭제하시겠습니까?<br />
              삭제된 데이터는 복구할 수 없습니다.
            </div>
            <div className="modal-btns">
              <button className="btn outline" onClick={() => setDeleteConfirm(null)}>취소</button>
              <button className="btn danger" onClick={doDelete}>삭제하기</button>
            </div>
          </div>
        </div>
      )}

      {/* 수식 툴팁 */}


      <div className="wrap">
        <header className="header">
          <div>
            <div className="logo-the">THE</div>
            <div className="logo-main">COMMA<span>'</span></div>
            <div className="logo-sub">LOUNGE</div>
          </div>
          <span className="header-tag">CREW PAYROLL</span>
        </header>

        <main className="main">

          {/* STEP 1: 지점 선택 */}
          {step === 'branch' && (
            <div>
              <h2 className="page-title">지점 선택</h2>
              <p className="page-sub">급여 계산할 지점을 선택해주세요</p>
              <div className="branch-grid">
                {BRANCHES.map((b, i) => (
                  <div key={b.id} className="branch-card" onClick={() => { setSelectedBranch(b); setStep('login'); setPw(''); setPwError(false) }}>
                    <div className="branch-num">0{i + 1}</div>
                    <div className="branch-name">{b.name}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 2: 로그인 */}
          {step === 'login' && (
            <div className="login-wrap">
              <div className="login-box">
                <div className="login-branch">{selectedBranch?.name}</div>
                <h2 className="login-title">매니저 로그인</h2>
                <p className="field-label">비밀번호</p>
                <input type="password" className="text-input" placeholder="비밀번호 입력"
                  value={pw} onChange={e => setPw(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { if (pw === selectedBranch.password) { setStep('main'); setPwError(false); loadAllEmployees(selectedBranch.name) } else setPwError(true) }
                  }}
                />
                {pwError && <p className="error-msg">비밀번호가 틀렸습니다.</p>}
                <button className="btn full" onClick={() => { if (pw === selectedBranch.password) { setStep('main'); setPwError(false); loadAllEmployees(selectedBranch.name) } else setPwError(true) }}>입장</button>
                <br /><br />
                <button className="btn outline full" onClick={() => setStep('branch')}>← 지점 재선택</button>
              </div>
            </div>
          )}

          {/* STEP 3: 급여 계산 */}
          {step === 'main' && activeEmp && (
            <div>
              <div className="section-header">
                <div>
                  <div className="section-title">{selectedBranch?.name} 급여 계산</div>
                  <div className="section-sub">근무시간을 입력하면 급여가 자동으로 계산됩니다</div>
                </div>
                {/* ── 수정 #8: 지점변경 버튼 옆에 엑셀 다운로드 버튼 ── */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files[0]; if (f) handleExcelImport(f); e.target.value = '' }}
                  />
                  <button
                    onClick={() => importInputRef.current?.click()}
                    disabled={importing}
                    style={{
                      padding: '8px 16px',
                      background: importing ? '#f0ede8' : '#b8954a',
                      color: importing ? '#ccc' : '#fff',
                      border: 'none', borderRadius: 8,
                      fontSize: 13, fontWeight: 600,
                      cursor: importing ? 'wait' : 'pointer',
                      letterSpacing: '0.05em', whiteSpace: 'nowrap',
                      fontFamily: "'Pretendard', 'DM Sans', sans-serif",
                    }}
                  >{importing ? '불러오는 중…' : '근무기록 불러오기 ↑'}</button>
                  <button
                    onClick={downloadExcelSingle}
                    disabled={!activeEmp?.name}
                    style={{
                      padding: '8px 16px',
                      background: !activeEmp?.name ? '#f0ede8' : '#1a1a1a',
                      color: !activeEmp?.name ? '#ccc' : '#fff',
                      border: 'none', borderRadius: 8,
                      fontSize: 13, fontWeight: 600,
                      cursor: !activeEmp?.name ? 'not-allowed' : 'pointer',
                      letterSpacing: '0.05em', whiteSpace: 'nowrap',
                      fontFamily: "'Pretendard', 'DM Sans', sans-serif",
                    }}
                  >이 직원만 ↓</button>
                  <button
                    onClick={downloadExcelBranch}
                    style={{
                      padding: '8px 16px',
                      background: '#b8954a',
                      color: '#fff',
                      border: 'none', borderRadius: 8,
                      fontSize: 13, fontWeight: 600,
                      cursor: 'pointer',
                      letterSpacing: '0.05em', whiteSpace: 'nowrap',
                      fontFamily: "'Pretendard', 'DM Sans', sans-serif",
                    }}
                  >지점 전체 엑셀 ↓</button>
                  <button
                    onClick={printPayslip}
                    disabled={!activeEmp?.name}
                    style={{
                      padding: '8px 16px',
                      background: !activeEmp?.name ? '#f0ede8' : '#fff',
                      color: !activeEmp?.name ? '#ccc' : '#1a1a1a',
                      border: '1px solid #d0ccc5', borderRadius: 8,
                      fontSize: 13, fontWeight: 600,
                      cursor: !activeEmp?.name ? 'not-allowed' : 'pointer',
                      letterSpacing: '0.05em', whiteSpace: 'nowrap',
                      fontFamily: "'Pretendard', 'DM Sans', sans-serif",
                    }}
                  >급여명세서 🖨</button>
                  <button className="btn outline" onClick={handleBranchChange}>← 지점 변경</button>
                </div>
              </div>

              {/* 직원 탭 - 직원 왼쪽/알바 오른쪽 */}
              <div className="emp-tabs" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                  {/* 직원 탭 (왼쪽) */}
                  {employees.filter(emp => emp.empType === '직원').map(emp => (
                    <div key={emp.id} className={`emp-tab staff-tab${emp.id === activeEmpId ? ' active' : ''}`} onClick={() => handleTabSwitch(emp.id)}>
                      <span className="emp-tab-badge staff">직</span>
                      <span className="emp-tab-name">{emp.name || '이름 미입력'}</span>
                      {employees.length > 1 && (
                        <span className="emp-tab-del" onClick={e => { e.stopPropagation(); confirmDelete(emp.id) }}>×</span>
                      )}
                    </div>
                  ))}
                  <div className="emp-tab-add" onClick={() => addEmployee('직원')} title="직원 추가">＋</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                  {/* 알바 탭 (오른쪽) */}
                  {employees.filter(emp => emp.empType !== '직원').map(emp => (
                    <div key={emp.id} className={`emp-tab alba-tab${emp.id === activeEmpId ? ' active' : ''}`} onClick={() => handleTabSwitch(emp.id)}>
                      <span className="emp-tab-badge alba">알</span>
                      <span className="emp-tab-name">{emp.name || '이름 미입력'}</span>
                      {employees.length > 1 && (
                        <span className="emp-tab-del" onClick={e => { e.stopPropagation(); confirmDelete(emp.id) }}>×</span>
                      )}
                    </div>
                  ))}
                  <div className="emp-tab-add" onClick={() => addEmployee('알바')} title="알바 추가">＋</div>
                </div>
              </div>

              {/* 구분 탭 */}
              <div style={{ marginBottom: 8 }}>
                <div className="field-label" style={{ marginBottom: 6 }}>구분</div>
                <div className="emp-type-tabs">
                  <button
                    className={`emp-type-tab${activeEmp.empType === '직원' ? ' active' : ''}`}
                    onClick={() => updateEmp('empType', '직원')}
                  >직원</button>
                  <button
                    className={`emp-type-tab${(activeEmp.empType === '알바' || !activeEmp.empType) ? ' active' : ''}`}
                    onClick={() => updateEmp('empType', '알바')}
                  >알바</button>
                </div>
                {activeEmp.empType === '직원' && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#a89878', letterSpacing: '0.02em' }}>
                    ※ 직원 기본급은 시급 × 209시간(주휴 포함)으로 자동 계산됩니다.
                  </div>
                )}
              </div>

              {/* 직원 정보 1행 */}
              <div className="info-grid">
                <div className="info-card">
                  <div className="info-card-label">직원 이름</div>
                  <input value={activeEmp.name} onChange={e => updateEmp('name', e.target.value)} placeholder="이름 입력" />
                </div>
                <div className="info-card">
                  <div className="info-card-label">주민등록번호</div>
                  <input value={activeEmp.residentId} onChange={e => updateEmp('residentId', e.target.value)} placeholder="000000-0000000" />
                </div>
                <div className="info-card">
                  <div className="info-card-label">시급 (원)</div>
                  <input type="number" value={activeEmp.hourlyWage} onChange={e => updateEmp('hourlyWage', Number(e.target.value))} />
                </div>
                {/* ── 수정 A: 1행 4번째 → 기본 근무 시간 (계좌번호와 위치 교환) ── */}
                <div className="info-card">
                  <div className="info-card-label">기본 근무 시간</div>
                  <div className="time-range">
                    <input
                      value={activeEmp.defaultTimeStart}
                      onChange={e => updateEmp('defaultTimeStart', e.target.value)}
                      onBlur={e => handleDefaultTimeBlur('defaultTimeStart', e.target.value)}
                      placeholder="00:00"
                    />
                    <span className="time-sep">~</span>
                    <input
                      value={activeEmp.defaultTimeEnd}
                      onChange={e => updateEmp('defaultTimeEnd', e.target.value)}
                      onBlur={e => handleDefaultTimeBlur('defaultTimeEnd', e.target.value)}
                      placeholder="00:00"
                    />
                  </div>
                </div>
              </div>

              {/* 직원 정보 2행 */}
              <div className="info-grid-2">
                {/* ── 수정 A: 2행 1번째 → 계좌번호 (기본 근무 시간과 위치 교환) ── */}
                <div className="info-card">
                  <div className="info-card-label">계좌번호</div>
                  <input
                    value={activeEmp.accountNumber || ''}
                    onChange={e => updateEmp('accountNumber', e.target.value)}
                    placeholder="은행 및 계좌번호 입력"
                  />
                </div>
                <div className="info-card">
                  <div className="info-card-label">핸드폰 번호</div>
                  <input value={activeEmp.phone} onChange={e => updateEmp('phone', e.target.value)} placeholder="010-0000-0000" />
                </div>
                <div className="info-card">
                  <div className="info-card-label">이메일</div>
                  <input value={activeEmp.email} onChange={e => updateEmp('email', e.target.value)} placeholder="example@email.com" />
                </div>
                {/* ── 월/연도 변경 ── */}
                <div className="info-card" style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div className="info-card-label">연도</div>
                    <input
                      type="number"
                      value={activeEmp.year}
                      onChange={e => handleYearChange(Number(e.target.value))}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="info-card-label">월</div>
                    <select
                      value={activeEmp.month}
                      onChange={e => handleMonthChange(Number(e.target.value))}
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* 입사일 / 퇴사일 (직원만) — 중도 입·퇴사 시 기본급 자동 일할계산 */}
              {activeEmp.empType === '직원' && (
                <div className="info-grid-2" style={{ marginTop: 10 }}>
                  <div className="info-card">
                    <div className="info-card-label">입사일 (선택)</div>
                    <input
                      type="date"
                      value={activeEmp.hireDate || ''}
                      onChange={e => updateEmp('hireDate', e.target.value)}
                    />
                  </div>
                  <div className="info-card">
                    <div className="info-card-label">퇴사일 (선택)</div>
                    <input
                      type="date"
                      value={activeEmp.resignDate || ''}
                      onChange={e => updateEmp('resignDate', e.target.value)}
                    />
                  </div>
                  <div className="info-card" style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center' }}>
                    <div style={{ fontSize: 11.5, color: '#5c5446', fontWeight: 500, letterSpacing: '0.02em', lineHeight: 1.5 }}>
                      ※ 입사일·퇴사일을 입력하면 해당 월 기본급이 <b style={{ color: '#b8954a' }}>일할계산</b>(시급×209 ÷ 그달 총일수 × 재직일수)으로 자동 적용됩니다. 비워두면 한 달 전체 근무로 계산됩니다.
                    </div>
                  </div>
                </div>
              )}

              {/* 특이사항 */}
              <div className="note-row">
                <p className="field-label" style={{ marginBottom: 8 }}>이달의 특이사항</p>
                <input
                  className="note-input"
                  value={activeEmp.specialNote}
                  onChange={e => updateEmp('specialNote', e.target.value)}
                  placeholder="예) 11월 야간 추가 5시간"
                />
              </div>

              {/* ── 월 합계 요약 ── */}
              {totals && (
                <div className="month-stat-box">
                  <div className="month-stat-title">{activeEmp.year}년 {activeEmp.month}월 근무 요약</div>
                  <div className="month-stat-grid">
                    <div className="month-stat"><span className="ms-val">{totals.workDays}<small>일</small></span><span className="ms-label">근무일수</span></div>
                    <div className="month-stat"><span className="ms-val">{totals.hoursWork}<small>시간</small></span><span className="ms-label">총 근로시간</span></div>
                    <div className="month-stat"><span className="ms-val">{totals.hoursDay}<small>시간</small></span><span className="ms-label">주간</span></div>
                    <div className="month-stat"><span className="ms-val">{totals.hoursNight}<small>시간</small></span><span className="ms-label">야간</span></div>
                    <div className="month-stat"><span className="ms-val">{totals.hoursOvertime}<small>시간</small></span><span className="ms-label">연장</span></div>
                    <div className="month-stat"><span className="ms-val">{totals.hoursHolidayDay + totals.hoursHolidayOt + totals.hoursHolidayNight}<small>시간</small></span><span className="ms-label">휴일근로</span></div>
                    <div className="month-stat"><span className="ms-val">{totals.offDays}<small>일</small></span><span className="ms-label">휴무</span></div>
                    <div className="month-stat"><span className="ms-val">{totals.annualDays}<small>일</small></span><span className="ms-label">연차</span></div>
                    {totals.absentDays > 0 && (
                      <div className="month-stat"><span className="ms-val" style={{ color:'#e05555' }}>{totals.absentDays}<small>일</small></span><span className="ms-label">결근</span></div>
                    )}
                  </div>
                </div>
              )}

              {/* 달력 */}
              <div className="cal-wrap">
                {weeks.map((week, wi) => {
                  const { weekDayH, weekNightH, weekWorkH, weekHolidayH, weeklyHolidayPay } = calcWeekPay(week, activeEmp)
                  return (
                    <div key={wi} className="week-block">
                      <div className="week-dow-row">
                        <div className="week-dow-corner">{wi + 1}주</div>
                        {DAY_LABELS.map((d) => (
                          <div key={d} className="week-dow"
                            style={d==='일' ? { color:'#e05555' } : d==='토' ? { color:'#4a90d9' } : {}}
                          >{d}</div>
                        ))}
                      </div>
                      <div className="week-row">
                        <div className="week-label"></div>
                        {week.map((day, di) => {
                          if (!day) return <div key={di} className="day-cell empty" />
                          const ds = `${activeEmp.year}-${String(activeEmp.month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
                          const d = activeEmp.workData[ds] || {}
                          const type = d.type || '평'
                          const isHolidayWork = type === '휴'
                          const isDayOff = type === '공'
                          const isAnnual = type === '연'
                          const isAbsent = type === '결'
                          // ── 입사 전 / 퇴사 후: 재직 범위 밖이면 입력 차단 ──
                          const cellDate = parseYMD(ds)
                          const hireD = parseYMD(activeEmp.hireDate)
                          const resignD = parseYMD(activeEmp.resignDate)
                          const beforeHire = cellDate && hireD && cellDate < hireD
                          const afterResign = cellDate && resignD && cellDate > resignD
                          const outOfEmp = beforeHire || afterResign
                          const noInput = isDayOff || isAnnual || isAbsent || outOfEmp
                          // ── 하루 총 근무시간 (휴게 제외): 주간+야간+연장 (휴일이면 휴일주간+휴일야간+휴일연장) ──
                          const dayTotal = isHolidayWork
                            ? (d.holidayDaytimeH || 0) + (d.holidayNightH || 0) + (d.holidayOtH || 0)
                            : (d.daytimeH || 0) + (d.nightH || 0) + (d.overtimeH || 0)

                          // ── 수정 #2: 임시 입력 상태 우선 표시 ──
                          const tStart = timeInputs[ds]?.start !== undefined ? timeInputs[ds].start : (d.timeStart !== undefined ? d.timeStart : activeEmp.defaultTimeStart)
                          const tEnd   = timeInputs[ds]?.end   !== undefined ? timeInputs[ds].end   : (d.timeEnd   !== undefined ? d.timeEnd   : activeEmp.defaultTimeEnd)
                          const holidayName = HOLIDAYS[ds]
                          // ── 근무가 전혀 없는 날(0시간) 구분: 휴무/연차가 아닌데 총 근무 0이면 흐리게 표시 ──
                          const isEmptyWork = !noInput && dayTotal === 0

                          return (
                            <div key={di} className={`day-cell ${isHolidayWork ? 'is-holiday' : ''} ${noInput ? 'is-off' : ''} ${isEmptyWork ? 'empty-work' : ''} ${outOfEmp ? 'out-of-emp' : ''}`}>
                              <div className="day-head">
                                <div
                                  className={`day-date ${holidayName ? 'gov-holiday' : ''} ${isHolidayWork ? 'holiday-type' : ''} ${isAbsent ? 'absent-type' : isAnnual ? 'annual-type' : isDayOff ? 'off-type' : ''}`}
                                  onClick={() => { if (!outOfEmp) toggleDayType(ds) }}
                                  title={outOfEmp ? (beforeHire ? '입사 전' : '퇴사 후') : (holidayName ? `${holidayName} · 클릭: 평일 → 휴일근로 → 휴무 → 연차 → 결근 전환` : '클릭: 평일 → 휴일근로 → 휴무 → 연차 → 결근 전환')}
                                >{day}</div>
                                {holidayName && <div className="gov-holiday-name">{holidayName}</div>}
                              </div>
                              <div className="day-sep" />

                              {outOfEmp ? (
                                <div className="off-text" style={{ color:'#bbb' }}>{beforeHire ? '입사 전' : '퇴사 후'}</div>
                              ) : noInput ? (
                                <div className="off-text" style={isAbsent ? { color:'#e05555', fontWeight:700 } : isAnnual ? { color:'#3b82c4' } : undefined}>{isAbsent ? '결근' : isAnnual ? '연차' : '휴무'}</div>
                              ) : (
                                <>
                                  {/* 시간 입력 행 */}
                                  <div className="time-row">
                                    <input
                                      className="time-input-small"
                                      value={tStart}
                                      onChange={e => handleTimeChange(ds, 'timeStart', e.target.value)}
                                      onFocus={e => e.target.select()}
                                      onBlur={e => handleTimeBlur(ds, 'timeStart', e.target.value)}
                                      placeholder="00:00"
                                    />
                                    <span className="time-tilde">~</span>
                                    <input
                                      className="time-input-small"
                                      value={tEnd}
                                      onChange={e => handleTimeChange(ds, 'timeEnd', e.target.value)}
                                      onFocus={e => e.target.select()}
                                      onBlur={e => handleTimeBlur(ds, 'timeEnd', e.target.value)}
                                      placeholder="00:00"
                                    />
                                  </div>

                                  {!isHolidayWork ? (
                                    <>
                                      <div className="hour-label">주간</div>
                                      {numInput(d.daytimeH, v => updateWorkDay(ds, 'daytimeH', v))}
                                      <div className="hour-label">야간</div>
                                      {numInput(d.nightH, v => updateWorkDay(ds, 'nightH', v))}
                                      <div className="hour-label">휴게</div>
                                      {numInput(d.restH, v => handleRestChange(ds, v, false))}
                                      <div className="hour-label">연장</div>
                                      {numInput(d.overtimeH, v => updateWorkDay(ds, 'overtimeH', v))}
                                    </>
                                  ) : (
                                    <>
                                      <div className="hour-label" style={{color:'#e05555'}}>휴일주간</div>
                                      {numInput(d.holidayDaytimeH, v => updateWorkDay(ds, 'holidayDaytimeH', v))}
                                      <div className="hour-label" style={{color:'#e05555'}}>휴일야간</div>
                                      {numInput(d.holidayNightH, v => updateWorkDay(ds, 'holidayNightH', v))}
                                      <div className="hour-label" style={{color:'#e05555'}}>휴일휴게</div>
                                      {numInput(d.holidayRestH, v => handleRestChange(ds, v, true))}
                                      <div className="hour-label" style={{color:'#e05555'}}>휴일연장</div>
                                      {numInput(d.holidayOtH, v => updateWorkDay(ds, 'holidayOtH', v))}
                                    </>
                                  )}
                                  {/* 하루 총 근무시간 (휴게 제외) */}
                                  <div className={`day-total ${isEmptyWork ? 'is-zero' : ''}`}>
                                    {isEmptyWork ? '미입력' : `일 ${dayTotal}시간`}
                                  </div>
                                </>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      <div className="week-summary">
                        <span className="week-summary-label">
                          근무 총 {weekWorkH}시간 · 주간 {weekDayH}시간 · 야간 {weekNightH}시간{weekHolidayH > 0 && ` · 휴일 ${weekHolidayH}시간`}
                          {activeEmp.empType !== '직원' && ' · 주휴수당'}
                        </span>
                        {activeEmp.empType !== '직원' && (
                          <span className="week-summary-val">
                            {weekDayH >= 15 ? <>{fmt(weeklyHolidayPay)}<span className="won">원</span></> : '미적용 (15시간 미만)'}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* 공제 방식 (급여 내역 바로 위) */}
              <div style={{ marginBottom: 16 }}>
                <div className="field-label" style={{ marginBottom: 6 }}>공제 방식 (세금·4대보험)</div>
                <div className="emp-type-tabs">
                  {[
                    { v: 'none', t: '공제 없음' },
                    { v: '3.3',  t: '3.3% 원천징수' },
                    { v: '4대',  t: '4대보험' },
                  ].map(({ v, t }) => (
                    <button
                      key={v}
                      className={`emp-type-tab${(activeEmp.deductionType || 'none') === v ? ' active' : ''}`}
                      onClick={() => updateEmp('deductionType', v)}
                    >{t}</button>
                  ))}
                </div>
                {activeEmp.deductionType === '4대' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12, color: '#888' }}>
                    소득세 (세무사 안내 금액)
                    <input
                      type="number"
                      value={activeEmp.manualIncomeTax || 0}
                      onChange={e => updateEmp('manualIncomeTax', Number(e.target.value))}
                      style={{ width: 110, border: '1px solid #d0ccc5', borderRadius: 6, padding: '4px 8px', fontSize: 13, fontFamily: "'Pretendard', 'DM Sans', sans-serif" }}
                    />
                    원 <span style={{ color: '#bbb' }}>(지방소득세는 10% 자동)</span>
                  </label>
                )}
                {activeEmp.deductionType === '3.3' && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#bbb' }}>※ 사업소득세 3% + 지방소득세 0.3% 자동 공제</div>
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, color: '#888' }}>
                  식대 (비과세)
                  <input
                    type="number"
                    value={activeEmp.mealAllowance || 0}
                    onChange={e => updateEmp('mealAllowance', Number(e.target.value))}
                    style={{ width: 110, border: '1px solid #d0ccc5', borderRadius: 6, padding: '4px 8px', fontSize: 13, fontFamily: "'Pretendard', 'DM Sans', sans-serif" }}
                  />
                  원 <span style={{ color: '#bbb' }}>(4대보험·소득세 산정 제외)</span>
                </label>
              </div>

              {/* ── 수정 #5: 급여 합계 (수동 입력 + 자동계산 합산) ── */}
              {totals && (
                <div className="summary-card">
                  <div className="summary-title">급여 내역 — 캘린더 입력값으로 자동 계산됩니다</div>
                  <div className="summary-list">
                    {[
                      totals.isStaff
                        ? { label: '기본급',  total: totals.totalBasic, hours: 209,
                            desc: totals.proration.partial
                              ? `${totals.staffMonthlyBasic.toLocaleString()}원 ÷ ${totals.proration.monthDays}일 × ${totals.proration.activeDays}일 (중도 입·퇴사 일할계산)${totals.absentDeduction > 0 ? ` − 결근 공제 ${totals.absentDeduction.toLocaleString()}원` : ''}`
                              : `시급 ${activeEmp.hourlyWage.toLocaleString()}원 × 209시간 (직원 고정·주휴 포함)${totals.absentDeduction > 0 ? ` − 결근 공제 ${totals.absentDeduction.toLocaleString()}원` : ''}` }
                        : { label: '기본급',  total: totals.totalBasic, hours: totals.hoursBaseAlba,     desc: `시급 ${activeEmp.hourlyWage.toLocaleString()}원 × ${totals.hoursBaseAlba}시간 (주간+야간)` },
                      ...(totals.isStaff && totals.absentDeduction > 0
                        ? [{ label: '└ 결근 공제', total: 0, hours: null, neg: -totals.absentDeduction,
                            desc: `결근 ${totals.absentDays}일 × 8시간 + 주휴 ${totals.absentWeeks}주 × 8시간 = ${(totals.absentDays*8 + totals.absentWeeks*8)}시간 × 시급 (기본급에서 차감됨)` }]
                        : []),
                      { label: '주휴수당',  total: totals.totalWeeklyHoliday,   hours: totals.hoursWeekly,        desc: `주간시간 ÷ 40 × 8 × 시급` },
                      { label: '연장수당',  total: totals.totalOvertime,        hours: totals.hoursOvertimePay,   desc: `연장 ${totals.hoursOvertimePay}시간 × 시급 × 1.5배` },
                      { label: '야간수당',  total: totals.totalNight,           hours: totals.hoursNightPay,      desc: `야간 ${totals.hoursNightPay}시간 × 시급 × 0.5배` },
                      { label: '휴일근로',  total: totals.totalHoliday,         hours: totals.hoursHolidayWork,   desc: `휴일근무 ${totals.hoursHolidayWork}시간(주간+야간) × 시급 × 1.5배` },
                      { label: '휴일연장',  total: totals.totalHolidayOtPay,    hours: totals.hoursHolidayOt,     desc: `휴일연장 ${totals.hoursHolidayOt}시간 × 시급 × 2.0배` },
                      { label: '휴일야간',  total: totals.totalHolidayNightPay, hours: totals.hoursHolidayNight,  desc: `휴일야간 ${totals.hoursHolidayNight}시간 × 시급 × 0.5배 (휴일근로에 추가 가산)` },
                      { label: '식대',      total: totals.meal,                 hours: null,                      desc: `비과세 (4대보험·소득세 제외)` },
                    ].filter(row => row.total > 0 || row.label === '기본급' || row.neg).map(({ label, total, hours, desc, neg }) => (
                      <div key={label} className="summary-row">
                        <div className="summary-row-left">
                          <div className="summary-row-label" style={neg ? { color:'#e05555' } : undefined}>{label}</div>
                          <div className="summary-row-desc">{desc}</div>
                        </div>
                        <div className="summary-row-val" style={neg ? { color:'#e05555' } : undefined}>{neg ? `−${fmt(-neg)}` : fmt(total)}<span className="won">원</span></div>
                      </div>
                    ))}
                  </div>
                  <div className="summary-total-row">
                    <div className="summary-total-label">지급액 계{totals.meal > 0 ? ' (식대 포함)' : ''}</div>
                    <div className="summary-total-val">{fmt(totals.grossPay)}<span className="won-big">원</span></div>
                  </div>

                  {/* ── 공제 내역 & 실수령액 ── */}
                  {totals.deductions.dt !== 'none' && (
                    <>
                      <div className="deduct-title">공제 내역</div>
                      <div className="summary-list">
                        {[
                          { label: '국민연금',   total: totals.deductions.pension,    desc: '과세급여 × 4.5%' },
                          { label: '건강보험',   total: totals.deductions.health,     desc: '과세급여 × 3.545%' },
                          { label: '장기요양',   total: totals.deductions.care,       desc: '건강보험료 × 12.95%' },
                          { label: '고용보험',   total: totals.deductions.employment, desc: '과세급여 × 0.9%' },
                          { label: '소득세',     total: totals.deductions.incomeTax,  desc: '세무사 안내 금액' },
                          { label: '사업소득세', total: totals.deductions.bizTax,     desc: '과세급여 × 3%' },
                          { label: '지방소득세', total: totals.deductions.localTax,   desc: totals.deductions.dt === '3.3' ? '과세급여 × 0.3%' : '소득세 × 10%' },
                        ].filter(r => r.total > 0).map(({ label, total, desc }) => (
                          <div key={label} className="summary-row">
                            <div className="summary-row-left">
                              <div className="summary-row-label">{label}</div>
                              <div className="summary-row-desc">{desc}</div>
                            </div>
                            <div className="summary-row-val deduct-val">- {fmt(total)}<span className="won">원</span></div>
                          </div>
                        ))}
                      </div>
                      <div className="summary-total-row" style={{ borderTop: '1px dashed #e6e3dd' }}>
                        <div className="summary-total-label" style={{ color: '#999', fontSize: 15 }}>공제 합계</div>
                        <div className="summary-total-val" style={{ color: '#e05555', fontSize: 20 }}>- {fmt(totals.totalDeduction)}<span className="won-big">원</span></div>
                      </div>
                      <div className="net-pay-row">
                        <div className="net-pay-label">실수령액</div>
                        <div className="net-pay-val">{fmt(totals.netPay)}<span className="won-big">원</span></div>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button
                  className="btn outline"
                  onClick={() => handleManualSave('saved')}
                  style={{ flex: 1, padding: '18px', fontSize: '14px', cursor: 'pointer' }}
                >
                  💾 임시 저장하기
                </button>
                <button
                  className="btn accent"
                  onClick={() => handleManualSave('final')}
                  style={{ flex: 1, padding: '18px', fontSize: '14px', background: '#1a1a1a', color: '#fff', cursor: 'pointer' }}
                >
                  ✅ 최종 마감하기
                </button>
              </div>

              <div style={{ textAlign: 'center', marginTop: '15px' }}>
                <span className="autosave-hint">※ 입력 시 자동 저장은 '진행 중' 상태로 저장됩니다.</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button className="btn outline" style={{ padding: '6px 12px', fontSize: '11px', opacity: 0.5 }} onClick={() => {
                  if (confirm('이 직원의 근무 데이터를 초기화할까요?')) {
                    setEmployees(prev => prev.map(e => e.id === activeEmpId ? { ...e, workData: {}, specialNote: '' } : e))
                  }
                }}>데이터 초기화</button>
              </div>

              {/* ── 지점별 인건비 총금액 (맨 아래) ── */}
              {(() => {
                const totalsList = employees.map(e => calcTotal(e))
                const branchGross = totalsList.reduce((s, t) => s + (t.grossPay || 0), 0)
                // 실지급 합계는 개별 공제 설정과 무관하게: 직원=4대보험, 알바=3.3% 원천징수 강제 적용
                const branchNet = employees.reduce((s, e, i) => {
                  const t = totalsList[i]
                  const forcedType = e.empType === '직원' ? '4대' : '3.3'
                  const ded = calcDeductions(t.grandTotal, { ...e, deductionType: forcedType })
                  return s + (t.grossPay - ded.total)
                }, 0)
                const staffCount  = employees.filter(e => e.empType === '직원').length
                const albaCount   = employees.length - staffCount
                return (
                  <div className="branch-cost-card" style={{ marginTop: 28, marginBottom: 0 }}>
                    <div className="branch-cost-head">
                      <span className="branch-cost-title">{selectedBranch?.name} · {activeEmp.year}년 {activeEmp.month}월 인건비 총금액</span>
                      <span className="branch-cost-sub">직원 {staffCount}명 · 알바 {albaCount}명 (총 {employees.length}명)</span>
                    </div>
                    <div className="branch-cost-grid">
                      <div className="branch-cost-item">
                        <div className="bc-label">지급액 합계 (식대 포함)</div>
                        <div className="bc-val">{fmt(branchGross)}<span className="won">원</span></div>
                      </div>
                      <div className="branch-cost-item">
                        <div className="bc-label">실지급 합계 (직원 4대보험·알바 3.3% 공제)</div>
                        <div className="bc-val net">{fmt(branchNet)}<span className="won">원</span></div>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </main>
      </div>
    </>
  )
}
