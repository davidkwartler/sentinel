export { auth as proxy } from "@/lib/auth"

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - api/auth (Auth.js OAuth routes — must be public)
     * - login (sign-in page — must be public)
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)",
  ],
}
