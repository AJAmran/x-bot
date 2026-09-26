# 🍽️ x-bot / SeasonBot — Project Overview

> **Four Season Restaurant (Dhanmondi, Dhaka) এর জন্য Conversational Dining System**
> Next.js + TypeScript + Gemini AI দিয়ে তৈরি Head-Waiter Chatbot + Smart Ordering Widget

---

## 1. Project ki?

**Repo name:** `xbot-nextjs` (`E:\web\x-bot`)
**Brand name:** **SeasonBot v2.0 Core**
**Client:** Four Season Restaurant — House 59/A, Road 16/27, Satmasjid Road, Dhanmondi, Dhaka-1209. Sister concern of X-group. Est. 2007.
**Tagline:** "The Future of Conversational Dining."

User chat-e kotha bole menu dekhbe, cart-e add/remove korbe, pickup/delivery choose korbe, map-e location pin korbe, phone/name diye order confirm korbe — sob ekta floating widget er vitore.

2 ta entry point ache:
1. `/` → Landing page (hero section) + floating `ChatWidget`
2. `/embed` → Standalone full-screen widget, iframe diye onno website-e embed korar jonno

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | **Next.js 16.1.1** (App Router + Turbopack) |
| Language | **TypeScript 5** |
| UI | **React 19.2.3**, Tailwind CSS v4 (`@tailwindcss/postcss`), `clsx` + `tailwind-merge` |
| Font | `Outfit` (next/font/google) |
| Icons | `lucide-react` |
| Maps | **Leaflet 1.9.4 + React-Leaflet 5.0** (CDN CSS/JS in `layout.tsx`) |
| AI | **@google/genai 1.34.0**, model `gemini-2.5-flash` |
| State | React Hooks (`useCart`, `useChat`) + `localStorage` |
| Voice | Web Speech API (`webkitSpeechRecognition`, en-US) |
| Lint | ESLint 9 + `eslint-config-next` |
| Images | `images.unsplash.com` remotePatterns allowed |

Scripts (`package.json`):
```bash
npm run dev    # next dev
npm run build  # next build
npm run start  # next start
npm run lint   # eslint
```

Env:
```env
GEMINI_API_KEY=your_google_gemini_api_key_here  # .env.local
```

---

## 3. Folder Structure

```
x-bot/
├── app/
│   ├── layout.tsx      # Root layout, Outfit font, Leaflet CSS/JS, SEO metadata
│   ├── page.tsx        # Landing hero + <ChatWidget />
│   ├── embed/page.tsx  # <ChatWidget standalone initiallyOpen />
│   ├── globals.css     # Tailwind theme, brand colors, animations, scrollbar, map fixes
│   └── favicon.ico
├── components/
│   ├── ChatWidget.tsx  # MAIN: chat + menu + cart tabs, AI orchestration, voice
│   ├── ChatMessage.tsx # Single bubble renderer
│   ├── OrderWizard.tsx # 4-step order flow: menu → cart → checkout → success (~708 lines)
│   ├── ToastContainer.tsx
│   └── wizard/
│       ├── MenuItemCard.tsx  # Grid card + add button + qty badge
│       └── LocationMap.tsx   # Leaflet draggable pin + distance calc + reverse geocode
├── lib/
│   ├── engine.ts         # "use server" Gemini call + manage_order tool + system prompt
│   ├── chatService.ts    # Local fast intent parser (no API cost)
│   ├── constants.ts      # RESTAURANT_DATA (menu 150+ items), MIN_ORDER, MAX_RANGE
│   ├── types.ts          # Sob TypeScript interfaces
│   ├── storageService.ts # localStorage: chat (7 days) + order draft
│   └── hooks/
│       ├── useCart.ts    # currentOrder, totalItems, updateOrder, resetCart
│       └── useChat.ts    # messages, isLoading, addMessage, setFullHistory
├── public/             # Static assets
├── next.config.ts      # images.remotePatterns
├── tsconfig.json
└── README.md
```

---

## 4. System Architecture & Data Flow

```
User input (text/voice/quick-reply)
   ↓
ChatWidget.handleSend()
   ↓
① ChatService.checkStaticIntent() → match? → instant reply (0 API cost)
   │   checkout/cart, location/phone/hours, menu category/subcategory
   ↓ no match
② getLogicResponse(history[-10:], currentOrder) [server action, 20s timeout]
   │   systemInstruction + manage_order tool → gemini-2.5-flash (temp 0.5)
   ↓
AIResponse { text, orderAction? }
   ↓
processOrderAction(action):
  browse_menu → setTargetCategory/Sub → activeTab='menu' + auto-scroll
  checkout    → activeTab='cart'
  add         → menu lookup by code → cart merge + toast
  update_info → customerInfo merge
  confirm     → ORD-XXXXXXXXX generate → resetCart + success msg
   ↓
OrderWizard (visual cart/checkout) ↔ same currentOrder via onUpdateOrder (100ms debounce)
   ↓
Checkout validation pass → onSubmit(finalOrder) → success screen + chat order_update
   ↓
StorageService.saveChatSession() + saveOrderDraft() → localStorage persist
```

