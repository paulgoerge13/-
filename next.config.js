/** @type {import('next').NextConfig} */
const nextConfig = {
  // ── 캐시 정책 ──
  // 해시가 붙은 정적 파일(_next/static)은 영구 캐시(immutable) 그대로 두고,
  // 그 외 HTML 문서·API 응답은 온라인일 땐 매번 서버에 재검증(no-cache)해 최신을 받는다.
  // → 새 배포가 나가면 옛 HTML(=옛 JS 번들)을 붙들지 않고 즉시 최신 화면을 받아온다.
  //
  // ⚠ 단, 예전엔 'must-revalidate' 가 붙어 있어서 모바일 인앱 브라우저(카톡 등)에서
  //   네트워크가 순간 끊겨 재검증에 실패하면 저장된 페이지를 쓰지 않고 곧바로
  //   "This page couldn't load / server error" 를 띄웠다(가끔 뜨던 그 화면).
  //   → must-revalidate 제거 + stale-if-error 추가: 재검증이 잠깐 실패하면
  //     에러 대신 직전에 받아둔 페이지를 보여준다(그다음 접속 때 자동으로 최신화).
  async headers() {
    return [
      {
        source: '/((?!_next/static|_next/image|favicon.ico).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, stale-if-error=86400' },
        ],
      },
    ]
  },
}
module.exports = nextConfig
