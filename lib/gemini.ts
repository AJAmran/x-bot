/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import { RESTAURANT_DATA, MIN_ORDER_AMOUNT } from "./constants";
import { ChatMessage, Order, AIResponse, OrderAction } from "./types";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
const TIMEOUT_MS = 20000;

// Define the tool for ordering using the Type enum from the library
const manageOrderTool: FunctionDeclaration = {
    name: 'manage_order',
    description: 'Manage the user\'s order: add/remove items with notes, update customer details, or confirm the order.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            action: {
                type: Type.STRING,
                description: 'The action to perform: "add", "remove", "checkout", "update_info", "confirm", or "browse_menu".',
                enum: ['add', 'remove', 'checkout', 'update_info', 'confirm', 'browse_menu']
            },
            category_id: {
                type: Type.STRING,
                description: 'Category ID to open when action is "browse_menu" (e.g. "chinese", "beverages").'
            },
            subcategory_id: {
                type: Type.STRING,
                description: 'Subcategory ID to open (e.g., "soups", "grilled", "appetizers"). Use this for specific sections within a category.'
            },
            items: {
                type: Type.ARRAY,
                description: 'List of items to add or remove. Required for "add" and "remove" actions.',
                items: {
                    type: Type.OBJECT,
                    properties: {
                        item_code: {
                            type: Type.STRING,
                            description: 'The unique code of the menu item (e.g., "101", "221").'
                        },
                        quantity: {
                            type: Type.INTEGER,
                            description: 'Quantity of the item.'
                        },
                        notes: {
                            type: Type.STRING,
                            description: 'Special instructions, spice levels, or variations (e.g., "Less spicy", "No onions").'
                        }
                    },
                    required: ['item_code', 'quantity']
                }
            },
            customer_details: {
                type: Type.OBJECT,
                description: 'Customer information for the order. Required for "update_info" action.',
                properties: {
                    name: { type: Type.STRING, description: 'Customer full name' },
                    phone: { type: Type.STRING, description: 'Customer phone number' },
                    address: { type: Type.STRING, description: 'Delivery address (required for delivery)' },
                    delivery_type: { type: Type.STRING, enum: ['pickup', 'delivery'], description: 'Type of order' },
                    preferred_time: { type: Type.STRING, description: 'Preferred delivery/pickup time' }
                }
            }
        },
        required: ['action']
    }
};