Context window: last **10 messages** only (system msg filtered out). Empty history hole greeting return kore.

Timeout: `AbortController` 20s → slow hole "system is responding slowly" message.

---

## 5. AI Engine (`lib/engine.ts`) — SeasonCore

**Persona:** "SeasonBot, professional Head Waiter at Four Season". Greeting `Assalamu Alaikum`. Strictly English unless user Bengali bole. Tone: Sir/Ma'am, Please/Thank you.

**SystemInstruction-e ja inject hoy (dynamic):**
- Current day + time
- Cart snapshot: itemCount, subtotal, items with code + notes, customerInfo
- Completion checklist ✅/❌: Items? Name/Phone? Delivery/Pickup? Address/Location?
- Full `RESTAURANT_DATA.menu` JSON (AI code diye item chine)
- Delivery rules: min ৳1000, 5km from Satmasjid Road
- Workflow: add → "Added! Would you like anything else?" + upsell, done → "Would you like to place the order now?" → checkout, validation → confirm

**Tool:** `manage_order` (FunctionDeclaration):
```ts
action: 'add' | 'remove' | 'checkout' | 'update_info' | 'confirm' | 'browse_menu'
items?: { item_code, quantity, notes? }[]
category_id?, subcategory_id?
customer_details?: { name, phone, address, delivery_type: pickup|delivery, preferred_time? }
```

Text empty + tool call thakle fallback map diye auto-text generate hoy (checkout/confirm/update_info/add/browse_menu).

---

## 6. Local Fast Path (`lib/chatService.ts`)

API call bachate regex/keyword matcher:

- `checkout|finish|bill|payment|cart|bag` → checkout action
- `location|address|where|phone|contact|call|hotline` → restaurant address + `01755636264`
- `hour|time|open|close|schedule` → season-wise lunch/dinner (Oct-Feb vs Mar-Sep auto detect)
- Category name match + (show/open/list/menu/browse/see ba short query) → `browse_menu` with `category_id`
- Subcategory match → `browse_menu` with `category_id + subcategory_id`
- `menu` exact → full menu open
- Fallback `getChatResponse()` → "Would you like to see the menu?"

---

## 7. OrderWizard (`components/OrderWizard.tsx`)

4-step stepper UI: `Menu → Review → Details → Finish`.

**Menu view:**
- Sticky search (`useDeferredValue` diye filter, name/desc/code match)
- Horizontal category pills (auto scrollIntoView), `minimum_order` banner (Bangla min 100 persons)
- Subcategory sections with `id=subcategory-{id}` → AI theke asle smooth scroll
- `MenuItemCard` grid 2-col, `totalItems>0` hole bottom floating "View Cart ৳subtotal"

**Cart/Review view:**
- Qty stepper (+/-), qty 1-e minus = delete, per-item notes input (`StickyNote`)
- Payment Summary: subtotal + delivery fee (akhon 0) + grand total
- Delivery Policy cards + `subtotal < 1000` hole amber "Delivery Notice"

**Checkout view:**
- Delivery/Pickup animated toggle (Bike/Store icons)
- Customer Profile: name + BD phone input
- Delivery hole: dark address textarea + `addressSuggestion` box + `LocationMap` + Location Intelligence card (distance, SECURED/RESTRICTED, coordinates, min-order error)
- Grand total dark card (45-60 MINS estimate) + big PLACE ORDER button (validation fail-e disabled + dynamic label: OUTSIDE ZONE / MIN REQUIRED)

**Validation (`handleCheckoutSubmit`):**
```ts
BD regex: /^(?:\+88|88)?(01[3-9]\d{8})$/
delivery hole: address required + locationVerified required + subtotal>=1000 + distance<=5km
```

**Success view:** dark celebratory screen, Order ID mono, total + service, Continue Chat button.

Props: `initialView, initialCategoryId/Sub, currentOrder, onUpdateOrder, onSubmit, onClose, showToast, isTabMode`. Parent sync 100ms debounce-e, init ekbar (`initializedRef`).

---

## 8. ChatWidget (`components/ChatWidget.tsx`)

