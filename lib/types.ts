
export interface Contact {
    phone: string;
    email: string;
    address: string;
}

export interface Coordinates {
    lat: number;
    lng: number;
}

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

export interface Category {
    id: string;
    name: string;
    description: string;
    icon: string;
    minimum_order?: number;
    minimum_order_unit?: string;
    subcategories?: Subcategory[];
    items?: MenuItem[];
}

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
    deliveryType: 'pickup' | 'delivery';
    preferredTime?: string;
    notes?: string;
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
    paymentMethod?: string;
    paymentStatus: 'pending' | 'paid' | 'failed';
}

export interface ChatState {
    messages: ChatMessage[];
    currentOrder: Order | null;
}

// AI Tool Types
export interface OrderToolItem {
    item_code: string;
    quantity: number;
    notes?: string;
}

export interface OrderAction {
    action: 'add' | 'remove' | 'checkout' | 'update_info' | 'confirm' | 'browse_menu';
    items?: OrderToolItem[];
    category_id?: string;
    subcategory_id?: string;
    customer_details?: {
        name?: string;
        phone?: string;
        address?: string;
        delivery_type?: 'pickup' | 'delivery';
        preferred_time?: string;
    };
}

export interface AIResponse {
    text: string;
    orderAction?: OrderAction;
}
