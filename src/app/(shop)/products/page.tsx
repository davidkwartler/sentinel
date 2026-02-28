const products = [
  {
    id: 1,
    name: "Wireless Headphones",
    price: 79.99,
    image: "🎧",
    category: "Electronics",
  },
  {
    id: 2,
    name: "Running Shoes",
    price: 129.99,
    image: "👟",
    category: "Footwear",
  },
  {
    id: 3,
    name: "Leather Backpack",
    price: 89.99,
    image: "🎒",
    category: "Accessories",
  },
  {
    id: 4,
    name: "Smart Watch",
    price: 199.99,
    image: "⌚",
    category: "Electronics",
  },
  {
    id: 5,
    name: "Coffee Maker",
    price: 49.99,
    image: "☕",
    category: "Home",
  },
  {
    id: 6,
    name: "Yoga Mat",
    price: 34.99,
    image: "🧘",
    category: "Fitness",
  },
  {
    id: 7,
    name: "Desk Lamp",
    price: 44.99,
    image: "💡",
    category: "Home",
  },
  {
    id: 8,
    name: "Sunglasses",
    price: 59.99,
    image: "🕶️",
    category: "Accessories",
  },
]

export default function ProductsPage() {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-gray-900">Products</h1>
      <p className="mb-6 text-sm text-gray-500">
        Browse our collection — mock data for demo purposes.
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => (
          <div
            key={product.id}
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-3 flex h-24 items-center justify-center rounded-md bg-gray-50 text-4xl">
              {product.image}
            </div>
            <p className="text-xs text-gray-400">{product.category}</p>
            <p className="text-sm font-medium text-gray-900">{product.name}</p>
            <p className="mt-1 text-sm font-semibold text-gray-700">
              ${product.price.toFixed(2)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
