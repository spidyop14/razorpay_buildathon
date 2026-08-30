# Demo Flow Guide

This document explains how to optimally demo the Agentic Commerce platform to showcase the "Bar" requirements for the Razorpay Buildathon: explainable AI actions, strict policy bounding, auditability, and graceful failure handling.

## Prerequisites
Ensure the app is running locally:
```bash
npm run dev
```
Navigate to [http://localhost:3000](http://localhost:3000).

---

## 🟢 Demo 1: The Success Flow (Under Limit)

**Goal**: Showcase the AI Buyer understanding intent, the Merchant Agent offering an upsell, the Policy Engine approving the transaction, and Razorpay completing the checkout.

1. **Navigate to the AI Buyer page** from the left sidebar.
2. Under "What are you looking for?", click the suggestion pill: **"Coding laptop under ₹50K"**.
3. Click **Start discovery**.
   - *Watch the Agent Activity panel animate through the steps of understanding intent and matching the catalog.*
4. In the "Top recommendations" section, click **Select product** on the top match (e.g., Raptor G14).
5. The UI will shift to the **AI-generated offer preview**. Notice how the agent automatically prepares a bundle (e.g., adding a mouse or warranty).
6. Click **Continue to approval** and then **Approve transaction** in the blue Policy check box. 
   - *This demonstrates the Policy Engine explicitly allowing the transaction because it is under the ₹50K hard limit.*
7. Click **Proceed to Payment**. The Razorpay Test Mode checkout will appear. Complete a dummy test payment.
8. **View the Audit Trail**: Navigate to the "Audit Trail" tab in the sidebar. You will see a transparent, time-stamped log of the AI parsing intent, the Policy Engine evaluating rules, and Razorpay successfully capturing the payment.

---

## 🔴 Demo 2: The Graceful Failure Flow (Over Limit)

**Goal**: Prove that the AI is strictly bounded and cannot execute financial actions outside of predetermined deterministic policies.

1. Navigate back to the **AI Buyer** page and click **Reset Demo** in the top right header.
2. Under "What are you looking for?", click the suggestion pill: **"Gaming setup under ₹80K"**.
3. Click **Start discovery**.
4. The AI will still do its job—it will successfully find and recommend high-end gaming laptops.
5. Click **Select product** on one of the expensive laptops (e.g., Nitro Forge 16 at ₹79,999).
6. Look at the **Policy Check** box. It will turn **Red**.
   - *Message: "Blocked by policy: Transaction exceeds maximum allowed limit (₹50,000)."*
   - Notice that the Razorpay checkout button is entirely disabled/hidden. The LLM cannot override this.
7. Navigate to the **Failure Center** in the sidebar. 
   - You will see this blocked attempt clearly logged, explaining the intercepted threat, proving the system handles out-of-bounds agent behavior safely and gracefully.
