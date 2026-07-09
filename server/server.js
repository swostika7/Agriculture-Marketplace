
require('dotenv').config();

/* ── Startup config check ── */
(function checkConfig() {
  const warn = (k, hint) => console.warn(`⚠️  ${k} not set — ${hint}`);
  if (!process.env.SMTP_USER || process.env.SMTP_USER.includes('your_')) warn('SMTP_USER', 'email OTPs will fail. See AUTH_SETUP_GUIDE.md');
  if (!process.env.SMTP_PASS || process.env.SMTP_PASS.includes('your_')) warn('SMTP_PASS', 'email OTPs will fail. Use a Gmail App Password.');
  if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID.includes('your_')) warn('GOOGLE_CLIENT_ID', 'Google sign-in disabled. See AUTH_SETUP_GUIDE.md');
})();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const http = require('http');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { Server: SocketIO } = require('socket.io');
const multer = require('multer');

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Multer: store chat files to disk
const chatStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});
const chatUpload = multer({
  storage: chatStorage,
  limits: { fileSize: 10 * 1024 * 1024 },  // 10 MB max
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|pdf|doc|docx|txt|xlsx|csv|zip/;
    const ext = path.extname(file.originalname).toLowerCase().slice(1);
    cb(null, allowed.test(ext));
  },
});

const app = express();
const server = http.createServer(app);
const io = new SocketIO(server, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true },
});

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(passport.initialize());

/* ── Nodemailer transporter ── */
const mailer = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,  // Gmail App Password (not account password)
  },
});

async function sendMail({ to, subject, html }) {
  try {
    await mailer.sendMail({
      from: `"AgriConnect Nepal 🌾" <${process.env.SMTP_USER}>`,
      to, subject, html,
    });
  } catch (e) {
    console.error('Mail error:', e.message);
  }
}

function makeOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit
}

const OTP_HTML = (otp, title, body) => `
  <div style="font-family:'DM Sans',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#f7f5f0;border-radius:16px;">
    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-flex;align-items:center;gap:10px;">
        <span style="font-size:28px;">🌾</span>
        <span style="font-size:22px;font-weight:800;color:#1e6e1e;">AgriConnect</span>
      </div>
    </div>
    <div style="background:white;border-radius:12px;padding:28px 24px;border:1px solid #ede8dc;">
      <h2 style="color:#3a2a1f;font-size:20px;margin:0 0 10px;">${title}</h2>
      <p style="color:#8b7050;font-size:14px;line-height:1.6;margin:0 0 24px;">${body}</p>
      <div style="text-align:center;background:#f0f9f0;border:2px dashed #44b044;border-radius:12px;padding:20px;">
        <div style="font-size:40px;font-weight:900;letter-spacing:10px;color:#1e6e1e;font-family:monospace;">${otp}</div>
        <p style="color:#6f5540;font-size:12px;margin:8px 0 0;">Valid for 15 minutes</p>
      </div>
    </div>
    <p style="text-align:center;color:#a68f69;font-size:11px;margin-top:20px;">
      If you didn't request this, you can safely ignore this email.<br/>
      © ${new Date().getFullYear()} AgriConnect Nepal
    </p>
  </div>
`;

