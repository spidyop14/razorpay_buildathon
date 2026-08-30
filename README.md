# Agentic Commerce Control Center

> **Razorpay Buildathon: AI Growth & Agentic Commerce Track**

Agentic Commerce is an end-to-end platform where AI acts as both the buyer and the growth engine for the merchant. However, because AI is non-deterministic, this project introduces a strict, deterministic **Policy Engine**. Every single financial action is explainable, bounded, gated, and fully auditable before any Razorpay transaction is initiated.

## 🎯 The Core Philosophy

AI proposes. Policy disposes.

We solved the "Agent-to-Agent Commerce" problem by ensuring that AI never touches money directly. The AI Buyer and Merchant Agent orchestrate intent, discovery, and offers, but all checkout processes are locked behind a deterministic rules engine that acts as the final gatekeeper.

## ✨ Key Features

- 🤖 **AI Buyer Agent**: Understands natural language intent, discovers products from the merchant's catalog, and negotiates the optimal bundle.
- 📈 **Merchant Growth Agent**: Dynamically identifies revenue opportunities (upsells, cross-sells) to maximize order value while maintaining healthy margins.
- 🛡️ **Deterministic Policy Engine (The Gate)**: A strict constraint checker that evaluates every proposed transaction (e.g., rejecting any order > ₹50,000) before allowing Razorpay Test Mode to trigger.
- 🧾 **Transparent Audit Trail**: Every action taken by the AI Buyer, the Merchant Agent, the Policy Engine, and Razorpay is recorded with its context, actor, amount, and result.
- ⚠️ **Graceful Failure Center**: When the AI attempts an out-of-policy transaction, the system gracefully catches the violation, explains the block to the user, and logs the incident without breaking the application.

## 🛠 Tech Stack

- **Frontend**: Next.js (App Router), React, Tailwind CSS, TypeScript
- **AI Integration**: Gemini AI (for intent extraction and offer preview generation)
- **Payments**: Razorpay APIs (Test Mode)
- **Icons**: Lucide React

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+)
- npm or pnpm
- Razorpay Test Account API Keys
- Google Gemini API Key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/spidyop14/razorpay_buildathon.git
   cd razorpay_buildathon
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   Copy `.env.example` to `.env.local` and fill in your keys:
   ```bash
   cp .env.example .env.local
   ```
   *Required variables: `NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `GEMINI_API_KEY`*

4. **Run the Development Server**
   ```bash
   npm run dev
   ```
   The application will be available at [http://localhost:3000](http://localhost:3000).

## 📖 Documentation

- [Architecture & System Design](ARCHITECTURE.md)
- [How to run the Demo (Success & Failure Flows)](DEMO_FLOW.md)

## 🤝 Contributing

This project was built for the Razorpay Buildathon. Feel free to explore the code, test the boundaries of the Policy Engine, and fork it for your own Agentic Commerce experiments.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
