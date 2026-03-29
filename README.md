# 🍽️ SeasonBot - Conversational Dining System

**SeasonBot** is a next-generation conversational agent designed for the **Four Season Restaurant**. It acts as a professional Head Waiter, capable of managing real-time orders, providing menu recommendations, and ensuring a 5-star digital hospitality experience.

Built with **Next.js 16**, **Tailwind CSS**, and powered by **Advanced Decision Engines**.

![Project Status](https://img.shields.io/badge/status-active-success.svg)
![Next.js](https://img.shields.io/badge/Next.js-16.1-black)
![TypeScript](https://img.shields.io/badge/TypeScript-蓝)
![Engine](https://img.shields.io/badge/Logic-SeasonCore-orange)

---

## ✨ Features

- **🤖 Conversational Ordering**
  - Natural language menu browsing and ordering.
  - Context-aware upselling (e.g., suggesting drinks with spicy food).
  - "Human-like" interactions with a professional waiter persona.

- **🛒 Smart Cart Management**
  - Add, remove, or modify items using voice or text.
  - Real-time subtotal calculation and cart validation.

- **🚚 Delivery & Pickup Logic**
  - **Delivery:** Enforces strictly defined delivery zones (5km radius from Dhanmondi) and minimum order value (৳1000).
  - **Pickup:** Seamless takeaway coordination.
  - **Location Validation:** Interactive map integration using Leaflet.

- **🎨 Premium UI/UX**
  - Glassmorphism design elements.
  - Fully responsive and mobile-optimized.
  - Smooth animations and transitions.

- **🔌 Embeddable Widget**
  - Dedicated `/embed` route for iframe integration into existing websites.

---

## 🛠️ Tech Stack

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router & Turbopack)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Logic Engine:** [Advanced Interaction Logic](https://nextjs.org/) (SeasonCore)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Maps:** [Leaflet](https://leafletjs.com/) & [React Leaflet](https://react-leaflet.js.org/)
- **State Management:** React Hooks & Local Storage

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18.17 or later
- A Google Gemini API Key

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/xbot-nextjs.git
   cd xbot-nextjs
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up Environment Variables:**
   Create a `.env.local` file in the root directory:
   ```env
   GEMINI_API_KEY=your_google_gemini_api_key_here
   ```

4. **Run the Development Server:**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

---

## 📂 Project Structure

```bash
├── app/
│   ├── layout.tsx      # Root layout (Fonts, SEO, Leaflet styles)
│   ├── page.tsx        # Main application entry
│   └── embed/          # Standalone chat widget page
├── components/
│   ├── ChatWidget.tsx  # Main chat interface
│   ├── OrderWizard.tsx # Order confirmation UI
│   └── ...
├── lib/
│   ├── engine.ts       # Logic & System Instructions
│   ├── constants.ts    # Restaurant Menu Data
│   └── types.ts        # TypeScript Interfaces
└── public/             # Static assets
```

---

## 🧠 System Architecture

The core logic resides in `lib/engine.ts`. We use a specialized **System Instruction** set to define the persona of "SeasonBot".

- **Logic Processing:** The agent utilizes the `manage_order` tool to programmatically manipulate the cart based on user intent.
- **Context Window:** Maintains a sliding window of the last 10 interactions to ensure relevant responses.
- **Safety & logic:**
  - Validates BD phone numbers (11 digits).
  - Enforces restaurant business rules (Time, Location, Minimums).

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
