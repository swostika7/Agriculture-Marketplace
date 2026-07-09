# Agriculture Marketplace

> **Final Year Project** · MERN + Socket.IO · Tailwind CSS · Bilingual · Cart · Reviews · Chat · Notifications

---


| # | Feature | Details |
|---|---------|---------|
| 1 | **Farmer View-Only** | Farmers can browse the marketplace but cannot add to cart or place orders. Own-product purchase also blocked at API level. |
| 2 | **Rating & Review System** | Consumers rate products (1–5 stars). Farmer and product avg ratings shown on cards. Farmer notified on new review. |
| 3 | **Cart System** | Full cart: add, update qty, remove, clear, checkout all items at once. Dedicated `/dashboard/cart` page. |
| 4 | **Bilingual (EN / नेपाली)** | Full English + Nepali translation via `LanguageContext`. Language switcher in sidebar and Profile → Language tab. Persisted in localStorage. |
| 5 | **Notification System** | Real-time via Socket.IO. Farmer notified on order placed; consumer notified on ship, deliver, cancel, review. Bell icon with unread badge in topbar. |
| 6 | **Real-time Chat** | Socket.IO-powered chat between farmer and consumer. Start chat from product detail modal. Conversation list, message history, typing, read receipts. |

---

##  Project Structure

```
agri-marketplace-v5/
├── server/
│   └── server.js          ← All backend (Cart, Review, Notification, Chat, Socket.IO)
│
└── client/src/
    ├── App.js             ← Routes + SocketProvider
    ├── context/
    │   ├── AuthContext.js
    │   ├── LanguageContext.js  ← Bilingual EN/NE translations
    │   └── SocketContext.js    ← Socket.IO client wrapper
    ├── components/
    │   ├── Layout.jsx          ← Notification bell, cart icon, language switcher
    │   ├── ConsumerMarketplace.jsx ← View-only for farmers, cart, chat, reviews
    │   ├── ReviewSection.jsx   ← Star rating + review form + review list
    │   └── … (all v4 components)
    └── pages/
        ├── CartPage.jsx    ← Full cart view + checkout
        ├── ChatPage.jsx    ← Real-time chat with conversations
        └── ProfilePage.jsx ← Language tab added
```

---

##  Quick Start

```bash
# Install everything
npm run install-all

# Seed database
cd server && node seed.js

# Run (server on :5000, client on :3000)
cd .. && npm run dev
```

| Role | Email | Password |
|------|-------|----------|
| Farmer | `hari@farm.np` | `password123` |
| Consumer | `anita@city.np` | `password123` |

---

## 🔌 New API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cart` | Get consumer's cart |
| POST | `/api/cart` | Add item to cart |
| PATCH | `/api/cart/:id` | Update quantity |
| DELETE | `/api/cart/:id` | Remove item |
| DELETE | `/api/cart` | Clear cart |
| POST | `/api/cart/checkout` | Checkout all cart items + notify farmers |
| GET | `/api/reviews/:productId` | Get product reviews |
| GET | `/api/reviews/farmer/:farmerId` | Get farmer reviews |
| POST | `/api/reviews` | Submit review (consumer only) |
| GET | `/api/notifications` | Get user notifications |
| PATCH | `/api/notifications/:id/read` | Mark read |
| PATCH | `/api/notifications/read-all` | Mark all read |
| GET | `/api/conversations` | Get all conversations |
| POST | `/api/conversations` | Start conversation |
| GET | `/api/conversations/:id/messages` | Get messages |
| POST | `/api/conversations/:id/messages` | Send message |

---

##  Notification Triggers

| Event | Who gets notified |
|-------|------------------|
| Order placed | Farmer |
| Order shipped (In-Transit) | Consumer |
| Order delivered | Consumer |
| Order cancelled | Consumer |
| New review | Farmer |
| New chat message | Other participant |

---

##  Chat Architecture

- **Socket.IO** rooms: `user_{id}` for personal notifications, `conv_{id}` for conversation messages
- REST fallback: `POST /api/conversations/:id/messages` for non-socket environments
- Optimistic message rendering for instant UX
- Unread count tracked per user per conversation

---

## Bilingual Support

Translations live in `src/context/LanguageContext.js`. Both languages cover:
- All navigation labels
- Marketplace UI (cart, buy, search, filter)
- Order statuses
- Chat, notifications, reviews
- Auth forms
- Profile & settings

Switch language: **Sidebar → Language toggle** or **Profile → Language tab**

---

*AgriConnect v5 © 2025 · Final Year CS Project · Nepal*
