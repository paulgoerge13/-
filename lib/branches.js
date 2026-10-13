// ── 지점 목록 (한 곳에서 관리) ──
// 지점을 추가/수정하려면 이 파일만 고치면 됩니다.
// index.js(지점 선택·로그인)와 ManagerDashboard.js(관리자 집계·비밀번호 표)가 함께 사용합니다.
// brand: 'thecomma' = 더콤마라운지 카페 / 그 외는 별개 브랜드(한잎꼬마김밥·시흥집)
// corp: 사업자(법인). 세무사에 내는 급여대장·사업소득지급대장은 법인별로 따로 만들어야 한다.
//   남양주점은 더콤마라운지 브랜드지만 법인이 달라서(우드앤) 데이원 대장에 섞이면 안 된다.
//   short = 화면에 띄우는 짧은 이름 / name = 세무사 제출 문서에 찍는 정식 표기
export const CORPS = {
  dayone:  { id: 'dayone',  label: '데이원', short: '(주)데이원컴퍼니', name: '(주)데이원컴퍼니 더콤마라운지 익산점(본사)' },
  woodand: { id: 'woodand', label: '우드앤', short: '우드앤',          name: '우드앤' },
  maht:    { id: 'maht',    label: '마흐트', short: '주식회사 마흐트',  name: '주식회사 마흐트' },
  etc:     { id: 'etc',     label: '기타',   short: '',                name: '' },
}

// 법인 표시 순서 (대장·버튼·보드가 모두 이 순서를 쓴다)
export const CORP_ORDER = ['dayone', 'woodand', 'maht', 'etc']

export const BRANCHES = [
  { id: 'gidc',    name: '광명GIDC점',  password: 'gidc1234',  brand: 'thecomma', corp: 'dayone' },
  { id: 'ingye',   name: '인계점',       password: 'ingye13',   brand: 'thecomma', corp: 'dayone' },
  { id: 'anyang',  name: '안양일번가점', password: 'ay40',       brand: 'thecomma', corp: 'dayone' },
  { id: 'iksan',   name: '익산점',       password: 'iksan08',    brand: 'thecomma', corp: 'dayone' },
  { id: 'juan',    name: '인천주안점',   password: 'juan00',     brand: 'thecomma', corp: 'dayone' },
  { id: 'hanam',   name: '하남점',       password: 'hanam77',    brand: 'thecomma', corp: 'dayone' },
  { id: 'nyj',     name: '남양주점',     password: 'nyj01',      brand: 'thecomma', corp: 'woodand' },
  { id: 'gubok',   name: '구복만두 중동점', password: 'gubok01',  brand: 'gubok',    corp: 'etc' },
  // inactive: 더 이상 운영하지 않는 곳. 지난 기록 조회는 되지만 목록에서 맨 뒤 · 흐리게 표시된다.
  { id: 'hanip',   name: '한잎꼬마김밥',  password: 'hanip01',    brand: 'hanip', corp: 'etc', inactive: true },
  { id: 'siheung', name: '시흥집',       password: 'siheung01',  brand: 'etc',   corp: 'etc', inactive: true },
]

// 지점 이름 → 법인 id
export const CORP_OF_BRANCH = Object.fromEntries(BRANCHES.map(b => [b.name, b.corp || 'etc']))

// 지점 이름 → 법인 정보 (없으면 '기타')
export function corpOf(branchName) {
  return CORPS[CORP_OF_BRANCH[branchName] || 'etc'] || CORPS.etc
}

// ── 급여 레코드 한 건의 법인 ──
//   보통은 지점으로 정해지지만, 같은 지점에서 일해도 소속 법인이 다른 사람이 있다
//   (예: 안양일번가점 도주완 → 마흐트). 그런 사람은 work_data._corp 로 따로 지정한다.
export function corpIdOfRecord(rec) {
  const v = rec && rec.work_data && rec.work_data._corp
  if (v && CORPS[v]) return v
  return CORP_OF_BRANCH[rec && rec.branch] || 'etc'
}

// 지점 이름만 필요한 화면용 (관리자 집계 등)
export const BRANCH_NAMES = BRANCHES.map(b => b.name)

// 더콤마라운지(카페) 지점 이름만 (관리자 집계에서 '더콤마 전체' 묶음용)
export const THECOMMA_BRANCH_NAMES = BRANCHES.filter(b => b.brand === 'thecomma').map(b => b.name)
