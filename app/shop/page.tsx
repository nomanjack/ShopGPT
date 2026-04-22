import type { Metadata } from 'next'
import Shop from '@/components/shop/shop'

export const metadata: Metadata = {
  title: 'shop',
  description: 'ShopGPT - Conversational E-commerce',
}

export default function Page() {
  return <Shop />
}
