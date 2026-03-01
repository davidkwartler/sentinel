import { CartProvider } from "@/components/CartProvider"
import { CartDrawer } from "@/components/CartDrawer"

export default function ProductsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <CartProvider>
      <CartDrawer />
      {children}
    </CartProvider>
  )
}
