import { useState } from 'react'
import ManagerDashboard from '../components/ManagerDashboard'

const MASTER_PASSWORD = 'ejzhaak0080'

// 전 지점 통합 관리 (별도 주소 /manager). 메인 앱(index.js) 안에서도 동일 화면을 쓴다.
export default function PayrollManager() {
  const [auth, setAuth] = useState(false)
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState(false)

  const loginCss = `
    @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #f8f7f4; font-family: 'Pretendard', sans-serif; color: #1a1a1a; }
    .login-wrap { display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px; }
    .login-box { background: #fff; border: 1px solid #ebe9e4; border-radius: 16px; padding: 36px 28px; width: 100%; max-width: 320px; text-align: center; }
    .login-logo { height: 56px; width: auto; margin: 0 auto 18px; display: block; }
    .login-title { font-weight: 700; font-size: 19px; margin-bottom: 24px; }
    .login-input { width: 100%; background: #f8f7f4; border: 1.5px solid #d0ccc5; border-radius: 8px; padding: 12px 14px; font-size: 14px; color: #1a1a1a; font-family: 'Pretendard', sans-serif; outline: none; margin-bottom: 10px; }
    .login-input:focus { border-color: #b8954a; background: #fff; }
    .login-btn { width: 100%; padding: 13px; background: #1a1a1a; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: 'Pretendard', sans-serif; letter-spacing: 0.08em; }
    .login-btn:hover { background: #333; }
    .error-msg { font-size: 12px; color: #e05555; margin-bottom: 10px; }
  `

  if (!auth) return (
    <>
      <style dangerouslySetInnerHTML={{ __html: loginCss }} />
      <div className="login-wrap">
        <div className="login-box">
          <img src="/logo.png" alt="THE COMMA' LOUNGE" className="login-logo" />
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
      <style dangerouslySetInnerHTML={{ __html: `body { background: #f8f7f4; }` }} />
      <ManagerDashboard />
    </>
  )
}
