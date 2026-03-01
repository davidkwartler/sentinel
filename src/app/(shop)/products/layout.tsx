import { auth } from "@/lib/auth"
import { CartProvider } from "@/components/CartProvider"
import { CartDrawer } from "@/components/CartDrawer"

export default async function ProductsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (session) {
    return (
      <CartProvider>
        <CartDrawer />
        {children}
      </CartProvider>
    )
  }

  return <>{children}</>
}
