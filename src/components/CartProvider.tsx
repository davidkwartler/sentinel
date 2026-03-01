"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"

export type CartItem = {
  id: number
  name: string
  price: number
  image: string
  qty: number
}

type CartContextValue = {
  items: CartItem[]
  totalItems: number
  totalPrice: number
  addItem: (product: { id: number; name: string; price: number; image: string }) => void
  updateQty: (id: number, qty: number) => void
  removeItem: (id: number) => void
  clearCart: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error("useCart must be used within CartProvider")
  return ctx
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])

  const addItem = useCallback(
    (product: { id: number; name: string; price: number; image: string }) => {
      setItems((prev) => {
        const existing = prev.find((i) => i.id === product.id)
        if (existing) {
          return prev.map((i) =>
            i.id === product.id ? { ...i, qty: i.qty + 1 } : i,
          )
        }
        return [...prev, { ...product, qty: 1 }]
      })
    },
    [],
  )

  const updateQty = useCallback((id: number, qty: number) => {
    if (qty <= 0) {
      setItems((prev) => prev.filter((i) => i.id !== id))
    } else {
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, qty } : i)),
      )
    }
  }, [])

  const removeItem = useCallback((id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const clearCart = useCallback(() => setItems([]), [])

  const totalItems = items.reduce((sum, i) => sum + i.qty, 0)
  const totalPrice = items.reduce((sum, i) => sum + i.price * i.qty, 0)

  return (
    <CartContext.Provider
      value={{ items, totalItems, totalPrice, addItem, updateQty, removeItem, clearCart }}
    >
      {children}
    </CartContext.Provider>
  )
}