const getSystemInstruction = (currentOrder: Order | null) => {
    const now = new Date();
    const day = now.toLocaleDateString('en-US', { weekday: 'long' });
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    // Serialize context
    const orderContext = currentOrder ? JSON.stringify({
        itemCount: currentOrder.items.length,
        subtotal: currentOrder.subtotal,
        items: currentOrder.items.map(i => `${i.quantity}x ${i.name} [Code: ${i.code}] ${i.specialInstructions ? `(Note: ${i.specialInstructions})` : ''}`),
        customerInfo: {
            name: currentOrder.customerInfo?.name || "Not provided",
            phone: currentOrder.customerInfo?.phone || "Not provided",
            deliveryType: currentOrder.customerInfo?.deliveryType || "pickup",
            address: currentOrder.customerInfo?.address || "Not provided"
        }
    }) : "Empty Cart";

    return `You are **SeasonBot**, the professional AI Head Waiter at **Four Season Restaurant** (Dhanmondi, Dhaka).

  **YOUR GOAL**: Provide a professional "Real-Life" 5-Star Dining Service. Follow a strict hospitality workflow.

  **CURRENT STATUS**:
  - Time: ${day}, ${time}
  - Cart: ${orderContext}
  - **DELIVERY RULES**: Minimum ৳1000 required. Service only within 5km from Satmasjid Road, Dhanmondi.
  - **PICKUP RULES**: No minimum.
  
  **ORDER COMPLETION CHECKLIST**:
  1. Items in Cart? ${currentOrder && currentOrder.items.length > 0 ? "✅" : "❌"}
  2. Customer Name/Phone? ${currentOrder?.customerInfo?.name && currentOrder?.customerInfo?.phone ? "✅" : "❌"}
  3. Delivery/Pickup? ${currentOrder?.customerInfo?.deliveryType ? `✅ (${currentOrder.customerInfo.deliveryType})` : "❌"}
  4. Address/Location? ${currentOrder?.customerInfo?.deliveryType === 'delivery' ? (currentOrder.customerInfo.locationVerified ? "✅" : "❌") : "N/A"}

  **MENU KNOWLEDGE (Items & Codes)**:
  ${JSON.stringify(RESTAURANT_DATA.menu)}

  **WORKFLOW & BEHAVIOR**:
  
  1.  **🛒 Adding Items**:
      - When an item is added, say "Added!" and strictly ask: "Sir/Ma'am, would you like anything else?".
      - Suggest a side dish or drink naturally (Upsell).

  2.  **📝 Permission to Place Order**:
      - When the user says they are done, ask: "Would you like to place the order now?".
      - If yes, proceed to the checkout view using the 'checkout' action.

  3.  **🚚 Information & Validation (The Check)**:
      - Collect Name and Mobile Number if missing.
      - **Mobile Validation**: Ensure the phone number is a valid Bangladeshi number (e.g., 017... or +8801...). If invalid, politely ask them to provide a correct 11-digit BD mobile number.
      - **Price Check**: If delivery is chosen and total is < ৳1000, explain: "Sir/Ma'am, we require a minimum order of ৳1000 for Home Delivery. Your current total is ৳${currentOrder?.subtotal || 0}. Would you like to add something else, or would you prefer to collect it as a Takeaway?"
      - **Location Check**: For delivery, open the map and explain: "Our delivery service is available within a 5km radius of Dhanmondi. Please pin your exact location on the map."

  4.  **✅ Final Confirmation**:
      - Once all checks (Price > 1000 for delivery, within 5km, Name, Phone) are passed, confirm the order using 'confirm'.

  **TONE**:
  - Always start with "Assalamu Alaikum" or a polite greeting.
  - Language: Strictly **English** unless the user speaks Bengali first.
  - Hospitality: Professional, high-end restaurant vibe. Use "Sir/Ma'am" and "Please/Thank you" appropriately.
  - Always reply with a text confirmation before or after using a tool.
  `;
};

/**
 * Executes a server-side AI call to Gemini with a timeout and specialized tool support.
 */
export async function getGeminiResponse(history: ChatMessage[], currentOrder: Order | null): Promise<AIResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const validHistory = history
            .filter(msg => msg.sender !== 'system')
            .slice(-10) // Reduced history size for performance
            .map(msg => ({
                role: msg.sender === 'user' ? 'user' : 'model',
                parts: [{ text: msg.content }],
            }));

        if (validHistory.length === 0) {
            return { text: "Assalamu Alaikum! How may I assist you with your dining today?" };
        }

        const modelResponse = await genAI.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: validHistory,
            config: {
                systemInstruction: getSystemInstruction(currentOrder),
                temperature: 0.5, // Slightly lower for more deterministic waiter behavior
                tools: [{ functionDeclarations: [manageOrderTool] }]
            }
        });

        clearTimeout(timeoutId);

        const textResponse = modelResponse.text || "";
        const functionCalls = modelResponse.functionCalls;

        let orderAction: OrderAction | undefined;

        if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];
            if (call.name === 'manage_order') {
                orderAction = call.args as unknown as OrderAction;
            }
        }

        // Auto-generate fallback text if tool is called without text
        let finalText = textResponse;
        if (orderAction && !finalText) {
            const map: Record<string, string> = {
                checkout: "Certainly, Sir/Ma'am. I am opening your billing summary for review. 📝",
                confirm: "Thank you! Your order has been confirmed and sent to our kitchen. 👨‍🍳",
                update_info: "I have updated your information. Thank you. ✍️",
                add: "Certainly, I've added that to your cart. Would you like anything else? 🛒",
                browse_menu: "Of course, I am opening our menu for you now. 📖"
            };
            finalText = map[orderAction.action] || "One moment please, I am processing that...";
        }

        return { text: finalText, orderAction };

    } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.error("Gemini AI request timed out");
            return { text: "I'm sorry, our system is responding slowly. Please try again in a moment." };
        }
        console.error("Gemini AI Error:", error);
        return { text: `I apologize, I'm having trouble connecting. Debug Error: ${error.message || JSON.stringify(error)}` };
    }
}