- Floating button (brand-600 circle + ping + MessageSquare) → 420x720 glass card (`md:rounded-[2.5rem]`, `ring-8`), mobile-e full-screen. `standalone` hole full `h-full`.
- Header: Bot icon + "Four Season / Active Now" + close X. `ToastContainer` top-e.
- Tabs: `nav` Chat/Menu/Bag with `totalItems` badge (bounce animation).
- Chat tab: `flex-col-reverse` message list + typing skeleton + predefined quick replies (Opening Hours / Contact Info / Menu) + input bar (Mic/MicOff + Send). Enter-e send.
- Voice: `webkitSpeechRecognition`, `continuous:false`, transcript input-e append.
- Init: `StorageService.loadChatSession()` (7 din expiry) na thakle welcome msg; `loadOrderDraft()` thakle cart restore.
- `remove` action UI-te handle hoy na (akhon only add/checkout/update_info/confirm/browse_menu) — eta ekta gap.

`ChatMessage.tsx`: user (dark right) vs ai (white left) bubble, markdown-ish `**bold**` parse, order_update hole special card.

---

## 9. Menu & Business Data (`lib/constants.ts`)

- `MIN_ORDER_AMOUNT = 1000` (BDT, delivery only), `MAX_DELIVERY_RANGE = 5` (km), `generateOrderId() => ORD-XXXXXXXXX`
- Restaurant: lat `23.75150`, lng `90.36807` (Satmasjid Road), hours Oct-Feb lunch 12-15 dinner 18-22:30 / Mar-Sep lunch 12-15:30 dinner 18:30-22:30, services (Dine-in/Takeaway/foodbitebd/Catering/Corporate/Party), features, trade license.
- Menu categories:
  - `chinese` (sub: appetizers 101-122, grilled 139-145, main-dishes 146-193, fish 194-212, vegetable 213-220, rice-noodles 221-239, vegetarian 240-248, chef-special 249-254, soups 123-138)
  - `bangla` (flat items code 01-22, min 100 persons, Whole Mutton 12500 … Mineral Water 15)
  - `beverages` (351+ mocktail/mojito …)
- Item fields: `id, code, name, description, price, currency:BDT, tags[N/H/S/D/V/new], spice_level 0-4, prep_time, popular/best_seller/recommended, image, unit (per 100g/200g), serves, serving_size, type, cold`.

---

## 10. Types & Storage

`lib/types.ts`: `Restaurant, MenuItem, Subcategory, Category, Menu, Ordering, RestaurantData, ChatMessage (user|ai|system + text|menu_item|order_update|quick_reply|suggestion), CartItem, CustomerInfo (deliveryType, locationVerified, distance, lat/lng, addressSuggestion), Order (draft|pending|confirmed|preparing|ready|delivered + subtotal/deliveryFee/total + paymentStatus), OrderAction, AIResponse`.

`storageService.ts`: keys `fourseason_chat_v1`, `fourseason_order_draft`. Chat load-e 7 diner purono filter + timestamp revive. SSR-safe (`typeof window` check).

`useCart(null)`: order state + totals + reset/update. `useChat([])`: messages + loading + persistence helpers.

---

## 11. Styling (`globals.css`)

Tailwind v4 `@theme`: brand orange scale 50-900 (#fff7ed … #7c2d12), font Outfit, shadows glow/glass/premium, animations fadeIn/slideUp/scaleIn/bounceShort. Custom 4px scrollbar, `.no-scrollbar`, `.glass`, Leaflet container 100%x100%, `.user-marker-pulse`.

Landing `page.tsx`: radial gradient hero, "SeasonBot v2.0 Core" pill, giant "Future of Conversational Dining", 2 CTA (View Live Menu / Integration Guide — akhon non-functional buttons).

---

## 12. Known Gaps / Next Steps

1. `remove` tool action ChatWidget-e implement kora nai — AI remove bolleo cart theke delete hobe na.
2. Payment gateway nai (`paymentStatus: pending` fixed, COD dhore neya).
3. Order backend/DB nai — sudhu localStorage + UI success; kitchen-e jay na.
4. Landing CTA buttons dead, `/embed` iframe guide docs nai.
5. `category.items` vs `subcategories` dual shape — type guard fragile, duplicate code (`150/151/...` same code multiple items).
6. Leaflet CDN script async + `dynamic(ssr:false)` — offline hole map break.
7. Voice sudhu Chrome (`webkitSpeechRecognition`), Bangla voice support nai.
8. No auth, no order history page, no admin panel.

---

## 13. Kivabe chalabe

```bash
git clone <repo>
cd x-bot
npm install
# .env.local e GEMINI_API_KEY bosao
npm run dev
# http://localhost:3000  (main)
# http://localhost:3000/embed  (widget)
```

> Ei file ta auto-generated overview — code (`app/`, `components/`, `lib/`) pore banano. README.md er bodle / sathe rakhte paro.
