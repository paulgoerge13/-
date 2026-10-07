// ── 지점 목록 (한 곳에서 관리) ──
// 지점을 추가/수정하려면 이 파일만 고치면 됩니다.
// index.js(지점 선택·로그인)와 ManagerDashboard.js(관리자 집계·비밀번호 표)가 함께 사용합니다.
// brand: 'thecomma' = 더콤마라운지 카페 / 그 외는 별개 브랜드(한잎꼬마김밥·시흥집)
// corp: 사업자(법인). 세무사에 내는 급여대장·사업소득지급대장은 법인별로 따로 만들어야 한다.
//   남양주점은 더콤마라운지 브랜드지만 법인이 달라서(우드앤) 데이원 대장에 섞이면 안 된다.
//   short = 화면에 띄우는 짧은 이름 / name = 세무사 제출 문서에 찍는 정식 표기
export const CORPS = {
  dayone:  { id: 'dayone',  label: '데이원', short: '(주)데이원컴퍼니', name: '(주)데이원컴퍼니 더콤마라운지익산점(본사)' },
  woodand: { id: 'woodand', label: '우드앤', short: '우드앤',          name: '우드앤' },
  etc:     { id: 'etc',     label: '기타',   short: '',                name: '' },
}

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

// 지점 이름만 필요한 화면용 (관리자 집계 등)
export const BRANCH_NAMES = BRANCHES.map(b => b.name)

// 더콤마라운지(카페) 지점 이름만 (관리자 집계에서 '더콤마 전체' 묶음용)
export const THECOMMA_BRANCH_NAMES = BRANCHES.filter(b => b.brand === 'thecomma').map(b => b.name)
