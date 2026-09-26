
export interface Contact {
    phone: string;
    email: string;
    address: string;
}

export interface Coordinates {
    lat: number;
    lng: number;
}

export type DeliveryType = 'pickup' | 'delivery';

export interface HoursDetails {
    lunch: string;
    dinner: string;
}

export interface Hours {
    open_days: string[];
    season_oct_feb: HoursDetails;
    season_mar_sep: HoursDetails;
}

export interface Restaurant {
    id: string;
    name: string;
    description: string;
    slogan: string;
    contact: Contact;
    location: Coordinates;
    hours: Hours;
    services: string[];
    features: string[];
    additional_info: {
        established: string;
        trade_license: string;
        online_platform: string;
    };
}

export interface MenuItem {
    id: string;
    code: string;
    name: string;
    description: string;
    price: number;
    currency: string;
    tags: string[];
    spice_level?: number;
    prep_time?: number;
    popular?: boolean;
    recommended?: boolean;
    best_seller?: boolean;
    image?: string | null;
    serving_size?: string;
    serves?: number;
    type?: string;
    cold?: boolean;
    unit?: string;
}

export interface Subcategory {
    id: string;
    name: string;
    items: MenuItem[];
}

interface CategoryBase {
    id: string;
    name: string;
    description: string;
    icon: string;
    /** e.g. Bangla catering is only served for groups of 100+. */
    minimum_order?: number;
    minimum_order_unit?: string;
}

/**
 * Categories are one of two shapes, and modelling that as two optional fields made
 * `{ items: undefined, subcategories: undefined }` representable — so every consumer
 * hand-rolled the same nested walk with optional chaining. The `kind` discriminator makes
 * the invalid state impossible and lets TypeScript narrow without a runtime guard.
 */
export interface FlatCategory extends CategoryBase {
    kind: 'flat';
    items: MenuItem[];
}

export interface NestedCategory extends CategoryBase {
    kind: 'nested';
    subcategories: Subcategory[];
}

export type Category = FlatCategory | NestedCategory;

export interface Menu {
    categories: Category[];
    tags_legend: Record<string, string>;
    spice_levels: Record<string, string>;
}

export interface OrderingProcess {
    minimum_order_amount: number;
    delivery_available: boolean;
    takeaway_available: boolean;
    dine_in_available: boolean;
    online_ordering_platform: string;
    payment_methods: string[];
    order_steps: string[];
}

export interface DeliveryInfo {
    radius: string;
    delivery_time: string;
    delivery_charge: string;
}

export interface Ordering {
    process: OrderingProcess;
    delivery: DeliveryInfo;
}

export interface RestaurantData {
    restaurant: Restaurant;
    menu: Menu;
    ordering: Ordering;
}

// Chat & App State Types
export interface ChatMessage {
    id: string;
    content: string;
    sender: 'user' | 'ai' | 'system';
    timestamp: Date;
    type: 'text' | 'menu_item' | 'order_update' | 'quick_reply' | 'suggestion';
    metadata?: {
        itemCode?: string;
        category?: string;
        price?: number;
        orderId?: string;
        suggestedItems?: string[];
    };
}

export interface CartItem {
    id: string;
    code: string;
    name: string;
    quantity: number;
    price: number;
    specialInstructions?: string;
    total: number;
}

export interface CustomerInfo {
    name: string;
    phone: string;
    email?: string;
    address?: string;
    deliveryType: DeliveryType;
    preferredTime?: string;
    notes?: string;
    /**
     * Discrete facts the guest has told us this session — "allergic to peanuts",
     * "prefers well done", "regular: grilled chicken". Collected by the model and fed back
     * into every later turn, so the waiter remembers instead of asking twice.
     */
    preferences?: string[];
    locationVerified?: boolean;
    distance?: number;
    lat?: number;
    lng?: number;
    addressSuggestion?: string;
}

export interface Order {
    id: string;
    items: CartItem[];
    customerInfo?: CustomerInfo;
    status: 'draft' | 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered';
    subtotal: number;
    deliveryFee: number;
    total: number;
    createdAt: Date;
    estimatedReadyTime?: Date;
    paymentMethod?: PaymentMethod;
    /** Fake authorisation code from the simulated gateway. */
    paymentReference?: string;
    paymentStatus: 'pending' | 'paid' | 'failed';
}

export interface ChatState {
    messages: ChatMessage[];
    currentOrder: Order | null;
}

// AI Tool Types
export interface OrderToolItem {
    item_code: string;
    /** Required for `add`; ignored for `set_notes`; omit for `remove` to drop the whole line. */
    quantity?: number;
    notes?: string;
}

export type OrderActionName =
    | 'add'
    | 'remove'
    | 'set_quantity'
    | 'set_notes'
    | 'checkout'
    | 'update_info'
    | 'confirm'
    | 'browse_menu';

