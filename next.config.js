/** @type {import('next').NextConfig} */
const nextConfig = {
  // ── 캐시 정책 ──
  // 해시가 붙은 정적 파일(_next/static)은 영구 캐시(immutable) 그대로 두고,
  // 그 외 HTML 문서·API 응답은 매번 서버에 재검증(no-cache)하도록 한다.
  // → 새 배포가 나가면 브라우저가 옛 HTML(=옛 JS 번들)을 붙들지 않고
  //    즉시 최신 화면을 받아온다. ("강력 새로고침 안 해도 최신 반영")
  async headers() {
    return [
      {
        source: '/((?!_next/static|_next/image|favicon.ico).*)',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, must-revalidate' },
        ],
      },
    ]
  },
}
module.exports = nextConfig