/* ── Google OAuth strategy ──
   • Existing user  → sign in immediately (normal JWT flow)
   • New user       → attach googleProfile to req so the callback can
                      issue a short-lived "pending" token and redirect
                      the client to the role-picker screen
── */
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.SERVER_URL || 'http://localhost:5000'}/api/auth/google/callback`,
    passReqToCallback: true,
  }, async (req, accessToken, refreshToken, profile, done) => {
    try {
      // --- Existing user by googleId ---
      let user = await User.findOne({ googleId: profile.id });
      if (user) return done(null, user);

      // --- Existing user by email (link accounts) ---
      const email = profile.emails?.[0]?.value?.toLowerCase() || '';
      user = await User.findOne({ email });
      if (user) {
        user.googleId = profile.id;
        user.isEmailVerified = true;
        if (!user.avatar && profile.photos?.[0]?.value) user.avatar = profile.photos[0].value;
        await user.save();
        return done(null, user);
      }

      // --- Brand new Google user → need role selection ---
      // Return a special marker so the callback handler can redirect to role picker
      const pendingProfile = {
        googleId: profile.id,
        name: profile.displayName || email.split('@')[0] || 'User',
        email,
        avatar: profile.photos?.[0]?.value || '',
      };
      // Attach pending flag; callback will detect user===null and pendingProfile set
      req.pendingGoogleProfile = pendingProfile;
      return done(null, false); // false → passport won't set req.user
    } catch (e) { done(e, null); }
  }));
}




mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/agri-marketplace-v6')
  .then(() => { console.log('✅  MongoDB connected'); rebuildProductTrie(); })
  .catch(e => { console.error(e); process.exit(1); });

/* ══════════════════════════════════════════════════════════
   SCHEMAS
══════════════════════════════════════════════════════════ */
const User = mongoose.model('User', new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String },   // optional for OAuth users
  phone: { type: String, default: '' },
  role: { type: String, enum: ['Farmer', 'Consumer', 'Admin'], default: 'Consumer' },
  location: { city: { type: String, default: '' }, lat: { type: Number, default: 27.7172 }, lng: { type: Number, default: 85.3240 } },
  avatar: { type: String, default: '' },
  bio: { type: String, default: '' },
  language: { type: String, enum: ['en', 'ne'], default: 'en' },
  viewHistory: [{ category: String, cropName: String, viewedAt: { type: Date, default: Date.now } }],
  // ── Email verification
  isEmailVerified: { type: Boolean, default: false },
  emailVerifyOTP: { type: String },
  emailVerifyExpiry: { type: Date },
  // ── Password reset
  resetPasswordOTP: { type: String },
  resetPasswordExpiry: { type: Date },
  resetToken: { type: String },
  // ── OAuth
  googleId: { type: String },
  authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
}, { timestamps: true }));

const Product = mongoose.model('Product', new mongoose.Schema({
  farmerID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  cropName: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  category: { type: String, enum: ['Vegetable', 'Fruit', 'Grain', 'Dairy', 'Herb', 'Other'], default: 'Other' },
  quantity: { type: Number, required: true, min: 0 },
  unit: { type: String, default: 'kg' },
  price: { type: Number, required: true, min: 0 },
  discountPrice: { type: Number, default: null },
  aiSuggestedPrice: { type: Number, default: 0 },
  priceStatus: { type: String, enum: ['match', 'sale', 'above', 'none'], default: 'none' },
  location: { city: { type: String, required: true }, lat: { type: Number, required: true }, lng: { type: Number, required: true } },
  season: { type: String, default: 'Year-Round' },
  imageURL: { type: String, default: '' },
  isAvailable: { type: Boolean, default: true },
  demand: { type: Number, default: 0 },
  featureTags: [String],
  avgRating: { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },
  weeklySales: { type: [Number], default: [0, 0, 0, 0] },
}, { timestamps: true }));

const Order = mongoose.model('Order', new mongoose.Schema({
  farmerID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  consumerID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  productID: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true },
  totalPrice: { type: Number, required: true },
  status: { type: String, enum: ['Pending', 'In-Transit', 'Delivered', 'Cancelled'], default: 'Pending' },
  paymentStatus: { type: String, enum: ['Unpaid', 'Initiated', 'AdvancePaid', 'Paid', 'Failed', 'Refunded'], default: 'Unpaid' },
  paymentMethod: { type: String, default: '' },
  paymentRef: { type: String, default: '' },
  routeData: { type: Object, default: {} },
  deliveryAddress: { type: String, default: '' },
  // COD with 25% advance via eSewa
  advanceAmount: { type: Number, default: 0 },   // 25% paid via eSewa upfront
  remainingAmount: { type: Number, default: 0 },   // 75% to be collected on delivery
  advanceTxnRef: { type: String, default: '' },  // eSewa transaction code for advance
}, { timestamps: true }));

const CartItem = mongoose.model('CartItem', new mongoose.Schema({
  consumerID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  productID: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, default: 1, min: 1 },
}, { timestamps: true }));

const Review = mongoose.model('Review', new mongoose.Schema({
  productID: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  farmerID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewerID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, default: '' },
  orderID: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
}, { timestamps: true }));

const Notification = mongoose.model('Notification', new mongoose.Schema({
  userID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String },
  title: { type: String, required: true },
  body: { type: String, required: true },
  link: { type: String, default: '' },
  read: { type: Boolean, default: false },
  meta: { type: Object, default: {} },
}, { timestamps: true }));

const Conversation = mongoose.model('Conversation', new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  productID: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  lastMessage: { type: String, default: '' },
  lastMessageAt: { type: Date, default: Date.now },
  unreadCount: { type: Map, of: Number, default: {} },
}, { timestamps: true }));

const Message = mongoose.model('Message', new mongoose.Schema({
  conversationID: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  senderID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, default: '' },
  fileURL: { type: String, default: '' },     // hosted path for image/file
  fileType: { type: String, enum: ['image', 'file', ''], default: '' },
  fileName: { type: String, default: '' },     // original filename for display
  edited: { type: Boolean, default: false },
  deleted: { type: Boolean, default: false },  // soft-delete
  read: { type: Boolean, default: false },
}, { timestamps: true }));

const Payment = mongoose.model('Payment', new mongoose.Schema({
  orderID: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  userID: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  method: String, amount: Number, status: String,
  refId: String, transactionId: String, rawResponse: Object,
}, { timestamps: true }));

/* ══════════════════════════════════════════════════════════
   AUTH HELPERS
══════════════════════════════════════════════════════════ */
const SECRET = process.env.JWT_SECRET || 'dev_secret';
const signToken = u => jwt.sign({ id: u._id, role: u.role }, SECRET, { expiresIn: '7d' });
const auth = (req, res, next) => {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ message: 'No token' });
  try { req.user = jwt.verify(h.split(' ')[1], SECRET); next(); }
  catch { res.status(401).json({ message: 'Invalid token' }); }
};

/* ══════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════ */
function haversineKm(a, b, c, d) { const R = 6371, f = v => v * Math.PI / 180; const x = Math.sin(f(c - a) / 2) ** 2 + Math.cos(f(a)) * Math.cos(f(c)) * Math.sin(f(d - b) / 2) ** 2; return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); }
function calcPriceStatus(p, ai, discount) {
  // If farmer explicitly set a discount price lower than regular → always 'sale'
  if (discount && discount > 0 && discount < p) return 'sale';
  if (!ai || ai <= 0) return 'none';
  const d = (p - ai) / ai;
  if (Math.abs(d) <= 0.02) return 'match';
  if (d < -0.02) return 'sale';
  return 'above';
}
function generateFeatureTags(name, cat) { const tags = [cat.toLowerCase(), ...name.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 2)]; const syn = { Vegetable: ['veggie', 'greens'], Fruit: ['sweet', 'tropical'], Grain: ['cereal', 'staple'], Dairy: ['milk', 'cream'], Herb: ['spice', 'aromatic'], Other: ['farm'] }; return [...new Set([...tags, ...(syn[cat] || []).slice(0, 2)])]; }

async function sendNotification(userID, type, title, body, link = '', meta = {}) {
  try {
    const n = await Notification.create({ userID, type, title, body, link, meta });
    io.to(`user_${userID}`).emit('notification', n);
    return n;
  } catch (e) { console.error('Notif:', e.message); }
}

/* ══════════════════════════════════════════════════════════
   TRIE — Prefix-based instant product search + autocomplete
   ──────────────────────────────────────────────────────────
   Each Trie node stores:
     children   : Map of char → TrieNode
     isEnd      : marks a complete word boundary
     productIds : Set of productIDs that match this word
     frequency  : cumulative search/view demand for ranking
══════════════════════════════════════════════════════════ */
class TrieNode {
  constructor() {
    this.children = {};       // char → TrieNode
    this.isEnd = false;
    this.words = new Set(); // full words ending here
    this.productIds = new Set(); // product IDs at this word
    this.frequency = 0;         // demand-based rank score
  }
}

class ProductTrie {
  constructor() { this.root = new TrieNode(); this._size = 0; }

  /* Insert a cropName + productId into the trie */
  insert(cropName, productId, frequency = 0) {
    if (!cropName) return;
    const words = cropName.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
    // Index every word AND the full phrase
    const phrases = [cropName.toLowerCase().trim(), ...words].filter(w => w.length > 1);
    phrases.forEach(phrase => {
      let node = this.root;
      for (const ch of phrase) {
        if (!node.children[ch]) node.children[ch] = new TrieNode();
        node = node.children[ch];
        node.productIds.add(productId);
        node.frequency = Math.max(node.frequency, frequency);
      }
      node.isEnd = true;
      node.words.add(cropName); // preserve original casing
      this._size++;
    });
  }

  /* Remove a product from all trie paths */
  remove(productId) {
    this._removeFromNode(this.root, productId);
  }
  _removeFromNode(node, productId) {
    node.productIds.delete(productId);
    Object.values(node.children).forEach(child => this._removeFromNode(child, productId));
  }

  /* Get suggestions for a prefix — returns [{word, productIds, frequency}] */
  getSuggestions(prefix, limit = 10) {
    if (!prefix || prefix.length < 1) return [];
    const clean = prefix.toLowerCase().trim();
    let node = this.root;
    for (const ch of clean) {
      if (!node.children[ch]) return [];
      node = node.children[ch];
    }
    // Collect all complete words reachable from this node
    const results = [];
    this._collect(node, results);
    // Sort by frequency desc then alphabetically
    results.sort((a, b) => b.frequency - a.frequency || a.word.localeCompare(b.word));
    return results.slice(0, limit);
  }

  _collect(node, results) {
    if (node.isEnd) {
      node.words.forEach(word => {
        if (!results.find(r => r.word === word)) {
          results.push({ word, productIds: [...node.productIds], frequency: node.frequency });
        }
      });
    }
    Object.values(node.children).forEach(child => this._collect(child, results));
  }

  /* Search prefix boolean */
  startsWith(prefix) {
    let node = this.root;
    for (const ch of prefix.toLowerCase()) {
      if (!node.children[ch]) return false;
      node = node.children[ch];
    }
    return true;
  }

  /* Exact product ID lookup from prefix */
  getProductIds(prefix) {
    let node = this.root;
    for (const ch of prefix.toLowerCase().trim()) {
      if (!node.children[ch]) return new Set();
      node = node.children[ch];
    }
    return node.productIds;
  }

  get size() { return this._size; }
}

/* Global singleton trie — rebuilt on startup and after product mutations */
let productTrie = new ProductTrie();

/* Rebuild trie from DB (called on startup + after product CRUD) */
async function rebuildProductTrie() {
  try {
    const products = await Product.find({ isAvailable: true }).select('cropName category demand').lean();
    productTrie = new ProductTrie();
    products.forEach(p => productTrie.insert(p.cropName, p._id.toString(), p.demand || 0));
    console.log(`[Trie] Rebuilt with ${products.length} products`);
  } catch (e) { console.error('[Trie] Rebuild error:', e.message); }
}

/* ══════════════════════════════════════════════════════════
   CONTENT-BASED FILTERING
══════════════════════════════════════════════════════════ */
function buildTFMap(tags) { const tf = {}; tags.forEach(t => { tf[t] = (tf[t] || 0) + 1; }); const n = tags.length || 1; Object.keys(tf).forEach(k => { tf[k] /= n; }); return tf; }
function cosineSim(a, b) { const keys = new Set([...Object.keys(a), ...Object.keys(b)]); let dot = 0, nA = 0, nB = 0; keys.forEach(k => { const av = a[k] || 0, bv = b[k] || 0; dot += av * bv; nA += av * av; nB += bv * bv; }); const d = Math.sqrt(nA) * Math.sqrt(nB); return d > 0 ? dot / d : 0; }
function contentBasedRecommend({ queryCategory, queryCropName = '', allProducts, viewHistory = [], consumerLat, consumerLng, topN = 8, excludeId = null }) {
  const qTags = generateFeatureTags(queryCropName || queryCategory, queryCategory);
  const hTags = viewHistory.slice(-10).flatMap(h => generateFeatureTags(h.cropName || h.category, h.category));
  const qTF = buildTFMap([...qTags, ...qTags, ...hTags]);
  const scored = allProducts.filter(p => p.isAvailable && p._id.toString() !== excludeId).map(p => {
    const pTags = p.featureTags?.length ? p.featureTags : generateFeatureTags(p.cropName, p.category);
    let score = cosineSim(qTF, buildTFMap(pTags));
    if (p.category === queryCategory) score += 0.5;
    if (consumerLat && consumerLng && p.location?.lat) { const d = haversineKm(consumerLat, consumerLng, p.location.lat, p.location.lng); if (d < 50) score += 0.30; else if (d < 100) score += 0.15; else if (d < 200) score += 0.08; }
    score += Math.min(p.demand || 0, 100) / 1000;
    return { ...p, _cbfScore: score };
  }).filter(p => p._cbfScore > 0.05).sort((a, b) => b._cbfScore - a._cbfScore).slice(0, topN);
  const reason = queryCropName ? `More ${queryCategory}s like "${queryCropName}"` : queryCategory ? `Top ${queryCategory} picks near you` : 'Recommended for you';
  return { products: scored, reason };
}

/* ══════════════════════════════════════════════════════════
   A* PATHFINDING (replaces Dijkstra — uses haversine heuristic)
══════════════════════════════════════════════════════════ */
class AStarHeap { constructor() { this.h = []; } push(n) { this.h.push(n); this._up(this.h.length - 1); } pop() { const t = this.h[0], l = this.h.pop(); if (this.h.length) { this.h[0] = l; this._dn(0); } return t; } get size() { return this.h.length; } _up(i) { while (i > 0) { const p = Math.floor((i - 1) / 2); if (this.h[p].f <= this.h[i].f) break;[this.h[p], this.h[i]] = [this.h[i], this.h[p]]; i = p; } } _dn(i) { const n = this.h.length; while (true) { let s = i, l = 2 * i + 1, r = 2 * i + 2; if (l < n && this.h[l].f < this.h[s].f) s = l; if (r < n && this.h[r].f < this.h[s].f) s = r; if (s === i) break;[this.h[s], this.h[i]] = [this.h[i], this.h[s]]; i = s; } } }
// Heuristic: straight-line road-adjusted distance to target node
function aStarHeuristic(nodeA, nodeB) { if (!nodeA || !nodeB) return 0; return haversineKm(nodeA.lat, nodeA.lng, nodeB.lat, nodeB.lng) * ROAD; }
// A* search — finds optimal path guided by haversine heuristic
function aStar(graph, src, tgt, nodeMap) { const gScore = {}, fScore = {}, prev = {}, closed = new Set(); Object.keys(graph).forEach(n => { gScore[n] = Infinity; fScore[n] = Infinity; prev[n] = null; }); gScore[src] = 0; fScore[src] = aStarHeuristic(nodeMap[src], nodeMap[tgt]); const heap = new AStarHeap(); heap.push({ id: src, f: fScore[src] }); while (heap.size) { const { id: current } = heap.pop(); if (current === tgt) { const path = []; let cur = tgt; while (cur) { path.unshift(cur); cur = prev[cur]; } return { path, distance: parseFloat(gScore[tgt].toFixed(1)) }; } if (closed.has(current)) continue; closed.add(current); for (const { to: neighbor, w } of (graph[current] || [])) { if (closed.has(neighbor)) continue; const tentG = gScore[current] + w; if (tentG < gScore[neighbor]) { prev[neighbor] = current; gScore[neighbor] = tentG; fScore[neighbor] = tentG + aStarHeuristic(nodeMap[neighbor], nodeMap[tgt]); heap.push({ id: neighbor, f: fScore[neighbor] }); } } } return null; }
const ROAD = 1.4, SPEED = 40;
const HUBS = [{ id: 'H_KTM', label: 'Kathmandu', lat: 27.7172, lng: 85.3240 }, { id: 'H_PKR', label: 'Pokhara', lat: 28.2096, lng: 83.9856 }, { id: 'H_BRT', label: 'Biratnagar', lat: 26.4525, lng: 87.2718 }, { id: 'H_BTR', label: 'Butwal', lat: 27.7006, lng: 83.4483 }, { id: 'H_DHR', label: 'Dharan', lat: 26.8132, lng: 87.2846 }, { id: 'H_CHT', label: 'Chitwan', lat: 27.5291, lng: 84.3542 }, { id: 'H_BRD', label: 'Birgunj', lat: 27.0104, lng: 84.8799 }, { id: 'H_JNK', label: 'Janakpur', lat: 26.7288, lng: 85.9236 }];
function buildGraph(farm, dest) { const relevant = HUBS.filter(h => haversineKm(farm.lat, farm.lng, h.lat, h.lng) < 350 || haversineKm(dest.lat, dest.lng, h.lat, h.lng) < 350).sort((a, b) => Math.min(haversineKm(farm.lat, farm.lng, a.lat, a.lng), haversineKm(dest.lat, dest.lng, a.lat, a.lng)) - Math.min(haversineKm(farm.lat, farm.lng, b.lat, b.lng), haversineKm(dest.lat, dest.lng, b.lat, b.lng))).slice(0, 5); const nodes = [{ id: 'FARM', label: farm.label || 'Farm', lat: farm.lat, lng: farm.lng }, ...relevant, { id: 'DEST', label: dest.label || 'Customer', lat: dest.lat, lng: dest.lng }]; const graph = {}; nodes.forEach(n => { graph[n.id] = []; }); for (let i = 0; i < nodes.length; i++)for (let j = i + 1; j < nodes.length; j++) { const w = parseFloat((haversineKm(nodes[i].lat, nodes[i].lng, nodes[j].lat, nodes[j].lng) * ROAD).toFixed(1)); graph[nodes[i].id].push({ to: nodes[j].id, w }); graph[nodes[j].id].push({ to: nodes[i].id, w }); } return { graph, nodeMap: Object.fromEntries(nodes.map(n => [n.id, n])) }; }
function fmtTime(km) { const h = km / SPEED; return h < 1 ? `${Math.round(h * 60)} mins` : `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`; }
function computeTrend(ws = [0, 0, 0, 0]) { const n = ws.length; if (n < 2) return { slope: 0, direction: 'stable' }; const xM = (n - 1) / 2, yM = ws.reduce((a, b) => a + b, 0) / n; let num = 0, den = 0; ws.forEach((y, x) => { num += (x - xM) * (y - yM); den += (x - xM) ** 2; }); const slope = den > 0 ? num / den : 0; return { slope: parseFloat(slope.toFixed(2)), direction: slope > 0.5 ? 'rising' : slope < -0.5 ? 'falling' : 'stable' }; }

/* ══════════════════════════════════════════════════════════
   SOCKET.IO — strict chat isolation
   • User can only join rooms for conversations they are part of
   • send_message verified against participant list
   • Deduplication by _id on client (renderedIds Set)
══════════════════════════════════════════════════════════ */
io.use((socket, next) => {
  try { socket.user = jwt.verify(socket.handshake.auth?.token, SECRET); next(); }
  catch { next(new Error('Auth failed')); }
});

io.on('connection', socket => {
  const uid = socket.user.id;
  socket.join(`user_${uid}`);  // personal room for notifications

  /* JOIN conversation — verify membership first */
  socket.on('join_conversation', async convId => {
    try {
      const conv = await Conversation.findById(convId);
      if (!conv) return;
      // Only join if this user is actually a participant
      const isParticipant = conv.participants.some(p => p.toString() === uid);
      if (!isParticipant) {
        console.warn(`[CHAT] User ${uid} tried to join conv ${convId} — NOT a participant`);
        return;
      }
      socket.join(`conv_${convId}`);
    } catch (e) { console.error('join_conversation error:', e.message); }
  });

  /* SEND MESSAGE — verify sender is a participant */
  socket.on('send_message', async ({ conversationID, text, fileURL, fileType, fileName }) => {
    if (!text?.trim() && !fileURL) return;
    try {
      const conv = await Conversation.findById(conversationID);
      if (!conv) return;
      const isParticipant = conv.participants.some(p => p.toString() === uid);
      if (!isParticipant) {
        console.warn(`[CHAT] User ${uid} tried to send to conv ${conversationID} — NOT a participant`);
        socket.emit('error_msg', { message: 'You are not part of this conversation' });
        return;
      }
      const msgData = { conversationID, senderID: uid, text: (text || '').trim(), fileURL: fileURL || '', fileType: fileType || '', fileName: fileName || '' };
      const msg = await Message.create(msgData);
      const other = conv.participants.find(p => p.toString() !== uid);
      const lastMsg = fileURL ? (fileType === 'image' ? '📷 Image' : `📎 ${fileName || 'File'}`) : (text || '').trim().slice(0, 80);

      // Update conversation metadata
      const unreadUpdate = { lastMessage: lastMsg, lastMessageAt: new Date() };
      if (other) unreadUpdate[`unreadCount.${other}`] = (conv.unreadCount?.get(other.toString()) || 0) + 1;
      await Conversation.findByIdAndUpdate(conversationID, unreadUpdate);

      const populated = await Message.findById(msg._id).populate('senderID', 'name avatar');
      // Broadcast to conversation room — client deduplicates by _id
      io.to(`conv_${conversationID}`).emit('new_message', populated);

      // Notify ONLY the OTHER participant — never the sender
      if (other && other.toString() !== uid) {
        const sender = await User.findById(uid).select('name');
        const preview = fileURL ? `${sender?.name} sent ${fileType === 'image' ? 'an image' : 'a file'}` : text?.trim().slice(0, 60) || '';
        sendNotification(other, 'chat_message', `💬 Message from ${sender?.name}`, preview, '/dashboard/chat');
        // Real-time unread badge update for the other user only
        io.to(`user_${other}`).emit('conv_update', { conversationID, lastMessage: lastMsg });
      }
    } catch (e) { console.error('send_message error:', e.message); }
  });

  // Edit message text (only sender can edit)
  socket.on('edit_message', async ({ messageID, text }) => {
    try {
      if (!text?.trim()) return;
      const msg = await Message.findById(messageID);
      if (!msg || msg.senderID.toString() !== uid || msg.deleted) return;
      msg.text = text.trim(); msg.edited = true;
      await msg.save();
      const populated = await Message.findById(msg._id).populate('senderID', 'name avatar');
      io.to(`conv_${msg.conversationID}`).emit('message_edited', populated);
    } catch (e) { console.error('edit_message error:', e.message); }
  });

  // Soft-delete message (only sender can delete)
  socket.on('delete_message', async ({ messageID }) => {
    try {
      const msg = await Message.findById(messageID);
      if (!msg || msg.senderID.toString() !== uid) return;
      msg.deleted = true; msg.text = ''; msg.fileURL = ''; msg.fileName = '';
      await msg.save();
      io.to(`conv_${msg.conversationID}`).emit('message_deleted', { messageID, conversationID: msg.conversationID.toString() });
    } catch (e) { console.error('delete_message error:', e.message); }
  });

  socket.on('mark_read', async ({ conversationID }) => {
    try {
      // Verify participant before marking read
      const conv = await Conversation.findById(conversationID);
      if (!conv) return;
      if (!conv.participants.some(p => p.toString() === uid)) return;
      await Message.updateMany({ conversationID, senderID: { $ne: uid }, read: false }, { read: true });
      await Conversation.findByIdAndUpdate(conversationID, { [`unreadCount.${uid}`]: 0 });
      // Notify other participant their messages are read
      const other = conv.participants.find(p => p.toString() !== uid);
      if (other) io.to(`user_${other}`).emit('messages_read', { conversationID });
    } catch (e) { console.error('mark_read error:', e.message); }
  });



  socket.on('disconnect', () => { });
});

/* ══════════════════════════════════════════════════════════
   AUTH ROUTES
══════════════════════════════════════════════════════════ */
/* ══ AUTH ROUTES ══════════════════════════════════════════════════════ */

app.get('/api/auth/check-email', async (req, res) => { try { const { email } = req.query; res.json({ exists: !!(await User.exists({ email: email?.toLowerCase().trim() })) }); } catch (e) { res.status(500).json({ message: e.message }); } });

/* REGISTER — sends OTP, user not active until verified */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role, location, phone } = req.body;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Invalid email' });
    if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ message: 'Email already registered' });
    if (!password || password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
    const otp = makeOTP();
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min
    const user = await User.create({
      name: name.trim(), email: email.toLowerCase().trim(),
      password: await bcrypt.hash(password, 10), role, phone: phone || '',
      location: location || { city: '', lat: 27.7172, lng: 85.3240 },
      isEmailVerified: false, emailVerifyOTP: otp, emailVerifyExpiry: expiry,
      authProvider: 'local',
    });
    await sendMail({
      to: email,
      subject: 'Verify your AgriConnect account',
      html: OTP_HTML(otp, 'Verify Your Email',
        `Welcome to AgriConnect, ${name.trim()}! Enter the code below to activate your account.`),
    });
    res.status(201).json({ needsVerification: true, email: email.toLowerCase().trim() });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* VERIFY EMAIL OTP */
app.post('/api/auth/verify-email', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase().trim() });
    if (!user) return res.status(404).json({ message: 'Account not found' });
    if (user.isEmailVerified) return res.status(400).json({ message: 'Email already verified' });
    if (!user.emailVerifyOTP || user.emailVerifyOTP !== otp?.trim()) return res.status(400).json({ message: 'Invalid verification code' });
    if (user.emailVerifyExpiry < new Date()) return res.status(400).json({ message: 'Code expired — please request a new one' });
    user.isEmailVerified = true; user.emailVerifyOTP = undefined; user.emailVerifyExpiry = undefined;
    await user.save();
    res.json({ token: signToken(user), user: { id: user._id, name: user.name, role: user.role, language: user.language } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* RESEND VERIFICATION OTP */
app.post('/api/auth/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase().trim() });
    if (!user) return res.status(404).json({ message: 'Account not found' });
    if (user.isEmailVerified) return res.status(400).json({ message: 'Email already verified' });
    const otp = makeOTP();
    user.emailVerifyOTP = otp; user.emailVerifyExpiry = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();
    await sendMail({
      to: email, subject: 'Your new AgriConnect verification code',
      html: OTP_HTML(otp, 'New Verification Code', 'Here is your new verification code:')
    });
    res.json({ sent: true });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* LOGIN — blocks unverified emails */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase().trim() });
    if (!user) return res.status(401).json({ message: 'No account found with this email' });
    if (user.authProvider !== 'local') return res.status(401).json({ message: `This account uses ${user.authProvider} sign-in. Please use that option.` });
    if (!(await bcrypt.compare(password, user.password || ''))) return res.status(401).json({ message: 'Incorrect password' });
    if (!user.isEmailVerified) {
      // Resend a fresh OTP
      const otp = makeOTP();
      user.emailVerifyOTP = otp; user.emailVerifyExpiry = new Date(Date.now() + 15 * 60 * 1000);
      await user.save();
      await sendMail({
        to: user.email, subject: 'Verify your AgriConnect account',
        html: OTP_HTML(otp, 'Verify Your Email', 'Your account is not verified yet. Use the code below to verify.')
      });
      return res.status(403).json({ needsVerification: true, email: user.email, message: 'Please verify your email first. A new code has been sent.' });
    }
    res.json({ token: signToken(user), user: { id: user._id, name: user.name, role: user.role, language: user.language } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* FORGOT PASSWORD — sends OTP */
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase().trim(), authProvider: 'local' });
    if (!user) return res.status(404).json({ message: 'No account found with this email address' });
    const otp = makeOTP();
    user.resetPasswordOTP = otp; user.resetPasswordExpiry = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();
    await sendMail({
      to: user.email, subject: 'Reset your AgriConnect password',
      html: OTP_HTML(otp, 'Reset Your Password', 'Enter the code below to reset your AgriConnect password.')
    });
    res.json({ sent: true, email: user.email });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* VERIFY RESET OTP */
app.post('/api/auth/verify-reset-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase().trim() });
    if (!user) return res.status(404).json({ message: 'Account not found' });
    if (!user.resetPasswordOTP || user.resetPasswordOTP !== otp?.trim()) return res.status(400).json({ message: 'Invalid reset code' });
    if (user.resetPasswordExpiry < new Date()) return res.status(400).json({ message: 'Code expired — request a new one' });
    // Issue a short-lived reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetToken = resetToken; user.resetPasswordOTP = undefined; user.resetPasswordExpiry = undefined;
    await user.save();
    res.json({ valid: true, resetToken });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* RESET PASSWORD */
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, resetToken, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
    const user = await User.findOne({ email: email?.toLowerCase().trim(), resetToken });
    if (!user) return res.status(400).json({ message: 'Invalid or expired reset session' });
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetToken = undefined;
    await user.save();
    res.json({ ok: true, message: 'Password reset successfully' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* ── GOOGLE OAUTH ── */
const googleConfigured = !!(process.env.GOOGLE_CLIENT_ID && !process.env.GOOGLE_CLIENT_ID.includes('your_'));

// Short-lived pending token (10 min) — carries Google profile until user picks a role
const PENDING_SECRET = (process.env.JWT_SECRET || 'agri_secret') + '_pending';
function signPending(profile) {
  return jwt.sign({ pending: true, ...profile }, PENDING_SECRET, { expiresIn: '10m' });
}
function verifyPending(token) {
  try { return jwt.verify(token, PENDING_SECRET); } catch { return null; }
}

app.get('/api/auth/google', (req, res, next) => {
  if (!googleConfigured)
    return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/auth?error=google_not_configured`);
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
});