export interface OrderAction {
    action: OrderActionName;
    items?: OrderToolItem[];
    category_id?: string;
    subcategory_id?: string;
    customer_details?: {
        name?: string;
        phone?: string;
        address?: string;
        delivery_type?: DeliveryType;
        preferred_time?: string;
        /** New facts worth remembering for the rest of the conversation. */
        preferences?: string[];
    };
}

export interface AIResponse {
    text: string;
    orderAction?: OrderAction;
    meta?: AIResponseMeta;
}

// ---------------------------------------------------------------------------
// Engine error channel — lets the UI tell "the waiter said this" apart from
// "the model could not be reached", which is the difference between a charming
// bot and a broken demo.
// ---------------------------------------------------------------------------

export type EngineErrorCode =
    /** No GEMINI_API_KEY configured — the widget runs in demo mode. */
    | 'missing_api_key'
    /** Our own limiter said no, or Gemini replied 429. */
    | 'rate_limited'
    /** The call exceeded our request budget. */
    | 'timeout'
    /** Gemini returned 5xx or the network failed. */
    | 'upstream'
    | 'unknown';

export interface EngineError {
    code: EngineErrorCode;
    /** User-facing copy in the waiter's voice. Safe to render directly. */
    message: string;
    /** Present for rate_limited — how long the caller should wait. */
    retryAfterSeconds?: number;
    /**
     * True when the failure only affects conversation, not ordering: the menu, cart,
     * map and checkout all keep working. Drives the "AI unavailable" banner.
     */
    degraded: boolean;
}

export interface AIResponseMeta {
    /** Where the reply came from — shown in the dev observability panel. */
    source: 'model' | 'local' | 'fallback';
    /** False in demo mode. The client uses this for the availability banner. */
    aiAvailable: boolean;
    error?: EngineError;
    /** Wall-clock duration of the model call. */
    latencyMs?: number;
    /** A tool call the server refused to forward (e.g. an invalid `confirm`). */
    blockedAction?: string;
}

// ---------------------------------------------------------------------------
// Order domain (lib/order.ts) — the single source of truth for order maths
// and business rules. Declared here to follow the project's types.ts convention.
// ---------------------------------------------------------------------------

export interface OrderTotals {
    subtotal: number;
    deliveryFee: number;
    total: number;
    /** Sum of quantities, not the number of distinct lines. */
    totalItems: number;
    /** Delivery only — pickup has no minimum. */
    isMinOrderMet: boolean;
    /**
     * UI-only leniency: an unknown distance is not yet a violation, so the map can be
     * skipped while the user is still filling in the form. `validateOrder` is the
     * strict gate and does NOT accept an unknown distance for delivery.
     */
    isDistanceValid: boolean;
    /** How much more is needed to qualify for delivery (0 once reached). */
    amountToMinOrder: number;
}

export type OrderValidationCode =
    | 'empty_cart'
    | 'invalid_items'
    | 'missing_name'
    | 'missing_phone'
    | 'invalid_phone'
    | 'missing_address'
    | 'location_unverified'
    | 'below_minimum_order'
    | 'outside_delivery_zone';

export interface OrderValidationIssue {
    code: OrderValidationCode;
    /** Canonical, user-facing copy — shared by the UI toast and the model-facing reply. */
    message: string;
}

export type OrderValidationResult =
    | { valid: true; issues: readonly [] }
    | { valid: false; issues: readonly [OrderValidationIssue, ...OrderValidationIssue[]] };

// ---------------------------------------------------------------------------
// Payment (simulated — see README "Known Limitations")
// ---------------------------------------------------------------------------

export type PaymentMethod = 'cod' | 'card' | 'mobile_banking';

export interface PaymentMethodOption {
    id: PaymentMethod;
    label: string;
    /** One line explaining what happens with this method. */
    blurb: string;
    /** Key for the icon, so config stays free of React/lucide imports. */
    icon: 'cash' | 'card' | 'wallet';
}

/** Everything the mock checkout collects. Nothing here is ever sent anywhere. */
export interface PaymentDetails {
    cardNumber?: string;
    /** MM/YY */
    expiry?: string;
    cvc?: string;
    /** Bangladeshi mobile wallet number. */
    walletNumber?: string;
}

export type PaymentValidationCode =
    | 'card_number_invalid'
    | 'card_expiry_invalid'
    | 'card_cvc_invalid'
    | 'wallet_number_invalid';

export interface PaymentValidationIssue {
    code: PaymentValidationCode;
    message: string;
}

export type PaymentValidationResult =
    | { valid: true; issues: readonly [] }
    | { valid: false; issues: readonly [PaymentValidationIssue, ...PaymentValidationIssue[]] };
