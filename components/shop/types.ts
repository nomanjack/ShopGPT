export type Tile = {
  id: string
  headline: string
  titleTail: string
  brand: string
  price: string
  rating: number
  reviewCount: number
  description: string
  specs: string[]
  moodColor: string
  image?: string | null
}

export type CartLine = {
  tile: Tile
  qty: number
}

export type RecentOrder = {
  id: string
  brand: string
  product: string
  date: string
  color: string
  price: string
  status: 'processing' | 'shipped' | 'delivered'
  placed: string
  carrier?: string
  tracking?: string
  eta?: string
  deliveredOn?: string
  card: string
  shipTo: string
}
