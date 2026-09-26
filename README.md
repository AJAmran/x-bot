# 🍽️ SeasonBot — Conversational Dining System

**An AI head-waiter for a real restaurant.** A customer opens a chat, asks for *"two grilled chicken and a cold drink"*, and gets a validated order with delivery eligibility, a payment step and a receipt — or a floating widget embedded in someone else's website.

Built for **Four Season Restaurant, Dhanmondi, Dhaka** (X-group). Next.js 16 · React 19 · TypeScript (strict) · Gemini 2.5 Flash tool-calling · Leaflet · Tailwind v4.

[![Next.js](https://img.shields.io/badge/Next.js-16.1-000000?style=flat-square&logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19.2-087ea4?style=flat-square&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Tailwind](https://img.shields.io/badge/Tailwind-v4-06b6d4?style=flat-square&logo=tailwindcss)](https://tailwindcss.com)
[![Vitest](https://img.shields.io/badge/tests-231%20passing-brightgreen?style=flat-square&logo=vitest)](https://vitest.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-f59e0b?style=flat-square)](LICENSE)

<p align="center">
  <img src="docs/landing.svg" alt="SeasonBot landing page with the chat widget open" width="900">
</p>

> `docs/landing.svg` and `docs/delivery-map.svg` are **placeholders**. Replace them with real
> screenshots (or a 45-second Loom) before sharing — see [Adding media](#adding-media).

---

## The problem

Small restaurants take orders over the phone. That means missed calls during the dinner rush,
people quoting card numbers aloud, and staff repeating the same questions — *"what's your
number? where are you? are you sure you can eat that?"* — on every single order.

A chatbot is the obvious answer, and most restaurant chatbots are bad: they can't add anything
to a basket, they ignore the delivery radius, and they cheerfully "confirm" an order the kitchen
can't fulfil. **The interesting part of this project is not the chat — it's everything that has
to be true before the chat is allowed to confirm an order.**

---

## What makes it interesting

**1. The model gets six verbs and a validation layer, not the keys to the kingdom.**
The AI can only express intent through one `manage_order` tool. Everything it emits is parsed
and repaired server-side before a single line changes: a hallucinated item code is dropped and
reported back to the customer, a negative quantity is clamped, and an invented category falls
back to the full menu instead of rendering a blank tab. The model is treated as an **untrusted
input source** — see [`lib/toolArgs.ts`](lib/toolArgs.ts).

**2. The server owns the business rules, so a prompt injection cannot place an invalid order.**
The model asking to `confirm` is a *request*, not a command. The order is re-validated on the
server with the same pure function the checkout form uses ([`lib/order.ts`](lib/order.ts)) — and
because `locationVerified` is only ever set by the map, a guest cannot talk their way past the
5 km delivery radius with a convincing sentence.

**3. Recommendations that cost nothing.**
A conventional implementation asks the LLM "what goes with this?" on every basket change — the
single most frequent AI call in an ordering flow. [`lib/recommend.ts`](lib/recommend.ts) does it
deterministically instead: pair a cold drink with a spicy main, prioritise the *"৳660 more and
delivery is on us"* nudge, never suggest something already ordered, and never suggest prawn to
a guest who said they're allergic. **Zero API calls, instant, testable** — and it keeps working
in demo mode with no API key.

**4. It degrades instead of breaking.**
No API key, an exhausted quota, a 429, a timeout, a missing menu item — each is a distinct,
typed error surfaced through `AIResponse.meta`. A visitor without a key gets a fully working menu,
cart, map, checkout and payment with a labelled "AI temporarily unavailable" banner. **The demo
degrades; it never white-screens.**

**5. It gives the keys back on close.**
Focus returns to the button that opened the widget. Escape walks out. The chat log is an ARIA
live region, pinch-zoom is not disabled, and `prefers-reduced-motion` is respected. A widget
embedded in a third-party iframe does *not* steal focus on load.

---

## Architecture

```mermaid
flowchart TD
    subgraph client["Client — React 19"]
        CW["ChatWidget<br/><i>chat · menu · bag tabs</i>"]
        OW["OrderWizard<br/><i>menu → review → details → pay → done</i>"]
        LM["LocationMap<br/><i>react-leaflet</i>"]
        CS["ChatService<br/><i>local intent layer</i>"]
        RC["recommend<br/><i>cart-aware suggestions</i>"]
    end

    subgraph pure["Pure domain — no React, no I/O"]
        ORD["lib/order.ts<br/><i>totals · validateOrder<br/>validatePaymentDetails</i>"]
        TOOL["lib/toolArgs.ts<br/><i>parses model output</i>"]
        IDX["lib/menuIndex.ts<br/><i>code→item · integrity</i>"]
    end

    subgraph server["Server — Next.js server actions"]
        ENG["lib/engine.ts<br/><i>Gemini + system instruction</i>"]
        RL["lib/rateLimit.ts<br/><i>token buckets</i>"]
        GEO["lib/geocode.ts<br/><i>Nominatim proxy</i>"]
    end

    CW -->|"menu, cart, checkout"| ORD
    CW --> CS
    CW --> RC
    RC --> IDX
    OW --> ORD
    OW --> LM
    OW --> IDX
    CS -->|"confident?"| CW
    CS -.->|"otherwise"| ENG
    CW -->|"getLogicResponse()"| ENG
    ENG --> TOOL
    ENG --> ORD
    ENG --> RL
    ENG --> IDX
    LM -->|"reverseGeocode()"| GEO
    ENG -.->|"1 model call<br/>per message"| GEMINI[("Gemini 2.5 Flash")]
    GEO -.->|"1 req/s + cache"| OSM[("OpenStreetMap Nominatim")]
    LM --> OSM
    ORD --> STORE[("localStorage<br/><i>cart · chat · history</i>")]
```

**Data flow for one message:**

```
guest message
  → ChatService.checkStaticIntent()      confident? → instant reply, 0 API calls
  → getLogicResponse()  [server action]
       → rate limiter (per client / per instance / daily budget)
       → Gemini: system instruction (menu + cart + remembered preferences) + tool schema
       → parseManageOrderArgs()           drop / clamp / repair the model's request
       → validateOrder()                  refuse an invalid `confirm`, ask for what is missing
  → processOrderAction()                  apply to the cart, toast, suggest
  → suggestForCart()                      local, deterministic, free
```

### Project layout

```
lib/                     the domain — all pure, all tested
  order.ts               totals, business rules, payment validation (Luhn, expiry)
  toolArgs.ts            runtime validation of model output
  engine.ts              Gemini call, system instruction, confirm gate  ["use server"]
  rateLimit.ts           in-memory token buckets
  recommend.ts           cart-aware suggestions
  menuIndex.ts           code→item index, menu integrity checks
  chatService.ts         local intent layer + reorder
  geocode.ts             Nominatim proxy (throttled + cached)          ["use server"]
  constants.ts           restaurant + menu data, business rules
  types.ts               every interface
  hooks/                 useCart · useChat · useFocusTrap
components/
  ChatWidget.tsx         the shell: 3 tabs, voice, suggestions, a11y
  OrderWizard.tsx        the 5-step order flow
  wizard/                MenuItemCard · LocationMap
app/
  page.tsx               landing (server component) + floating widget
  embed/page.tsx         full-screen widget for iframe embedding
  error.tsx              route error boundary
  global-error.tsx       last-resort boundary
public/embed.js          drop-in script for third-party sites
types/webspeech.d.ts     minimal Web Speech API typings
```

---

## Getting started

**Requirements:** Node.js **>= 20.9** (Next.js 16's own minimum) and a Gemini API key — or neither, see below.

```bash
git clone https://github.com/AJAmran/x-bot.git
cd x-bot
npm install
cp .env.example .env.local     # add your GEMINI_API_KEY (optional)
npm run dev                    # http://localhost:3000
```

| Route | What it is |
|---|---|
| `/` | Landing page with the floating chat widget |
| `/embed` | Full-screen widget, designed to be iframed |

### Embedding it on another site

```html
<script src="https://your-domain.com/embed.js"></script>
```

`public/embed.js` injects a floating trigger and a 420×720 iframe. For a demo without any
server work, also available: open `/embed` directly in a tab.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint — currently **0 errors, 0 warnings** |
| `npm run typecheck` | `tsc --noEmit` — **0 errors** under `strict` |
| `npm test` | Vitest — **231 tests, ~0.4 s** |

**No API key? The app still works.** Menu, cart, map, checkout, payment, the local intent layer
and cart-aware suggestions all run. Only the conversational waiter is unavailable, and the chat
says so. This is deliberate: it makes the deployed demo safe to share without leaking a key.

---

## Accessibility

Not an afterthought — the widget is a keyboard-and-screen-reader-first surface.

- Chat log is a `role="log"` **live region**, so replies are actually announced
- Real `tablist` / `tab` / `tabpanel` semantics with a roving tabindex
- A visible `:focus-visible` ring on every interactive element
- Focus moves into the panel on open and **returns to the opener** on close; Escape walks out
- Pinch-zoom is **not** disabled (the original `userScalable: false` was a WCAG 2.1 AA failure)
- `prefers-reduced-motion` neutralises every ping / pulse / bounce / scale animation
- 9px micro-labels were failing contrast at ~2.6:1; they now pass AA
- Icon-only controls have accessible names; the order-reference copy control is a real `<button>`
- The iframe embed does not steal focus from the host page

---

## Project decisions worth defending

**Pure domain, thin components.** Every rule that matters — totals, minimums, radius, phone
format, Luhn, model-output validation — lives in `lib/` with no React and no I/O. That is why the
suite is 231 tests in under half a second with **no jsdom and no testing library**, and why the
same function can gate a form submission and a server action.

**Fail loudly on bad data.** Duplicate item codes silently made nine dishes unorderable and merged
others into one basket line. That is fixed *and* guarded: `findDuplicateCodes()` is asserted empty
in the test suite so it cannot regress.

**Cheap wins that are actually load-bearing.** A local intent layer absorbs navigation questions
before they cost an API call; `mentionsMenuItem()` decides "is this an order?" from the menu data
rather than keyword lists, which is what stopped the bot answering *"time to order the sizzling
beef"* with opening hours.

**One number, one place.** The delivery minimum, radius, fee and method list are declared once in
[`lib/constants.ts`](lib/constants.ts) and interpolated into the system instruction, the checkout
copy and the validation logic — so the waiter, the UI and the model cannot disagree.

---

## Known limitations & roadmap

Stated plainly, because a demo that pretends to be production reads worse than one that doesn't.

### Deliberately out of scope
- **No backend or database.** Orders, the chat transcript and order history live in
  `localStorage`, so "confirmed" means confirmed *on this device*. There is no kitchen queue.
  *Next:* Postgres + Prisma, a server action to persist, and a webhook into the existing
  `foodbitebd` ordering platform.
- **Payment is simulated.** No PSP is connected. Card details are validated with real rules
  (Luhn, expiry, CVC) in the browser and the order is marked paid after a fixed 1.2 s delay.
  **A production version must authorise server-side and only mark paid on a real gateway
  response** — a client-side "paid" flag is not a security boundary. Labelled as simulated in the
  UI, on the receipt, and in `PAYMENT_SIMULATED_NOTICE`.
- **No authentication, no admin panel.** *Next:* magic-link auth and a read-only `/admin` kitchen
  view over real orders.
- **Allergen handling is partial.** The menu carries only `S / N / H / V / D` tags, so a stated
  allergy is honoured against those (`recommend.ts` maps "allergic to prawns" → skip `S`). There is
  no full allergen or cross-contamination matrix, so **do not rely on this for a real allergy**.
  *Next:* an allergen table per dish, and a hard block at checkout rather than a filtered suggestion.

### Free-tier constraints this was designed around
- **Gemini free tier is the binding limit.** Google's docs publish the *mechanism* (per-project
  RPM / input-TPM / RPD, 429 on breach) but not a static per-model table — check your own quota in
  **AI Studio → Rate Limit page**. `RATE_LIMITS` in [`lib/rateLimit.ts`](lib/rateLimit.ts) is set
  from a secondary source (≈10 RPM / 250 RPD) and its daily budget (180) is deliberately *below*
  that, so the app degrades before Google starts returning 429s to visitors. **Tune these three
  numbers to your real quota.**
- **The prompt is large.** The full 239-item menu is ~51 KB ≈ **13,000 tokens on every call**.
  Gemini **context caching is not available on the free tier**, so the only lever is sending less:
  dropping descriptions cuts it to ~34 KB (−49%) at the cost of menu Q&A quality. *Next:* a compact
  code/price digest for turns that do not need descriptions.
- **Request cancelling is client-side only.** `AbortController` stops us waiting, but Google
  still processes the request, so a timed-out call can still consume quota. Budgeted for.
- **`GEMINI_API_KEY` is read at build time** because the pages are statically prerendered. Change
  it on Vercel and you must **redeploy**, not just restart.
- **The rate limiter is in-memory**, so it is per-instance and resets on cold start. It stops one
  visitor hammering the endpoint (Next.js already blocks cross-origin server actions); it is not a
  distributed quota. *Next, only if traffic justifies it:* Upstash Redis or Vercel KV.
- **OpenStreetMap tile policy.** Their public tile server is fine at demo scale but is not for
  real traffic, and the geocoding proxy is capped at 1 req/s with a 10-minute cache as their policy
  requires. *Next if it grows:* a self-hosted tile style or a keyed provider.

### Smaller things
- Voice input is **Chromium-only** (Web Speech API). The mic is feature-detected and disabled with
  an explanation elsewhere.
- `embed.js` targets desktop and mobile but does not yet post height back to the host page, so an
  iframe embed cannot auto-resize. It also uses a same-origin assumption for the widget URL.
- The beverage menu contains five dishes listed twice at different prices (`365`/`902` and
  friends) — a data issue in the source menu, not deduplicated here because choosing a price is the
  restaurant's call.
- **Nine item codes were changed** (`150`–`158` were each shared by two different dishes; variants
  are now `150a`…`158a`). This is a data correction and should be **confirmed with the restaurant**
  before this reaches their POS.

---

## Free services this project depends on

Every one of these is free at portfolio-demo scale, with no card and no paid add-ons.

| Service | Used for | Free tier / limit | Risk at demo scale |
|---|---|---|---|
| **Vercel Hobby** | Hosting, server actions, image optimisation | 1M edge requests/mo; functions max 300 s (our model budget is 20 s) | None — a few dozen visitors/day is far below |
| **Google Gemini API** | The conversational waiter | Free tier, per-project RPM/TPM/RPD. **Verify your quota in AI Studio** | ⚠️ The real constraint — handled by the limiter, the local intent layer, and demo mode |
| **OpenStreetMap tiles** | Map tiles | Free, fair-use policy, no SLA | Low — a demo is not "meaningful" traffic |
| **Nominatim** | Reverse geocoding | Free, **max 1 req/s**, requires an identifying User-Agent | Low — proxied server-side, throttled and cached |
| **Google Fonts** (Outfit) | UI typeface | `next/font` self-hosts at build time — **no runtime calls to Google** | None |
| **Unsplash** | ~10 menu photos | Free, hot-linked through the Vercel image optimiser | None |
| **GitHub Actions** | CI (lint + typecheck + test + build) | Free on public repos, 2,000 min/mo | None |

No paid database, no Redis, no error-tracking service, no paid fonts, no monitoring SaaS.

---

## Testing

```
npm test        # 231 tests across 7 files, ~0.4s, node environment
```

The suite covers the parts that would actually hurt if they broke: BD phone formats, the ৳1000
delivery minimum, the 5 km radius at its exact boundary, tampered totals, hostile model output
(negative quantities, invented codes, `[[[[[1]]]]]`), the local intent boundary between navigation
and ordering, Luhn, the rate limiter's refill and daily reset, and the recommendation rules
including dietary filtering.

It is mutation-checked: changing the radius comparison from `>` to `>=` fails the suite.

---

## Accessibility & performance notes

See [Accessibility](#accessibility) above. On performance: the menu index, the distinctive-token
set and the menu prompt payload are each built **once per module load** rather than per render;
menu search is wrapped in `useDeferredValue`; the wizard and the map are dynamically imported with
`ssr: false`; and the client bundle contains no `any` and no abandoned dependencies.

---

## Contributing

Issues and PRs welcome. Please run `npm run lint && npm run typecheck && npm test` first — CI
runs the same three gates plus a production build.

## License

[MIT](LICENSE) © 2026 AJAmran

---

### Adding media

1. Record a short Loom of: opening the widget → ordering conversation → a suggestion chip →
   the delivery map with a pinned location → the payment step.
2. Replace `docs/landing.svg` and `docs/delivery-map.svg` with real screenshots (keep the same
   filenames, or update the paths in this README).
3. Drop the Loom link at the top, above the placeholder image.
