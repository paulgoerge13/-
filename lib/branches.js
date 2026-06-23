// ── 지점 목록 (한 곳에서 관리) ──
// 지점을 추가/수정하려면 이 파일만 고치면 됩니다.
// index.js(지점 선택·로그인)와 ManagerDashboard.js(관리자 집계·비밀번호 표)가 함께 사용합니다.
export const BRANCHES = [
  { id: 'gidc',    name: '광명GIDC점',  password: 'gidc1234' },
  { id: 'ingye',   name: '인계점',       password: 'ingye13' },
  { id: 'anyang',  name: '안양일번가점', password: 'anyang40' },
  { id: 'iksan',   name: '익산점',       password: 'iksan08' },
  { id: 'juan',    name: '인천주안점',   password: 'juan00' },
  { id: 'hanam',   name: '하남점',       password: 'hanam77' },
  { id: 'hanip',   name: '한잎꼬마김밥',  password: 'hanip01' },
  { id: 'siheung', name: '시흥집',       password: 'siheung01' },
]

// 지점 이름만 필요한 화면용 (관리자 집계 등)
export const BRANCH_NAMES = BRANCHES.map(b => b.name)