app.get('/api/auth/google/callback', (req, res, next) => {
  if (!googleConfigured)
    return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/auth?error=google_not_configured`);

  passport.authenticate('google', { session: false, failWithError: true })(req, res, (err) => {
    if (err) return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/auth?error=google_failed`);

    // Existing user — normal JWT
    if (req.user) {
      const token = signToken(req.user);
      return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/auth/callback?token=${token}`);
    }

    // New user — redirect to role picker with a pending token
    if (req.pendingGoogleProfile) {
      const pendingToken = signPending(req.pendingGoogleProfile);
      return res.redirect(
        `${process.env.CLIENT_URL || 'http://localhost:3000'}/auth/callback?pending=${pendingToken}`
      );
    }

    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/auth?error=google_failed`);
  });
});

// Step 2 for new Google users: client sends { pendingToken, role }
app.post('/api/auth/google/complete', async (req, res) => {
  try {
    const { pendingToken, role } = req.body;
    if (!pendingToken) return res.status(400).json({ message: 'Missing pending token' });
    if (!['Farmer', 'Consumer'].includes(role)) return res.status(400).json({ message: 'Invalid role' });

    const profile = verifyPending(pendingToken);
    if (!profile) return res.status(401).json({ message: 'Link expired — please sign in with Google again' });

    // Double-check no one registered in the meantime
    let user = await User.findOne({ googleId: profile.googleId });
    if (!user) user = await User.findOne({ email: profile.email });
    if (user) {
      // Already exists — just link & return token
      if (!user.googleId) { user.googleId = profile.googleId; user.isEmailVerified = true; await user.save(); }
      return res.json({ token: signToken(user), user });
    }

    // Create the account with the chosen role
    user = await User.create({
      name: profile.name,
      email: profile.email,
      googleId: profile.googleId,
      authProvider: 'google',
      isEmailVerified: true,
      avatar: profile.avatar || '',
      role,
    });
    res.json({ token: signToken(user), user });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* ── Auth config status ── */
app.get('/api/auth/config-status', (_req, res) => {
  res.json({
    email: !!(process.env.SMTP_USER && !process.env.SMTP_USER.includes('your_')),
    google: googleConfigured,
  });
});
app.get('/api/users/me', auth, async (req, res) => { try { const u = await User.findById(req.user.id).select('-password'); if (!u) return res.status(404).json({ message: 'Not found' }); res.json(u); } catch (e) { res.status(500).json({ message: e.message }); } });
app.put('/api/users/profile', auth, async (req, res) => { try { const { name, phone, bio, avatar, location, currentPassword, newPassword, language } = req.body; const user = await User.findById(req.user.id); if (!user) return res.status(404).json({ message: 'Not found' }); if (name) user.name = name.trim(); if (phone !== undefined) user.phone = phone; if (bio !== undefined) user.bio = bio; if (avatar !== undefined) user.avatar = avatar; if (language) user.language = language; if (location) user.location = { city: location.city || user.location.city, lat: +(location.lat ?? user.location.lat), lng: +(location.lng ?? user.location.lng) }; let passwordChanged = false; if (newPassword) { if (!currentPassword) return res.status(400).json({ message: 'Current password required' }); if (!(await bcrypt.compare(currentPassword, user.password))) return res.status(401).json({ message: 'Incorrect password' }); if (newPassword.length < 6) return res.status(400).json({ message: 'New password must be ≥6 chars' }); user.password = await bcrypt.hash(newPassword, 10); passwordChanged = true; } await user.save(); const { password: _, ...safe } = user.toObject(); res.json({ message: 'Updated', user: safe, passwordChanged }); } catch (e) { res.status(500).json({ message: e.message }); } });
app.patch('/api/users/language', auth, async (req, res) => { try { await User.findByIdAndUpdate(req.user.id, { language: req.body.language }); res.json({ ok: true }); } catch (e) { res.status(500).json({ message: e.message }); } });

/* ── DELETE account — wipes all user data permanently ── */
app.delete('/api/users/account', auth, async (req, res) => {
  try {
    const { password, confirmPhrase } = req.body;

    // 1 — Validate confirmation phrase
    if (!confirmPhrase || confirmPhrase.trim().toLowerCase() !== 'delete my account') {
      return res.status(400).json({ message: 'Please type the exact confirmation phrase.' });
    }

    // 2 — Validate password
    const user = await User.findById(req.user.id).select('+password');
    if (!user) return res.status(404).json({ message: 'Account not found.' });
    const pwMatch = await bcrypt.compare(password, user.password);
    if (!pwMatch) return res.status(401).json({ message: 'Incorrect password. Please try again.' });

    const uid = req.user.id;

    // 3 — Cascade delete all related data
    const farmerProducts = await Product.find({ farmerID: uid }).select('_id');
    const productIds = farmerProducts.map(p => p._id);

    await Promise.allSettled([
      Product.deleteMany({ farmerID: uid }),
      Order.deleteMany({ $or: [{ farmerID: uid }, { consumerID: uid }] }),
      CartItem.deleteMany({ consumerID: uid }),
      (async () => {
        const convs = await Conversation.find({ participants: uid }).select('_id');
        const convIds = convs.map(c => c._id);
        await Message.deleteMany({ conversationID: { $in: convIds } });
        await Conversation.deleteMany({ participants: uid });
      })(),
      Payment.deleteMany({ userID: uid }),
      Notification.deleteMany({ userID: uid }),
      Review.deleteMany({ $or: [{ consumerID: uid }, { productID: { $in: productIds } }] }),
      (async () => { for (const p of farmerProducts) productTrie.remove(p._id.toString()); })(),
    ]);

    // 4 — Delete user document
    await User.findByIdAndDelete(uid);

    res.json({ success: true, message: 'Your account and all associated data have been permanently deleted.' });
  } catch (e) {
    console.error('[DELETE ACCOUNT]', e.message);
    res.status(500).json({ message: 'Account deletion failed. Please contact support.' });
  }
});

/* ══════════════════════════════════════════════════════════
   PRODUCT ROUTES
══════════════════════════════════════════════════════════ */
app.get('/api/products', async (req, res) => { try { const { category, season, search, consumerLat, consumerLng } = req.query; const filter = { isAvailable: true }; if (category) filter.category = category; if (season) filter.season = season; if (search) filter.cropName = new RegExp(search, 'i'); let products = await Product.find(filter).populate('farmerID', 'name location phone avatar').sort({ createdAt: -1 }).limit(80).lean(); if (consumerLat && consumerLng) { const cLat = parseFloat(consumerLat), cLng = parseFloat(consumerLng); products = products.map(p => ({ ...p, _distKm: haversineKm(cLat, cLng, p.location.lat, p.location.lng) })); products.sort((a, b) => { const aN = a._distKm < 150, bN = b._distKm < 150; if (aN && !bN) return -1; if (!aN && bN) return 1; return aN ? a._distKm - b._distKm : b.demand - a.demand; }); } res.json(products); } catch (e) { res.status(500).json({ message: e.message }); } });
app.post('/api/products/recommend', async (req, res) => { try { const { category = 'Vegetable', cropName = '', consumerLat, consumerLng, viewHistory = [], excludeId } = req.body; const all = await Product.find({ isAvailable: true }).populate('farmerID', 'name location avatar').lean(); const { products, reason } = contentBasedRecommend({ queryCategory: category, queryCropName: cropName, allProducts: all, viewHistory, consumerLat: consumerLat ? +consumerLat : null, consumerLng: consumerLng ? +consumerLng : null, topN: 8, excludeId }); res.json({ products, reason, count: products.length }); } catch (e) { res.status(500).json({ message: e.message }); } });

/* ── Trie: instant autocomplete suggestions ── */
app.get('/api/search/suggestions', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 1) return res.json({ suggestions: [] });
    const suggestions = productTrie.getSuggestions(q, 10);
    res.json({ suggestions, trieSize: productTrie.size });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* ── Hybrid: Trie prefix match + Content-Based Filtering ── */
app.post('/api/search/hybrid', async (req, res) => {
  try {
    const { query = '', category, season, consumerLat, consumerLng, viewHistory = [] } = req.body;
    const q = query.trim();

    // ── Step 1: Trie prefix match → get candidate product IDs ──
    const trieProductIds = q.length >= 1 ? productTrie.getProductIds(q) : new Set();
    const suggestions = q.length >= 1 ? productTrie.getSuggestions(q, 8) : [];

    // ── Step 2: DB fetch — Trie hits + regex fallback merged ──
    const dbFilter = { isAvailable: true };
    if (category && category !== 'All') dbFilter.category = category;
    if (season && season !== 'All') dbFilter.season = season;

    let trieProducts = [];
    if (trieProductIds.size > 0) {
      trieProducts = await Product.find({ ...dbFilter, _id: { $in: [...trieProductIds] } })
        .populate('farmerID', 'name location phone avatar').lean();
    }

    // Regex fallback for broader matches
    const regexFilter = { ...dbFilter, cropName: new RegExp(q, 'i') };
    const regexProducts = q.length >= 2 ? await Product.find(regexFilter)
      .populate('farmerID', 'name location phone avatar').sort({ demand: -1 }).limit(40).lean() : [];

    // Merge: Trie hits first, then regex additions (de-duplicated)
    const seen = new Set(trieProducts.map(p => p._id.toString()));
    const merged = [...trieProducts, ...regexProducts.filter(p => !seen.has(p._id.toString()))];

    // ── Step 3: Distance sort if GPS provided ──
    if (consumerLat && consumerLng) {
      const cLat = +consumerLat, cLng = +consumerLng;
      merged.forEach(p => { p._distKm = haversineKm(cLat, cLng, p.location?.lat || 0, p.location?.lng || 0); });
      merged.sort((a, b) => (a._distKm < 150 && b._distKm >= 150) ? -1 : (a._distKm >= 150 && b._distKm < 150) ? 1 : (a._distKm < 150) ? a._distKm - b._distKm : b.demand - a.demand);
    }

    // ── Step 4: CBF recommendations for similar products ──
    let cbfProducts = [], cbfReason = '';
    if (q.length >= 2 || category) {
      const all = await Product.find({ isAvailable: true }).populate('farmerID', 'name location avatar').lean();
      const cbf = contentBasedRecommend({
        queryCategory: category || 'Vegetable',
        queryCropName: q,
        allProducts: all,
        viewHistory,
        consumerLat: consumerLat ? +consumerLat : null,
        consumerLng: consumerLng ? +consumerLng : null,
        topN: 8,
        excludeId: null,
      });
      // Exclude products already in main results
      const mainIds = new Set(merged.map(p => p._id.toString()));
      cbfProducts = cbf.products.filter(p => !mainIds.has(p._id.toString()));
      cbfReason = cbf.reason;
    }

    res.json({
      products: merged,
      suggestions,
      trieHitCount: trieProductIds.size,
      cbfProducts,
      cbfReason,
      total: merged.length,
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
});
app.post('/api/products/:id/view', auth, async (req, res) => { try { const p = await Product.findByIdAndUpdate(req.params.id, { $inc: { demand: 1 } }, { new: true }).populate('farmerID', 'name location phone avatar bio'); if (!p) return res.status(404).json({ message: 'Not found' }); await User.findByIdAndUpdate(req.user.id, { $push: { viewHistory: { $each: [{ category: p.category, cropName: p.cropName }], $slice: -20 } } }); res.json(p); } catch (e) { res.status(500).json({ message: e.message }); } });
app.post('/api/products', auth, async (req, res) => {
  try {
    if (!['Farmer', 'Admin'].includes(req.user.role)) return res.status(403).json({ message: 'Only farmers can list' }); const { price, aiSuggestedPrice, discountPrice, cropName, category, quantity } = req.body; const qty = parseFloat(quantity) || 0; const p = await Product.create({ ...req.body, quantity: qty, isAvailable: qty > 0, farmerID: req.user.id, priceStatus: calcPriceStatus(price, aiSuggestedPrice, discountPrice), featureTags: generateFeatureTags(cropName || '', category || 'Other') });
    // Sync trie
    productTrie.insert(p.cropName, p._id.toString(), p.demand || 0);
    res.status(201).json(p);
  } catch (e) { res.status(500).json({ message: e.message }); }
});
app.get('/api/products/farmer', auth, async (req, res) => { try { res.json(await Product.find({ farmerID: req.user.id }).sort({ createdAt: -1 })); } catch (e) { res.status(500).json({ message: e.message }); } });
app.get('/api/products/:id', async (req, res) => { try { const p = await Product.findByIdAndUpdate(req.params.id, { $inc: { demand: 1 } }, { new: true }).populate('farmerID', 'name location phone avatar bio avgRating reviewCount'); if (!p) return res.status(404).json({ message: 'Not found' }); res.json(p); } catch (e) { res.status(500).json({ message: e.message }); } });
app.put('/api/products/:id', auth, async (req, res) => { try { const p = await Product.findById(req.params.id); if (!p) return res.status(404).json({ message: 'Not found' }); if (p.farmerID.toString() !== req.user.id && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorised' }); const merged = { ...p.toObject(), ...req.body }; const qty = parseFloat(merged.quantity) || 0; const u = await Product.findByIdAndUpdate(req.params.id, { ...req.body, quantity: qty, isAvailable: qty > 0, priceStatus: calcPriceStatus(merged.price, merged.aiSuggestedPrice, merged.discountPrice), featureTags: generateFeatureTags(merged.cropName, merged.category) }, { new: true }); res.json(u); } catch (e) { res.status(500).json({ message: e.message }); } });
app.delete('/api/products/:id', auth, async (req, res) => {
  try {
    const p = await Product.findById(req.params.id); if (!p) return res.status(404).json({ message: 'Not found' }); if (p.farmerID.toString() !== req.user.id && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorised' }); await p.deleteOne();
    // Sync trie
    productTrie.remove(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* ══════════════════════════════════════════════════════════
   CART
══════════════════════════════════════════════════════════ */
app.get('/api/cart', auth, async (req, res) => {
  try {
    if (req.user.role === 'Farmer') return res.status(403).json({ message: 'Farmers cannot use cart' });
    const items = await CartItem.find({ consumerID: req.user.id })
      .populate({ path: 'productID', populate: { path: 'farmerID', select: 'name location avatar' } });
    // Return ALL items (even unavailable ones) — client shows "unavailable" badge
    res.json(items);
  } catch (e) { res.status(500).json({ message: e.message }); }
});
app.post('/api/cart', auth, async (req, res) => { try { if (req.user.role === 'Farmer') return res.status(403).json({ message: 'Farmers cannot add to cart' }); const { productID, quantity = 1 } = req.body; const product = await Product.findById(productID); if (!product || !product.isAvailable) return res.status(404).json({ message: 'Product not available' }); if (product.farmerID.toString() === req.user.id) return res.status(403).json({ message: 'Cannot buy own product' }); let item = await CartItem.findOne({ consumerID: req.user.id, productID }); if (item) { item.quantity = Math.min(quantity, product.quantity); await item.save(); } else { item = await CartItem.create({ consumerID: req.user.id, productID, quantity: Math.min(quantity, product.quantity) }); } await item.populate({ path: 'productID', populate: { path: 'farmerID', select: 'name location avatar' } }); res.json(item); } catch (e) { res.status(500).json({ message: e.message }); } });
app.patch('/api/cart/:itemId', auth, async (req, res) => { try { const { quantity } = req.body; if (quantity < 1) { await CartItem.findByIdAndDelete(req.params.itemId); return res.json({ deleted: true }); } const item = await CartItem.findOneAndUpdate({ _id: req.params.itemId, consumerID: req.user.id }, { quantity }, { new: true }).populate({ path: 'productID', populate: { path: 'farmerID', select: 'name location avatar' } }); res.json(item); } catch (e) { res.status(500).json({ message: e.message }); } });
app.delete('/api/cart/:itemId', auth, async (req, res) => { try { await CartItem.findOneAndDelete({ _id: req.params.itemId, consumerID: req.user.id }); res.json({ deleted: true }); } catch (e) { res.status(500).json({ message: e.message }); } });
app.delete('/api/cart', auth, async (req, res) => { try { await CartItem.deleteMany({ consumerID: req.user.id }); res.json({ cleared: true }); } catch (e) { res.status(500).json({ message: e.message }); } });

/* Checkout — creates orders, does NOT auto-charge; payment handled separately */
app.post('/api/cart/checkout', auth, async (req, res) => {
  try {
    if (req.user.role === 'Farmer') return res.status(403).json({ message: 'Farmers cannot checkout' });
    const { deliveryAddress = '' } = req.body;
    const items = await CartItem.find({ consumerID: req.user.id }).populate('productID');
    if (!items.length) return res.status(400).json({ message: 'Cart is empty' });
    const orders = [];
    for (const item of items) {
      const p = item.productID;
      if (!p || !p.isAvailable) continue;
      const qty = Math.min(item.quantity, p.quantity);
      const order = await Order.create({ farmerID: p.farmerID, consumerID: req.user.id, productID: p._id, quantity: qty, totalPrice: p.price * qty, deliveryAddress, paymentStatus: 'Unpaid' });
      const newQty = p.quantity - qty;
      await Product.findByIdAndUpdate(p._id, { quantity: newQty, isAvailable: newQty > 0, $inc: { demand: qty }, $push: { weeklySales: { $each: [qty], $slice: -4 } } });
      orders.push(order);
      const consumer = await User.findById(req.user.id).select('name');
      await sendNotification(p.farmerID, 'order_placed', '📦 New Order Received', `${consumer?.name} ordered ${qty} ${p.unit} of ${p.cropName}`, '/dashboard/logistics', { orderId: order._id });
    }
    await CartItem.deleteMany({ consumerID: req.user.id });
    res.json({ orders, message: `${orders.length} order(s) placed — please complete payment` });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* ══════════════════════════════════════════════════════════
   ORDERS (with quantity management)
══════════════════════════════════════════════════════════ */
app.post('/api/orders', auth, async (req, res) => {
  try {
    if (req.user.role === 'Farmer') return res.status(403).json({ message: 'Farmers cannot place orders' });
    const { productID, quantity, deliveryAddress } = req.body;
    const p = await Product.findById(productID);
    if (!p || !p.isAvailable) return res.status(404).json({ message: 'Product not available' });
    if (p.farmerID.toString() === req.user.id) return res.status(403).json({ message: 'Cannot buy own product' });
    const qty = Math.min(+quantity, p.quantity);
    // Create order with Unpaid status — payment to be selected by user
    const order = await Order.create({ farmerID: p.farmerID, consumerID: req.user.id, productID, quantity: qty, totalPrice: p.price * qty, deliveryAddress: deliveryAddress || '', paymentStatus: 'Unpaid' });
    const newQty = p.quantity - qty;
    await Product.findByIdAndUpdate(productID, { quantity: newQty, isAvailable: newQty > 0, $inc: { demand: qty }, $push: { weeklySales: { $each: [qty], $slice: -4 } } });
    const consumer = await User.findById(req.user.id).select('name');
    await sendNotification(p.farmerID, 'order_placed', '📦 New Order Received', `${consumer?.name} ordered ${qty} ${p.unit} of ${p.cropName}`, '/dashboard/logistics');
    res.status(201).json(order);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/orders', auth, async (req, res) => { try { const f = req.user.role === 'Farmer' ? { farmerID: req.user.id } : { consumerID: req.user.id }; res.json(await Order.find(f).populate('productID', 'cropName imageURL price').populate('farmerID', 'name location phone avatar bio').populate('consumerID', 'name location').sort({ createdAt: -1 })); } catch (e) { res.status(500).json({ message: e.message }); } });
app.patch('/api/orders/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id)
      .populate('productID', 'cropName quantity')
      .populate('consumerID', 'name')
      .populate('farmerID', 'name');
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const isFarmer = req.user.id === order.farmerID?._id?.toString();
    const isConsumer = req.user.id === order.consumerID?._id?.toString();

    /* ── Authorisation rules ── */
    if (status === 'Cancelled') {
      if (!isFarmer && !isConsumer) return res.status(403).json({ message: 'Not authorised to cancel this order' });
      // Consumer can only cancel while status is still Pending (not yet shipped)
      if (isConsumer && order.status !== 'Pending') {
        return res.status(400).json({
          message: order.status === 'In-Transit'
            ? 'Cannot cancel: your order is already on the way. Please contact the farmer via chat.'
            : `Cannot cancel: order is already ${order.status}.`
        });
      }
    } else if (status === 'In-Transit') {
      if (!isFarmer) return res.status(403).json({ message: 'Only the farmer can mark an order as shipped' });
      if (order.status !== 'Pending') return res.status(400).json({ message: 'Order is not in Pending state' });
    } else if (status === 'Delivered') {
      if (!isFarmer) return res.status(403).json({ message: 'Only the farmer can mark an order as delivered' });
      if (order.status !== 'In-Transit') return res.status(400).json({ message: 'Order must be In-Transit before marking Delivered' });
    }

    /* ── On cancel: determine refund + restore stock ── */
    let paymentStatusUpdate = order.paymentStatus;
    let refundApplied = false;
    if (status === 'Cancelled') {
      if (['Paid', 'AdvancePaid'].includes(order.paymentStatus)) {
        paymentStatusUpdate = 'Refunded';
        refundApplied = true;
      } else {
        paymentStatusUpdate = order.paymentStatus; // keep Unpaid/Initiated as-is
      }
      // Restore product stock quantity
      if (order.productID?._id) {
        await Product.findByIdAndUpdate(order.productID._id, { $inc: { quantity: order.quantity } });
      }
    }

    const updated = await Order.findByIdAndUpdate(
      req.params.id,
      { status, ...(status === 'Cancelled' && { paymentStatus: paymentStatusUpdate }) },
      { new: true }
    ).populate('productID', 'cropName imageURL price').populate('farmerID', 'name location phone avatar').populate('consumerID', 'name location');

    /* ── Notifications ── */
    if (status === 'In-Transit') {
      await sendNotification(order.consumerID._id, 'order_shipped', '🚚 Order On the Way!', `Your ${order.productID?.cropName} is heading to you!`, '/dashboard/logistics');
    } else if (status === 'Delivered') {
      await sendNotification(order.consumerID._id, 'order_delivered', '✅ Order Delivered!', `Your ${order.productID?.cropName} has been delivered. Please leave a review!`, '/dashboard/logistics');
    } else if (status === 'Cancelled') {
      if (isConsumer) {
        // Consumer cancelled → notify farmer
        await sendNotification(
          order.farmerID._id, 'order_cancelled', '❌ Order Cancelled by Buyer',
          `${order.consumerID?.name} cancelled the ${order.productID?.cropName} order.${refundApplied ? ' Refund has been marked.' : ''}`,
          '/dashboard/logistics'
        );
      } else {
        // Farmer cancelled → notify consumer
        await sendNotification(
          order.consumerID._id, 'order_cancelled', '❌ Order Cancelled by Farmer',
          `Your ${order.productID?.cropName} order was cancelled by the farmer.${refundApplied ? ' A refund will be processed.' : ''}`,
          '/dashboard/logistics'
        );
      }
    }

    res.json({ ...updated.toObject(), refundApplied });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* ══════════════════════════════════════════════════════════
   REVIEWS
══════════════════════════════════════════════════════════ */
app.get('/api/reviews/:productId', async (req, res) => { try { res.json(await Review.find({ productID: req.params.productId }).populate('reviewerID', 'name avatar').sort({ createdAt: -1 })); } catch (e) { res.status(500).json({ message: e.message }); } });
app.get('/api/reviews/farmer/:farmerId', async (req, res) => { try { res.json(await Review.find({ farmerID: req.params.farmerId }).populate('reviewerID', 'name avatar').populate('productID', 'cropName').sort({ createdAt: -1 })); } catch (e) { res.status(500).json({ message: e.message }); } });
app.post('/api/reviews', auth, async (req, res) => { try { if (req.user.role === 'Farmer') return res.status(403).json({ message: 'Farmers cannot review' }); const { productID, rating, comment, orderID } = req.body; if (!rating || rating < 1 || rating > 5) return res.status(400).json({ message: 'Rating 1-5' }); const product = await Product.findById(productID); if (!product) return res.status(404).json({ message: 'Not found' }); if (await Review.findOne({ productID, reviewerID: req.user.id })) return res.status(409).json({ message: 'Already reviewed' }); const review = await Review.create({ productID, farmerID: product.farmerID, reviewerID: req.user.id, rating, comment: comment || '', orderID }); const agg = await Review.aggregate([{ $match: { productID: product._id } }, { $group: { _id: null, avg: { $avg: '$rating' }, cnt: { $sum: 1 } } }]); await Product.findByIdAndUpdate(productID, { avgRating: parseFloat((agg[0]?.avg || rating).toFixed(1)), reviewCount: agg[0]?.cnt || 1 }); const reviewer = await User.findById(req.user.id).select('name'); await sendNotification(product.farmerID, 'new_review', `⭐ New ${rating}-Star Review`, `${reviewer?.name} reviewed ${product.cropName}`, '/dashboard/farmer'); res.status(201).json(await Review.findById(review._id).populate('reviewerID', 'name avatar')); } catch (e) { res.status(500).json({ message: e.message }); } });

/* ══════════════════════════════════════════════════════════
   NOTIFICATIONS
══════════════════════════════════════════════════════════ */
app.get('/api/notifications', auth, async (req, res) => { try { const n = await Notification.find({ userID: req.user.id }).sort({ createdAt: -1 }).limit(30); res.json({ notifications: n, unread: await Notification.countDocuments({ userID: req.user.id, read: false }) }); } catch (e) { res.status(500).json({ message: e.message }); } });
app.patch('/api/notifications/read-all', auth, async (req, res) => { try { await Notification.updateMany({ userID: req.user.id, read: false }, { read: true }); res.json({ ok: true }); } catch (e) { res.status(500).json({ message: e.message }); } });
app.patch('/api/notifications/:id/read', auth, async (req, res) => { try { await Notification.findByIdAndUpdate(req.params.id, { read: true }); res.json({ ok: true }); } catch (e) { res.status(500).json({ message: e.message }); } });

/* ══════════════════════════════════════════════════════════
   CHAT — strict participant-only access
══════════════════════════════════════════════════════════ */
/* Get only THIS user's conversations */
app.get('/api/conversations', auth, async (req, res) => {
  try {
    // Only return conversations where this user is a participant
    const convs = await Conversation.find({ participants: req.user.id })
      .populate('participants', 'name avatar role')
      .populate('productID', 'cropName imageURL')
      .sort({ lastMessageAt: -1 });
    res.json(convs);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/conversations', auth, async (req, res) => {
  try {
    const { otherUserID, productID } = req.body;
    // Find existing conversation between exactly these two users for this product
    let conv = await Conversation.findOne({ participants: { $all: [req.user.id, otherUserID], $size: 2 }, productID: productID || null });
    if (!conv) conv = await Conversation.create({ participants: [req.user.id, otherUserID], productID: productID || null });
    await conv.populate('participants', 'name avatar role');
    if (productID) await conv.populate('productID', 'cropName imageURL');
    res.json(conv);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* Get messages — verify participant membership */
app.get('/api/conversations/:id/messages', auth, async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });
    // Strict: only participants can read messages
    if (!conv.participants.some(p => p.toString() === req.user.id)) {
      return res.status(403).json({ message: 'Access denied — you are not part of this conversation' });
    }
    const msgs = await Message.find({ conversationID: req.params.id }).populate('senderID', 'name avatar').sort({ createdAt: 1 }).limit(200);
    // Mark messages as read
    await Message.updateMany({ conversationID: req.params.id, senderID: { $ne: req.user.id }, read: false }, { read: true });
    await Conversation.findByIdAndUpdate(req.params.id, { [`unreadCount.${req.user.id}`]: 0 });
    res.json(msgs);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* ── Chat file upload ── */
app.post('/api/upload/chat', auth, chatUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const imageExts = /\.(jpg|jpeg|png|gif|webp)$/i;
    const fileType = imageExts.test(req.file.originalname) ? 'image' : 'file';
    const fileURL = `/uploads/${req.file.filename}`;
    res.json({ fileURL, fileType, fileName: req.file.originalname, size: req.file.size });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* ── Edit message (REST fallback — socket is primary) ── */
app.put('/api/messages/:id', auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: 'Text required' });
    const msg = await Message.findById(req.params.id);
    if (!msg) return res.status(404).json({ message: 'Message not found' });
    if (msg.senderID.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorised' });
    if (msg.deleted) return res.status(400).json({ message: 'Cannot edit deleted message' });
    msg.text = text.trim(); msg.edited = true;
    await msg.save();
    const populated = await Message.findById(msg._id).populate('senderID', 'name avatar');
    res.json(populated);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* ── Delete message (soft delete) ── */
app.delete('/api/messages/:id', auth, async (req, res) => {
  try {
    const msg = await Message.findById(req.params.id);
    if (!msg) return res.status(404).json({ message: 'Message not found' });
    if (msg.senderID.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorised' });
    msg.deleted = true; msg.text = ''; msg.fileURL = ''; msg.fileName = '';
    await msg.save();
    res.json({ deleted: true, messageID: msg._id });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* ── Order History (delivered + cancelled orders) ── */
app.get('/api/orders/history', auth, async (req, res) => {
  try {
    const filter = req.user.role === 'Farmer'
      ? { farmerID: req.user.id, status: { $in: ['Delivered', 'Cancelled'] } }
      : { consumerID: req.user.id, status: { $in: ['Delivered', 'Cancelled'] } };
    const orders = await Order.find(filter)
      .populate('productID', 'cropName imageURL price category unit')
      .populate('farmerID', 'name location phone avatar')
      .populate('consumerID', 'name location')
      .sort({ updatedAt: -1 });
    res.json(orders);
  } catch (e) { res.status(500).json({ message: e.message }); }
});



/* ══════════════════════════════════════════════════════════
   PAYMENT — eSewa (merchant: 9741677342) + COD with 25% advance
   ──────────────────────────────────────────────────────────
   eSewa account receiving all payments : 9741677342
   Production URL : https://epay.esewa.com.np
   Sandbox URL    : https://rc-epay.esewa.com.np  (default for dev)
   COD rule       : 25% advance must be paid via eSewa;
                    remaining 75% collected on delivery
══════════════════════════════════════════════════════════ */

// ── eSewa configuration ──────────────────────────────────
const ESEWA_MERCHANT_CODE = process.env.ESEWA_MERCHANT_CODE || 'EPAYTEST';
const ESEWA_SECRET_KEY = process.env.ESEWA_SECRET_KEY || '8gBm/:&EnhH.1/q';
const ESEWA_BASE_URL = process.env.ESEWA_BASE_URL || 'https://rc-epay.esewa.com.np';
const ESEWA_GATEWAY_URL = `${ESEWA_BASE_URL}/api/epay/main/v2/form`;
const ESEWA_VERIFY_URL = `${ESEWA_BASE_URL}/api/epay/transaction/status/`;
const ESEWA_ACCOUNT_NUMBER = process.env.ESEWA_ACCOUNT_NUMBER || '9741677342'; // display only
const CLIENT_BASE = process.env.CLIENT_URL || 'http://localhost:3000';

// ── Build eSewa HMAC-SHA256 signature ──────────────────────
function buildEsewaSignature(totalAmount, txnUUID, productCode) {
  return crypto
    .createHmac('sha256', ESEWA_SECRET_KEY)
    .update(`total_amount=${totalAmount},transaction_uuid=${txnUUID},product_code=${productCode}`)
    .digest('base64');
}

// ── Build complete eSewa params object ──────────────────────
function buildEsewaParams({ amount, txnUUID, successUrl, failureUrl }) {
  const totalAmount = Math.round(amount); // eSewa expects integer NPR
  return {
    amount: totalAmount,
    tax_amount: 0,
    total_amount: totalAmount,
    transaction_uuid: txnUUID,
    product_code: ESEWA_MERCHANT_CODE,
    product_service_charge: 0,
    product_delivery_charge: 0,
    success_url: successUrl,
    failure_url: failureUrl,
    signed_field_names: 'total_amount,transaction_uuid,product_code',
    signature: buildEsewaSignature(totalAmount, txnUUID, ESEWA_MERCHANT_CODE),
  };
}

/* ── ① FULL eSewa payment (100% of order total) ─────────── */
app.post('/api/payment/esewa/initiate', auth, async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.consumerID.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorised' });
    if (['Paid', 'AdvancePaid'].includes(order.paymentStatus)) return res.status(400).json({ message: 'Order already paid' });

    const txnUUID = `agri-full-${order._id}-${Date.now()}`;
    const amount = order.totalPrice;

    const params = buildEsewaParams({
      amount,
      txnUUID,
      successUrl: `${CLIENT_BASE}/payment/callback?method=esewa&type=full&orderId=${orderId}`,
      failureUrl: `${CLIENT_BASE}/payment/callback?method=esewa&status=failed&type=full&orderId=${orderId}`,
    });

    await Payment.create({ orderID: order._id, userID: req.user.id, method: 'eSewa', amount, status: 'Initiated', refId: txnUUID });
    await Order.findByIdAndUpdate(orderId, { paymentStatus: 'Initiated', paymentMethod: 'eSewa', paymentRef: txnUUID });
    res.json({ params, gatewayUrl: ESEWA_GATEWAY_URL, esewaAccount: ESEWA_ACCOUNT_NUMBER });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* ── ② VERIFY full eSewa payment (called from callback) ─── */
app.post('/api/payment/esewa/verify', auth, async (req, res) => {
  try {
    const { data: enc, orderId } = req.body;
    if (!enc) return res.status(400).json({ message: 'No data' });
    const d = JSON.parse(Buffer.from(enc, 'base64').toString('utf-8'));

    if (d.status === 'COMPLETE') {
      await Payment.findOneAndUpdate({ refId: d.transaction_uuid }, { status: 'Completed', transactionId: d.transaction_code, rawResponse: d });
      await Order.findByIdAndUpdate(orderId, { paymentStatus: 'Paid', paymentMethod: 'eSewa', paymentRef: d.transaction_code });
      const order = await Order.findById(orderId).populate('productID', 'cropName').populate('consumerID', 'name');
      if (order) {
        await sendNotification(
          order.farmerID, 'order_placed',
          '💚 eSewa Payment Received',
          `NPR ${order.totalPrice} from ${order.consumerID?.name} for ${order.productID?.cropName} — eSewa account 9741677342`,
          '/dashboard/logistics'
        );
      }
      res.json({ success: true, message: 'eSewa payment verified!', decoded: d });
    } else {
      await Order.findByIdAndUpdate(orderId, { paymentStatus: 'Failed' });
      res.json({ success: false, message: `eSewa payment status: ${d.status}` });
    }
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* ── ③ COD — initiate 25% advance via eSewa ─────────────── */
app.post('/api/payment/cod-advance/initiate', auth, async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.consumerID.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorised' });
    if (['Paid', 'AdvancePaid'].includes(order.paymentStatus)) return res.status(400).json({ message: 'Already paid' });

    const advanceAmount = Math.round(order.totalPrice * 0.25); // 25% advance
    const remainingAmount = order.totalPrice - advanceAmount;     // 75% on delivery
    const txnUUID = `agri-adv-${order._id}-${Date.now()}`;

    const params = buildEsewaParams({
      amount: advanceAmount,
      txnUUID,
      successUrl: `${CLIENT_BASE}/payment/callback?method=esewa&type=advance&orderId=${orderId}`,
      failureUrl: `${CLIENT_BASE}/payment/callback?method=esewa&status=failed&type=advance&orderId=${orderId}`,
    });

    await Payment.create({ orderID: order._id, userID: req.user.id, method: 'eSewa-Advance', amount: advanceAmount, status: 'Initiated', refId: txnUUID });
    await Order.findByIdAndUpdate(orderId, {
      paymentStatus: 'Initiated',
      paymentMethod: 'COD',
      paymentRef: txnUUID,
      advanceAmount,
      remainingAmount,
    });

    res.json({
      params,
      gatewayUrl: ESEWA_GATEWAY_URL,
      advanceAmount,
      remainingAmount,
      esewaAccount: ESEWA_ACCOUNT_NUMBER,
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* ── ④ VERIFY COD advance payment (25%) ─────────────────── */
app.post('/api/payment/cod-advance/verify', auth, async (req, res) => {
  try {
    const { data: enc, orderId } = req.body;
    if (!enc) return res.status(400).json({ message: 'No data' });
    const d = JSON.parse(Buffer.from(enc, 'base64').toString('utf-8'));

    if (d.status === 'COMPLETE') {
      await Payment.findOneAndUpdate({ refId: d.transaction_uuid }, { status: 'Completed', transactionId: d.transaction_code, rawResponse: d });
      const order = await Order.findByIdAndUpdate(
        orderId,
        { paymentStatus: 'AdvancePaid', paymentMethod: 'COD', advanceTxnRef: d.transaction_code },
        { new: true }
      ).populate('productID', 'cropName').populate('consumerID', 'name');

      if (order) {
        await sendNotification(
          order.farmerID, 'order_placed',
          '💛 COD Order — Advance Paid via eSewa',
          `${order.consumerID?.name} paid NPR ${order.advanceAmount} advance for ${order.productID?.cropName}. Collect NPR ${order.remainingAmount} on delivery.`,
          '/dashboard/logistics'
        );
      }
      res.json({ success: true, message: 'Advance payment verified! Pay the rest on delivery.', decoded: d, order });
    } else {
      await Order.findByIdAndUpdate(orderId, { paymentStatus: 'Failed' });
      res.json({ success: false, message: `eSewa advance status: ${d.status}` });
    }
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* ── ⑤ COD without advance — DISABLED (returns 400) ─────── */
app.post('/api/payment/cod', auth, async (req, res) => {
  res.status(400).json({
    message: 'Direct COD is not available. Please use COD with 25% advance via eSewa.',
    codAdvanceRequired: true,
  });
});



/* ══════════════════════════════════════════════════════════
   NEAREST FARMERS + DIJKSTRA ROUTES
══════════════════════════════════════════════════════════ */
app.get('/api/nearest-farmers', auth, async (req, res) => {
  try {
    const { lat, lng, limit = 5 } = req.query;
    if (!lat || !lng) return res.status(400).json({ message: 'lat and lng required' });
    const cLat = +lat, cLng = +lng;
    const farmers = await User.find({ role: 'Farmer' }).select('name location avatar bio').lean();
    const results = [];
    for (const f of farmers) {
      if (!f.location?.lat) continue;
      const { graph, nodeMap } = buildGraph({ lat: f.location.lat, lng: f.location.lng, label: f.name }, { lat: cLat, lng: cLng, label: 'You' });
      const result = aStar(graph, 'FARM', 'DEST', nodeMap);
      if (!result) continue;
      const waypoints = result.path.map(id => ({ id, label: nodeMap[id]?.label || id, lat: nodeMap[id]?.lat, lng: nodeMap[id]?.lng }));
      const productCount = await Product.countDocuments({ farmerID: f._id, isAvailable: true });
      const avgRatingAgg = await Product.aggregate([{ $match: { farmerID: f._id, avgRating: { $gt: 0 } } }, { $group: { _id: null, avg: { $avg: '$avgRating' } } }]);
      results.push({ farmer: { ...f, productCount, avgRating: parseFloat((avgRatingAgg[0]?.avg || 0).toFixed(1)) }, distance: result.distance, estimatedTime: fmtTime(result.distance), waypoints, directKm: parseFloat(haversineKm(cLat, cLng, f.location.lat, f.location.lng).toFixed(1)) });
    }
    results.sort((a, b) => a.distance - b.distance);
    res.json({ farmers: results.slice(0, +limit) });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/optimize-route/preview', auth, async (req, res) => { try { const { farmLat = 28.2, farmLng = 84.0, destLat = 27.7, destLng = 85.3, farmLabel, destLabel } = req.body; const { graph, nodeMap } = buildGraph({ lat: +farmLat, lng: +farmLng, label: farmLabel || 'Farm' }, { lat: +destLat, lng: +destLng, label: destLabel || 'Customer' }); const result = aStar(graph, 'FARM', 'DEST', nodeMap); if (!result) return res.status(422).json({ message: 'No route' }); const waypoints = result.path.map(id => ({ id, label: nodeMap[id]?.label || id, lat: nodeMap[id]?.lat, lng: nodeMap[id]?.lng })); res.json({ path: result.path, distance: result.distance, waypoints, estimatedTime: fmtTime(result.distance) }); } catch (e) { res.status(500).json({ message: e.message }); } });
app.get('/api/optimize-route/:orderId', auth, async (req, res) => { try { const order = await Order.findById(req.params.orderId).populate('farmerID', 'name location').populate('consumerID', 'name location').populate('productID', 'cropName location'); if (!order) return res.status(404).json({ message: 'Not found' }); const { graph, nodeMap } = buildGraph({ lat: order.productID.location.lat, lng: order.productID.location.lng, label: `${order.productID.cropName} Farm` }, { lat: order.consumerID.location?.lat || 27.7172, lng: order.consumerID.location?.lng || 85.3240, label: order.consumerID.name }); const result = aStar(graph, 'FARM', 'DEST', nodeMap); if (!result) return res.status(422).json({ message: 'No route' }); const waypoints = result.path.map(id => ({ id, label: nodeMap[id]?.label || id, lat: nodeMap[id]?.lat, lng: nodeMap[id]?.lng })); order.routeData = { path: result.path, distance: result.distance, waypoints }; await order.save(); res.json({ orderId: order._id, path: result.path, distance: result.distance, waypoints, estimatedTime: fmtTime(result.distance) }); } catch (e) { res.status(500).json({ message: e.message }); } });

/* ══════════════════════════════════════════════════════════
   ANALYTICS
══════════════════════════════════════════════════════════ */
app.get('/api/analytics', auth, async (req, res) => {
  try {
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const [totalUsers, totalFarmers, totalConsumers, totalProducts, totalOrders, totalRevenue, weekOrders, categoryDist, topProducts, dailyOrders] = await Promise.all([
      User.countDocuments(), User.countDocuments({ role: 'Farmer' }), User.countDocuments({ role: 'Consumer' }),
      Product.countDocuments({ isAvailable: true }), Order.countDocuments(),
      Order.aggregate([{ $match: { paymentStatus: 'Paid' } }, { $group: { _id: null, total: { $sum: '$totalPrice' } } }]),
      Order.countDocuments({ createdAt: { $gte: weekAgo } }),
      Product.aggregate([{ $group: { _id: '$category', count: { $sum: 1 }, avgPrice: { $avg: '$price' }, totalDemand: { $sum: '$demand' } } }]),
      Product.find({ isAvailable: true }).sort({ demand: -1 }).limit(10).select('cropName demand price category avgRating weeklySales'),
      Order.aggregate([{ $match: { createdAt: { $gte: weekAgo } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 }, revenue: { $sum: '$totalPrice' } } }, { $sort: { _id: 1 } }]),
    ]);
    const trendData = topProducts.map(p => {
      const trend = computeTrend(p.weeklySales || [0, 0, 0, 0]);
      const message = trend.direction === 'rising' ? `${p.cropName} demand is increasing 📊` : trend.direction === 'falling' ? `${p.cropName} demand is slowing` : `${p.cropName} demand is stable`;
      const pricePrediction = trend.direction === 'rising' ? 'Price may rise next week 📈' : trend.direction === 'falling' ? 'Price may drop — good time to buy' : 'Price expected to remain stable';
      return { cropName: p.cropName, category: p.category, demand: p.demand, price: p.price, avgRating: p.avgRating, trend, message, pricePrediction };
    });
    res.json({ summary: { totalUsers, totalFarmers, totalConsumers, totalProducts, totalOrders, weekOrders, totalRevenue: totalRevenue[0]?.total || 0 }, categoryDist, topProducts: trendData, dailyOrders });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/market-insights', auth, async (req, res) => { try { const [td, cd, ro] = await Promise.all([Product.find({ isAvailable: true }).sort({ demand: -1 }).limit(5).select('cropName demand price category'), Product.aggregate([{ $group: { _id: '$category', count: { $sum: 1 }, avgPrice: { $avg: '$price' } } }]), Order.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * 86400000) } })]); res.json({ topDemand: td, categoryDist: cd, recentOrders: ro }); } catch (e) { res.status(500).json({ message: e.message }); } });
app.get('/api/health', (_, res) => res.json({ status: 'OK', version: '6.1' }));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
module.exports = { app, io };
