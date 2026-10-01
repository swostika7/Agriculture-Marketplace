require('dotenv').config();

(function checkConfig() {
  const warn = (k, hint) => console.warn(`⚠️  ${k} not set — ${hint}`);
  if (!process.env.SMTP_USER || process.env.SMTP_USER.includes('your_')) warn('SMTP_USER', 'email OTPs will fail. See AUTH_SETUP_GUIDE.md');
  if (!process.env.SMTP_PASS || process.env.SMTP_PASS.includes('your_')) warn('SMTP_PASS', 'email OTPs will fail. Use a Gmail App Password.');
  if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID.includes('your_')) warn('GOOGLE_CLIENT_ID', 'Google sign-in disabled. See AUTH_SETUP_GUIDE.md');
  if (!process.env.KHALTI_SECRET_KEY || process.env.KHALTI_SECRET_KEY.includes('your_')) warn('KHALTI_SECRET_KEY', 'Khalti payments will fail. Get a key from https://test-admin.khalti.com (sandbox) or https://admin.khalti.com (live).');
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('change_in_production')) warn('JWT_SECRET', 'using the sample secret — set a unique random value before deploying, or all signed tokens are forgeable.');
})();

const express = require('express');
const mongoose = require('mongoose');
const { predictDemand } = require('./ml/predictDemand');
const cors = require('cors');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const http = require('http');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const nodemailer = require('nodemailer');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { Server: SocketIO } = require('socket.io');
const multer = require('multer');
const rateLimit = require('express-rate-limit');

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

//nodemailer setup
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
    return { sent: true };
  } catch (e) {
    console.error(`❌ Email to ${to} FAILED — check SMTP_USER/SMTP_PASS in .env. Reason: ${e.message}`);
    return { sent: false, reason: e.message };
  }
}

function makeOTP() {

  return crypto.randomInt(100000, 1000000).toString(); // 6-digit
}


function hashOTP(otp) {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
}
const MAX_OTP_ATTEMPTS = 5; // beyond this, the code is invalidated — user must request a new one

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



if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.SERVER_URL || 'http://localhost:5000'}/api/auth/google/callback`,
    passReqToCallback: true,
  }, async (req, accessToken, refreshToken, profile, done) => {
    try {
      // existing user by googleId
      let user = await User.findOne({ googleId: profile.id });
      if (user) return done(null, user);

      // existing user by email
      const email = profile.emails?.[0]?.value?.toLowerCase() || '';
      user = await User.findOne({ email });
      if (user) {
        user.googleId = profile.id;
        user.isEmailVerified = true;
        if (!user.avatar && profile.photos?.[0]?.value) user.avatar = profile.photos[0].value;
        await user.save();
        return done(null, user);
      }

      //new user 
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
  .then(async () => {
    console.log('✅  MongoDB connected');
    
    await dedupeConversations();
  })
  .catch(e => { console.error(e); process.exit(1); });


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
  emailVerifyOTPHash: { type: String },
  emailVerifyExpiry: { type: Date },
  emailVerifyAttempts: { type: Number, default: 0 },
  // ── Password reset — same hashed-OTP + attempt-limit treatment
  resetPasswordOTPHash: { type: String },
  resetPasswordExpiry: { type: Date },
  resetPasswordAttempts: { type: Number, default: 0 },
  resetToken: { type: String },
  // ── OAuth
  googleId: { type: String },
  authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
  
  isActive: { type: Boolean, default: true },
  deactivatedAt: { type: Date },
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
// farmerID or isAvailable — without these, Mongo does a full collection scan.
Product.schema.index({ farmerID: 1 });
Product.schema.index({ isAvailable: 1, category: 1 });

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
  // COD with 25% advance via Khalti
  advanceAmount: { type: Number, default: 0 },   // 25% paid via Khalti upfront
  remainingAmount: { type: Number, default: 0 },   // 75% to be collected on delivery
  advanceTxnRef: { type: String, default: '' },  // Khalti transaction ID for advance
}, { timestamps: true }));
// FIX (perf audit): GET /api/orders always filters by one of these.
Order.schema.index({ consumerID: 1, createdAt: -1 });
Order.schema.index({ farmerID: 1, createdAt: -1 });

const CartItem = mongoose.model('CartItem', new mongoose.Schema({
  consumerID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  productID: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, default: 1, min: 1 },
}, { timestamps: true }));

CartItem.schema.index({ consumerID: 1 });
CartItem.schema.index({ consumerID: 1, productID: 1 }, { unique: true });

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
// FIX (perf audit): notification bell always queries {userID} sorted by date.
Notification.schema.index({ userID: 1, createdAt: -1 });


const RecommendationEvent = mongoose.model('RecommendationEvent', new mongoose.Schema({
  userID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  productID: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  eventType: { type: String, enum: ['impression', 'click', 'add_to_cart'], required: true },
  rank: { type: Number },   // position in the shown list (1-based)
  score: { type: Number },   // _cbfScore at impression time
  contentSim: { type: Number },
  sameCategory: { type: Boolean },
  queryCategory: { type: String },
  queryCropName: { type: String },
  distanceKm: { type: Number },
  demand: { type: Number },
  price: { type: Number },
  avgRating: { type: Number },
}, { timestamps: true }));

// Training export scans by time;
RecommendationEvent.schema.index({ createdAt: -1 });
RecommendationEvent.schema.index({ userID: 1, productID: 1, eventType: 1, createdAt: -1 });

const Conversation = mongoose.model('Conversation', new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  pairKey: { type: String, unique: true, sparse: true },
 
  productID: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  lastMessage: { type: String, default: '' },
  lastMessageAt: { type: Date, default: Date.now },
  unreadCount: { type: Map, of: Number, default: {} },
}, { timestamps: true }));
Conversation.schema.index({ participants: 1 });

function makePairKey(idA, idB) {
  return [idA.toString(), idB.toString()].sort().join('_');
}

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

Message.schema.index({ conversationID: 1, createdAt: 1 });

async function dedupeConversations() {
  try {
    const convs = await Conversation.find({}).sort({ createdAt: 1 }).lean();
    if (!convs.length) return;

    const groups = new Map(); // pairKey -> [conversations]
    for (const c of convs) {
      if (!c.participants || c.participants.length !== 2) continue;
      const key = makePairKey(c.participants[0], c.participants[1]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }

    let mergedGroups = 0, deletedConvs = 0, movedMessages = 0, backfilled = 0;

    for (const [pairKey, group] of groups) {
      const canonical = group[0]; // oldest, since we sorted by createdAt above
      const duplicates = group.slice(1);

      if (duplicates.length > 0) {
        const dupIds = duplicates.map(d => d._id);
        const moveResult = await Message.updateMany(
          { conversationID: { $in: dupIds } },
          { $set: { conversationID: canonical._id } }
        );
        movedMessages += moveResult.modifiedCount || 0;

        // Keep whichever lastMessage is actually the most recent overall
        const mostRecent = group.reduce((a, b) =>
          new Date(a.lastMessageAt || 0) > new Date(b.lastMessageAt || 0) ? a : b
        );
        await Conversation.findByIdAndUpdate(canonical._id, {
          pairKey,
          lastMessage: mostRecent.lastMessage || canonical.lastMessage,
          lastMessageAt: mostRecent.lastMessageAt || canonical.lastMessageAt,
        });
        await Conversation.deleteMany({ _id: { $in: dupIds } });
        deletedConvs += dupIds.length;
        mergedGroups++;
      } else if (!canonical.pairKey) {
        await Conversation.findByIdAndUpdate(canonical._id, { pairKey });
        backfilled++;
      }
    }

    if (mergedGroups || backfilled) {
      console.log(`🔧  Chat migration: merged ${mergedGroups} duplicate pair(s) (${deletedConvs} extra conversation(s) removed, ${movedMessages} message(s) reattached), backfilled pairKey on ${backfilled} conversation(s).`);
    }
  } catch (e) {
    console.error('⚠️  dedupeConversations migration failed (non-fatal):', e.message);
  }
}

const Payment = mongoose.model('Payment', new mongoose.Schema({
  orderID: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  userID: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  method: String, amount: Number, status: String,
  refId: String, transactionId: String, rawResponse: Object,
}, { timestamps: true }));


const SECRET = process.env.JWT_SECRET || 'dev_secret';
const signToken = u => jwt.sign({ id: u._id, role: u.role }, SECRET, { expiresIn: '7d' });
const auth = (req, res, next) => {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ message: 'No token' });
  try { req.user = jwt.verify(h.split(' ')[1], SECRET); next(); }
  catch { res.status(401).json({ message: 'Invalid token' }); }
};


const rateLimitMessage = (req, res) => res.status(429).json({ message: 'Too many attempts. Please wait a few minutes and try again.' });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, handler: rateLimitMessage }); // login, register, password-change
const otpSendLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 4, standardHeaders: true, legacyHeaders: false, handler: rateLimitMessage }); // sends a real email — stricter
const otpVerifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false, handler: rateLimitMessage }); // checking a code — per-account limit does the heavy lifting


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

const CBF_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'our', 'your', 'this', 'that', 'are', 'was',
  'fresh', 'organic', 'farm', 'premium', 'quality', 'local', 'natural', 'pure',
  'best', 'good', 'new', 'top', 'fine', 'grade', 'healthy', 'tasty', 'delicious',
  'homegrown', 'homemade', 'farmhouse', 'garden', 'field', 'harvest', 'harvested',
]);

function generateFeatureTags(name, cat) {
  const tags = [
    cat.toLowerCase(),
    ...name.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/)
      .filter(w => w.length > 2 && !CBF_STOPWORDS.has(w)),
  ];
  const syn = { Vegetable: ['veggie', 'greens'], Fruit: ['sweet', 'tropical'], Grain: ['cereal', 'staple'], Dairy: ['milk', 'cream'], Herb: ['spice', 'aromatic'], Other: ['farm'] };
  return [...new Set([...tags, ...(syn[cat] || []).slice(0, 2)])];
}

async function sendNotification(userID, type, title, body, link = '', meta = {}) {
  try {
    const n = await Notification.create({ userID, type, title, body, link, meta });
    io.to(`user_${userID}`).emit('notification', n);
    return n;
  } catch (e) { console.error('Notif:', e.message); }
}

// content-based recommendation 
function buildTFMap(tags) { const tf = {}; tags.forEach(t => { tf[t] = (tf[t] || 0) + 1; }); const n = tags.length || 1; Object.keys(tf).forEach(k => { tf[k] /= n; }); return tf; }

function buildIDF(allProducts) {
  const N = allProducts.length || 1;
  const df = {};
  for (const p of allProducts) {
    const tags = p.featureTags?.length ? p.featureTags : generateFeatureTags(p.cropName, p.category);
    for (const t of new Set(tags)) df[t] = (df[t] || 0) + 1;
  }
  const idf = {};

  for (const t in df) idf[t] = Math.log(N / (1 + df[t])) + 1;
  return idf;
}

/* Convert a tag list into an L2-normalised TF-IDF vector. */
function buildTFIDFVector(tags, idf) {
  const tf = buildTFMap(tags);
  const v = {};
  for (const t in tf) v[t] = tf[t] * (idf[t] !== undefined ? idf[t] : Math.log(2) + 1); // unseen term -> treat as maximally rare
  return v;
}


function buildUserProfileVector(viewHistory, idf) {
  const recent = (viewHistory || []).slice(-PROFILE_HISTORY_WINDOW);
  if (!recent.length) return null;
  const centroid = {};
  let weightSum = 0;
  recent.forEach((h, i) => {

    const w = i + 1;
    weightSum += w;
    const vec = buildTFIDFVector(generateFeatureTags(h.cropName || h.category || '', h.category || 'Other'), idf);
    for (const t in vec) centroid[t] = (centroid[t] || 0) + vec[t] * w;
  });
  for (const t in centroid) centroid[t] /= weightSum;
  return centroid;
}

/* Blend two sparse vectors: alpha*a + (1-alpha)*b */
function blendVectors(a, b, alpha) {
  if (!b) return a;
  if (!a) return b;
  const out = {};
  for (const t in a) out[t] = (out[t] || 0) + a[t] * alpha;
  for (const t in b) out[t] = (out[t] || 0) + b[t] * (1 - alpha);
  return out;
}
function cosineSim(a, b) { const keys = new Set([...Object.keys(a), ...Object.keys(b)]); let dot = 0, nA = 0, nB = 0; keys.forEach(k => { const av = a[k] || 0, bv = b[k] || 0; dot += av * bv; nA += av * av; nB += bv * bv; }); const d = Math.sqrt(nA) * Math.sqrt(nB); return d > 0 ? dot / d : 0; }

const CBF_WEIGHTS = {
  sameCategoryBonus: 0.5,   // added to content score when categories match
  crossCategoryDiscount: 0.25,  // content score multiplier when categories differ
  crossCategoryBonusScale: 0.2,   // location+demand multiplier when categories differ
  locationNear: 0.30,  // < 50km
  locationMid: 0.15,  // < 100km
  locationFar: 0.08,  // < 200km
  demandCapUnits: 100,
  demandMaxBonus: 0.10,
  minScoreThreshold: 0.05,

  queryWeight: 0.7,
};
// How many recent views feed the profile centroid.
const PROFILE_HISTORY_WINDOW = 20;

function contentBasedRecommend({ queryCategory, queryCropName = '', allProducts, viewHistory = [], consumerLat, consumerLng, topN = 8, excludeId = null }) {

  const idf = buildIDF(allProducts);

  const qVec = buildTFIDFVector(generateFeatureTags(queryCropName || queryCategory, queryCategory), idf);
  const profileVec = buildUserProfileVector(viewHistory, idf);

  const queryVec = blendVectors(qVec, profileVec, CBF_WEIGHTS.queryWeight);


  const profileTopCategory = (() => {
    if (!viewHistory?.length) return null;
    const counts = {};
    viewHistory.slice(-PROFILE_HISTORY_WINDOW).forEach(h => { if (h.category) counts[h.category] = (counts[h.category] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : null;
  })();

  const scored = allProducts.filter(p => p.isAvailable && p._id.toString() !== excludeId).map(p => {
    const pTags = p.featureTags?.length ? p.featureTags : generateFeatureTags(p.cropName, p.category);
    const contentSim = cosineSim(queryVec, buildTFIDFVector(pTags, idf));
    const sameCategory = p.category === queryCategory;

    let locationBonus = 0;
    if (consumerLat != null && consumerLng != null && p.location?.lat) {
      const d = haversineKm(consumerLat, consumerLng, p.location.lat, p.location.lng);
      locationBonus = d < 50 ? CBF_WEIGHTS.locationNear : d < 100 ? CBF_WEIGHTS.locationMid : d < 200 ? CBF_WEIGHTS.locationFar : 0;
    }
    const demandBonus = Math.min(p.demand || 0, CBF_WEIGHTS.demandCapUnits) / (CBF_WEIGHTS.demandCapUnits / CBF_WEIGHTS.demandMaxBonus);

    const score = sameCategory
      ? (contentSim + CBF_WEIGHTS.sameCategoryBonus) + (locationBonus + demandBonus)
      : (contentSim * CBF_WEIGHTS.crossCategoryDiscount) + (locationBonus + demandBonus) * CBF_WEIGHTS.crossCategoryBonusScale;

    // Per-item explainability — why THIS product surfaced.
    const why = [];
    if (sameCategory) why.push(`same category (${p.category})`);
    if (contentSim > 0.25) why.push('high content similarity');
    else if (contentSim > 0.05) why.push('related content');
    if (profileVec && profileTopCategory === p.category) why.push(`matches your interest in ${profileTopCategory}`);
    if (locationBonus >= CBF_WEIGHTS.locationNear) why.push('near you');
    if (demandBonus >= CBF_WEIGHTS.demandMaxBonus * 0.8) why.push('popular right now');

    return {
      ...p,
      _cbfScore: parseFloat(score.toFixed(4)),
      _sameCategory: sameCategory,
      _contentSim: parseFloat(contentSim.toFixed(4)),
      _reason: why.length ? why.join(' + ') : 'loosely related',
    };
  }).filter(p => p._cbfScore > CBF_WEIGHTS.minScoreThreshold).sort((a, b) => b._cbfScore - a._cbfScore).slice(0, topN);

  let reason;
  if (queryCropName) reason = `More ${queryCategory}s like "${queryCropName}"`;
  else if (profileTopCategory && profileTopCategory === queryCategory) reason = `Because you often browse ${profileTopCategory} products`;
  else if (queryCategory) reason = `Top ${queryCategory} picks near you`;
  else reason = 'Recommended for you';
  return { products: scored, reason, usedProfile: !!profileVec };
}
//A* pathfinding 
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


app.get('/api/auth/check-email', async (req, res) => { try { const { email } = req.query; res.json({ exists: !!(await User.exists({ email: email?.toLowerCase().trim() })) }); } catch (e) { res.status(500).json({ message: e.message }); } });

/* REGISTER — sends OTP, user not active until verified */
app.post('/api/auth/register', authLimiter, async (req, res) => {
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
      isEmailVerified: false, emailVerifyOTPHash: hashOTP(otp), emailVerifyExpiry: expiry,
      authProvider: 'local',
    });
    const mailResult = await sendMail({
      to: email,
      subject: 'Verify your AgriConnect account',
      html: OTP_HTML(otp, 'Verify Your Email',
        `Welcome to AgriConnect, ${name.trim()}! Enter the code below to activate your account.`),
    });
    if (!mailResult.sent) {
      console.error(`⚠️  Registration succeeded for ${email} but verification email FAILED to send. User is stuck until SMTP is fixed or an admin manually verifies them.`);
    }
    res.status(201).json({ needsVerification: true, email: email.toLowerCase().trim(), emailSent: mailResult.sent });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* VERIFY EMAIL OTP */
app.post('/api/auth/verify-email', otpVerifyLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase().trim() });
    if (!user) return res.status(404).json({ message: 'Account not found' });
    if (user.isEmailVerified) return res.status(400).json({ message: 'Email already verified' });
    if (!user.emailVerifyOTPHash || !user.emailVerifyExpiry) return res.status(400).json({ message: 'No active code — please request a new one' });
    if (user.emailVerifyExpiry < new Date()) return res.status(400).json({ message: 'Code expired — please request a new one' });
    if (user.emailVerifyAttempts >= MAX_OTP_ATTEMPTS) {
      user.emailVerifyOTPHash = undefined; user.emailVerifyExpiry = undefined; await user.save();
      return res.status(429).json({ message: 'Too many incorrect attempts. Please request a new code.' });
    }
    if (!otp || hashOTP(otp.trim()) !== user.emailVerifyOTPHash) {
      user.emailVerifyAttempts += 1; await user.save();
      const remaining = MAX_OTP_ATTEMPTS - user.emailVerifyAttempts;
      return res.status(400).json({ message: remaining > 0 ? `Invalid verification code. ${remaining} attempt(s) remaining.` : 'Too many incorrect attempts. Please request a new code.' });
    }
    user.isEmailVerified = true; user.emailVerifyOTPHash = undefined; user.emailVerifyExpiry = undefined; user.emailVerifyAttempts = 0;
    await user.save();
    res.json({ token: signToken(user), user: { id: user._id, name: user.name, role: user.role, language: user.language } });
  } catch (e) { console.error('[VERIFY EMAIL]', e.message); res.status(500).json({ message: 'Verification failed. Please try again.' }); }
});

/* RESEND VERIFICATION OTP */
app.post('/api/auth/resend-otp', otpSendLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase().trim() });
    if (!user) return res.status(404).json({ message: 'Account not found' });
    if (user.isEmailVerified) return res.status(400).json({ message: 'Email already verified' });
    const otp = makeOTP();
    user.emailVerifyOTPHash = hashOTP(otp); user.emailVerifyExpiry = new Date(Date.now() + 15 * 60 * 1000); user.emailVerifyAttempts = 0;
    await user.save();
    const mailResult = await sendMail({
      to: email, subject: 'Your new AgriConnect verification code',
      html: OTP_HTML(otp, 'New Verification Code', 'Here is your new verification code:')
    });
    res.json({ sent: mailResult.sent });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* LOGIN — blocks unverified emails */
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase().trim() });
    if (!user) return res.status(401).json({ message: 'No account found with this email' });
    if (user.authProvider !== 'local') return res.status(401).json({ message: `This account uses ${user.authProvider} sign-in. Please use that option.` });
    if (!(await bcrypt.compare(password, user.password || ''))) return res.status(401).json({ message: 'Incorrect password' });
    if (!user.isEmailVerified) {
      // Resend a fresh OTP
      const otp = makeOTP();
      user.emailVerifyOTPHash = hashOTP(otp); user.emailVerifyExpiry = new Date(Date.now() + 15 * 60 * 1000); user.emailVerifyAttempts = 0;
      await user.save();
      const mailResult = await sendMail({
        to: user.email, subject: 'Verify your AgriConnect account',
        html: OTP_HTML(otp, 'Verify Your Email', 'Your account is not verified yet. Use the code below to verify.')
      });
      return res.status(403).json({
        needsVerification: true,
        email: user.email,
        emailSent: mailResult.sent,
        message: mailResult.sent
          ? 'Please verify your email first. A new code has been sent.'
          : 'Please verify your email first. We could not send a new code right now — please try "Resend code" in a moment, or contact support.',
      });
    }
    res.json({ token: signToken(user), user: { id: user._id, name: user.name, role: user.role, language: user.language } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* FORGOT PASSWORD — sends OTP */
app.post('/api/auth/forgot-password', otpSendLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase().trim(), authProvider: 'local' });
    if (!user) return res.status(404).json({ message: 'No account found with this email address' });
    const otp = makeOTP();
    user.resetPasswordOTPHash = hashOTP(otp); user.resetPasswordExpiry = new Date(Date.now() + 15 * 60 * 1000); user.resetPasswordAttempts = 0;
    await user.save();
    const mailResult = await sendMail({
      to: user.email, subject: 'Reset your AgriConnect password',
      html: OTP_HTML(otp, 'Reset Your Password', 'Enter the code below to reset your AgriConnect password.')
    });
    res.json({ sent: mailResult.sent, email: user.email });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

/* VERIFY RESET OTP */
app.post('/api/auth/verify-reset-otp', otpVerifyLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase().trim() });
    if (!user) return res.status(404).json({ message: 'Account not found' });
    if (!user.resetPasswordOTPHash || !user.resetPasswordExpiry) return res.status(400).json({ message: 'No active reset code — please request a new one' });
    if (user.resetPasswordExpiry < new Date()) return res.status(400).json({ message: 'Code expired — request a new one' });
    if (user.resetPasswordAttempts >= MAX_OTP_ATTEMPTS) {
      user.resetPasswordOTPHash = undefined; user.resetPasswordExpiry = undefined; await user.save();
      return res.status(429).json({ message: 'Too many incorrect attempts. Please request a new code.' });
    }
    if (!otp || hashOTP(otp.trim()) !== user.resetPasswordOTPHash) {
      user.resetPasswordAttempts += 1; await user.save();
      const remaining = MAX_OTP_ATTEMPTS - user.resetPasswordAttempts;
      return res.status(400).json({ message: remaining > 0 ? `Invalid reset code. ${remaining} attempt(s) remaining.` : 'Too many incorrect attempts. Please request a new code.' });
    }
    // Issue a short-lived reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetToken = resetToken; user.resetPasswordOTPHash = undefined; user.resetPasswordExpiry = undefined; user.resetPasswordAttempts = 0;
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
app.get('/api/users/me', auth, async (req, res) => { try { const u = await User.findById(req.user.id); if (!u) return res.status(404).json({ message: 'Not found' }); const { password, ...safe } = u.toObject(); res.json({ ...safe, hasPassword: typeof password === 'string' && password.length > 0 }); } catch (e) { res.status(500).json({ message: e.message }); } });
app.put('/api/users/profile', auth, authLimiter, async (req, res) => {
  try {
    const { name, phone, bio, avatar, location, currentPassword, newPassword, language } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Not found' });

    if (name) user.name = name.trim();
    if (phone !== undefined) user.phone = phone;
    if (bio !== undefined) user.bio = bio;
    if (avatar !== undefined) user.avatar = avatar;
    if (language) user.language = language;
    if (location) user.location = { city: location.city || user.location.city, lat: +(location.lat ?? user.location.lat), lng: +(location.lng ?? user.location.lng) };

    let passwordChanged = false;
    if (newPassword) {
     
      if (newPassword.length < 6) return res.status(400).json({ message: 'New password must be at least 6 characters.' });

      const hasExistingPassword = typeof user.password === 'string' && user.password.length > 0;

      if (hasExistingPassword) {
        
        if (!currentPassword) return res.status(400).json({ message: 'Current password is required.' });
        const matches = await bcrypt.compare(currentPassword, user.password);
        if (!matches) return res.status(401).json({ message: 'Current password is incorrect.' });
      }
      
      user.password = await bcrypt.hash(newPassword, 10);
      passwordChanged = true;
    }

    await user.save();
    const { password, ...safe } = user.toObject();
    res.json({
      message: passwordChanged
        ? (user.authProvider === 'google' ? 'Password set successfully. You can now sign in with your email and password, or continue with Google.' : 'Password changed successfully.')
        : 'Profile updated.',
      user: { ...safe, hasPassword: typeof password === 'string' && password.length > 0 },
      passwordChanged,
    });
  } catch (e) {
    console.error('[PROFILE UPDATE]', e.message);
    res.status(500).json({ message: 'Unable to update your profile right now. Please try again.' });
  }
});
app.patch('/api/users/language', auth, async (req, res) => { try { await User.findByIdAndUpdate(req.user.id, { language: req.body.language }); res.json({ ok: true }); } catch (e) { res.status(500).json({ message: e.message }); } });

app.get('/api/products', async (req, res) => {
  try {
    const { category, season, search, consumerLat, consumerLng, page = 1, limit = 24 } = req.query;
    const filter = { isAvailable: true };
    if (category) filter.category = category;
    if (season) filter.season = season;
    if (search) filter.cropName = new RegExp(search, 'i');

    const pageNum = Math.max(+page || 1, 1);
    const pageSize = Math.min(+limit || 24, 50);
    const skip = (pageNum - 1) * pageSize;

    const [total, rawProducts] = await Promise.all([
      Product.countDocuments(filter),
      Product.find(filter).populate('farmerID', 'name location phone avatar').sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
    ]);

    let products = rawProducts;
    if (consumerLat && consumerLng) {
      const cLat = parseFloat(consumerLat), cLng = parseFloat(consumerLng);
      products = products.map(p => ({ ...p, _distKm: haversineKm(cLat, cLng, p.location.lat, p.location.lng) }));
      products.sort((a, b) => { const aN = a._distKm < 150, bN = b._distKm < 150; if (aN && !bN) return -1; if (!aN && bN) return 1; return aN ? a._distKm - b._distKm : b.demand - a.demand; });
    }

    res.json({
      products,
      pagination: { page: pageNum, limit: pageSize, total, hasMore: skip + products.length < total },
    });
  } catch (e) { res.status(500).json({ message: e.message }); }
});
 /* Recommendation Events */
app.post('/api/recommendations/event', auth, async (req, res) => {
  try {
    const { productID, eventType, rank, score, contentSim, sameCategory, queryCategory, queryCropName, distanceKm, demand, price, avgRating } = req.body;
    if (!productID || !['impression', 'click', 'add_to_cart'].includes(eventType)) {
      return res.status(400).json({ message: 'productID and a valid eventType are required' });
    }
    await RecommendationEvent.create({
      userID: req.user.id, productID, eventType, rank, score, contentSim, sameCategory,
      queryCategory, queryCropName, distanceKm, demand, price, avgRating,
    });
    res.status(204).end();
  } catch (e) {
    console.error('[rec-event]', e.message);
    res.status(204).end(); // never let analytics logging break the UI
  }
});

app.post('/api/products/recommend', async (req, res) => {
  try {
    let { category, cropName = '', consumerLat, consumerLng, viewHistory = [], excludeId } = req.body;
    const all = await Product.find({ isAvailable: true }).populate('farmerID', 'name location avatar').lean();

    if (!category) {
      if (cropName) {
        // Resolve the real category from an actual product matching this
        // name, instead of guessing from raw text with a hardcoded list.
        const match = all.find(p => p.cropName.toLowerCase().includes(cropName.toLowerCase())) ||
          all.find(p => cropName.toLowerCase().includes(p.cropName.toLowerCase()));
        category = match?.category || null;
      }
      if (!category) {
        // Still unknown — fall back to the single most popular category
        // in the actual catalog rather than a hardcoded 'Vegetable'.
        const counts = {};
        all.forEach(p => { counts[p.category] = (counts[p.category] || 0) + 1; });
        category = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Other';
      }
    }

    const { products, reason } = contentBasedRecommend({ queryCategory: category, queryCropName: cropName, allProducts: all, viewHistory, consumerLat: consumerLat ? +consumerLat : null, consumerLng: consumerLng ? +consumerLng : null, topN: 8, excludeId });
    res.json({ products, reason, count: products.length, resolvedCategory: category });
  } catch (e) { res.status(500).json({ message: e.message }); }
});
app.post('/api/products/:id/view', auth, async (req, res) => { try { const p = await Product.findByIdAndUpdate(req.params.id, { $inc: { demand: 1 } }, { new: true }).populate('farmerID', 'name location phone avatar bio'); if (!p) return res.status(404).json({ message: 'Not found' }); await User.findByIdAndUpdate(req.user.id, { $push: { viewHistory: { $each: [{ category: p.category, cropName: p.cropName }], $slice: -20 } } }); res.json(p); } catch (e) { res.status(500).json({ message: e.message }); } });
app.post('/api/products', auth, async (req, res) => {
  try {
    if (!['Farmer', 'Admin'].includes(req.user.role)) return res.status(403).json({ message: 'Only farmers can list' });
    // FIX (audit): a deactivated farmer's existing listings are hidden, but
    // without this check they could still publish brand-new ones — closing
    // that bypass so deactivation actually prevents new transactions.
    const requester = await User.findById(req.user.id).select('isActive role');
    if (requester?.role === 'Farmer' && requester?.isActive === false) return res.status(403).json({ message: 'Your account has been deactivated. Contact support.' });
    const { price, aiSuggestedPrice, discountPrice, cropName, category, quantity } = req.body; const qty = parseFloat(quantity) || 0; const p = await Product.create({ ...req.body, quantity: qty, isAvailable: qty > 0, farmerID: req.user.id, priceStatus: calcPriceStatus(price, aiSuggestedPrice, discountPrice), featureTags: generateFeatureTags(cropName || '', category || 'Other') }); res.status(201).json(p);
  } catch (e) { res.status(500).json({ message: e.message }); }
});
app.get('/api/products/farmer', auth, async (req, res) => { try { res.json(await Product.find({ farmerID: req.user.id }).sort({ createdAt: -1 })); } catch (e) { res.status(500).json({ message: e.message }); } });
app.get('/api/products/:id', async (req, res) => { try { const p = await Product.findByIdAndUpdate(req.params.id, { $inc: { demand: 1 } }, { new: true }).populate('farmerID', 'name location phone avatar bio avgRating reviewCount'); if (!p) return res.status(404).json({ message: 'Not found' }); res.json(p); } catch (e) { res.status(500).json({ message: e.message }); } });
app.put('/api/products/:id', auth, async (req, res) => { try { const p = await Product.findById(req.params.id); if (!p) return res.status(404).json({ message: 'Not found' }); if (p.farmerID.toString() !== req.user.id && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorised' }); const merged = { ...p.toObject(), ...req.body }; const qty = parseFloat(merged.quantity) || 0; const u = await Product.findByIdAndUpdate(req.params.id, { ...req.body, quantity: qty, isAvailable: qty > 0, priceStatus: calcPriceStatus(merged.price, merged.aiSuggestedPrice, merged.discountPrice), featureTags: generateFeatureTags(merged.cropName, merged.category) }, { new: true }); res.json(u); } catch (e) { res.status(500).json({ message: e.message }); } });
app.delete('/api/products/:id', auth, async (req, res) => { try { const p = await Product.findById(req.params.id); if (!p) return res.status(404).json({ message: 'Not found' }); if (p.farmerID.toString() !== req.user.id && req.user.role !== 'Admin') return res.status(403).json({ message: 'Not authorised' }); await p.deleteOne(); res.json({ message: 'Deleted' }); } catch (e) { res.status(500).json({ message: e.message }); } });

//cart routes
app.get('/api/cart', auth, async (req, res) => {
  try {
    if (req.user.role === 'Farmer') return res.status(403).json({ message: 'Farmers cannot use cart' });
    const items = await CartItem.find({ consumerID: req.user.id })
      .populate({ path: 'productID', populate: { path: 'farmerID', select: 'name location avatar' } });
    // Return ALL items (even unavailable ones) — client shows "unavailable" badge
    res.json(items);
  } catch (e) { res.status(500).json({ message: e.message }); }
});
app.post('/api/cart', auth, async (req, res) => {
  try {
    if (req.user.role === 'Farmer') return res.status(403).json({ message: 'Farmers cannot add to cart' }); const { productID, quantity = 1 } = req.body; const product = await Product.findById(productID); if (!product || !product.isAvailable) return res.status(404).json({ message: 'Product not available' }); if (product.farmerID.toString() === req.user.id) return res.status(403).json({ message: 'Cannot buy own product' });
    // FIX (audit): was find-then-create/update (a read-then-write race under
    // concurrent requests). findOneAndUpdate+upsert is atomic and pairs safely
    // with the new unique (consumerID, productID) index.
    const item = await CartItem.findOneAndUpdate(
      { consumerID: req.user.id, productID },
      { $set: { quantity: Math.min(quantity, product.quantity) } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await item.populate({ path: 'productID', populate: { path: 'farmerID', select: 'name location avatar' } });
    res.json(item);
  } catch (e) { res.status(500).json({ message: e.message }); }
});
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
    // FIX (perf audit): this used to run User.findById(req.user.id) once
    // PER cart item inside the loop below — identical query repeated N
    // times for the same, unchanging user. Fetch it once, reuse it.
    const consumer = await User.findById(req.user.id).select('name');
    const orders = [];
    for (const item of items) {
      const p = item.productID;
      if (!p || !p.isAvailable) continue;
      const qty = Math.min(item.quantity, p.quantity);
      const order = await Order.create({ farmerID: p.farmerID, consumerID: req.user.id, productID: p._id, quantity: qty, totalPrice: p.price * qty, deliveryAddress, paymentStatus: 'Unpaid' });
      const newQty = p.quantity - qty;
      await Product.findByIdAndUpdate(p._id, { quantity: newQty, isAvailable: newQty > 0, $inc: { demand: qty }, $push: { weeklySales: { $each: [qty], $slice: -4 } } });
      orders.push(order);
      await sendNotification(p.farmerID, 'order_placed', '📦 New Order Received', `${consumer?.name} ordered ${qty} ${p.unit} of ${p.cropName}`, '/dashboard/logistics', { orderId: order._id });
    }
    await CartItem.deleteMany({ consumerID: req.user.id });
    res.json({ orders, message: `${orders.length} order(s) placed — please complete payment` });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

//orders
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
    const existing = await Order.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Order not found' });
   
    if (existing.farmerID.toString() !== req.user.id && req.user.role !== 'Admin') {
      return res.status(403).json({ message: 'Not authorised to update this order' });
    }
    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true }).populate('productID', 'cropName').populate('consumerID', 'name');
    if (status === 'In-Transit') await sendNotification(order.consumerID._id, 'order_shipped', '🚚 Order On the Way!', `Your ${order.productID?.cropName} is heading to you!`, '/dashboard/logistics');
    else if (status === 'Delivered') await sendNotification(order.consumerID._id, 'order_delivered', '✅ Order Delivered!', `Your ${order.productID?.cropName} has been delivered. Please leave a review!`, '/dashboard/logistics');
    else if (status === 'Cancelled') await sendNotification(order.consumerID._id, 'order_cancelled', '❌ Order Cancelled', `Your ${order.productID?.cropName} order was cancelled.`, '/dashboard/logistics');
    res.json(order);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

//reviews
app.get('/api/reviews/:productId', async (req, res) => { try { res.json(await Review.find({ productID: req.params.productId }).populate('reviewerID', 'name avatar').sort({ createdAt: -1 })); } catch (e) { res.status(500).json({ message: e.message }); } });
app.get('/api/reviews/farmer/:farmerId', async (req, res) => { try { res.json(await Review.find({ farmerID: req.params.farmerId }).populate('reviewerID', 'name avatar').populate('productID', 'cropName').sort({ createdAt: -1 })); } catch (e) { res.status(500).json({ message: e.message }); } });
app.post('/api/reviews', auth, async (req, res) => { try { if (req.user.role === 'Farmer') return res.status(403).json({ message: 'Farmers cannot review' }); const { productID, rating, comment, orderID } = req.body; if (!rating || rating < 1 || rating > 5) return res.status(400).json({ message: 'Rating 1-5' }); const product = await Product.findById(productID); if (!product) return res.status(404).json({ message: 'Not found' }); if (await Review.findOne({ productID, reviewerID: req.user.id })) return res.status(409).json({ message: 'Already reviewed' }); const review = await Review.create({ productID, farmerID: product.farmerID, reviewerID: req.user.id, rating, comment: comment || '', orderID }); const agg = await Review.aggregate([{ $match: { productID: product._id } }, { $group: { _id: null, avg: { $avg: '$rating' }, cnt: { $sum: 1 } } }]); await Product.findByIdAndUpdate(productID, { avgRating: parseFloat((agg[0]?.avg || rating).toFixed(1)), reviewCount: agg[0]?.cnt || 1 }); const reviewer = await User.findById(req.user.id).select('name'); await sendNotification(product.farmerID, 'new_review', `⭐ New ${rating}-Star Review`, `${reviewer?.name} reviewed ${product.cropName}`, '/dashboard/farmer'); res.status(201).json(await Review.findById(review._id).populate('reviewerID', 'name avatar')); } catch (e) { res.status(500).json({ message: e.message }); } });

//notifications

app.get('/api/notifications', auth, async (req, res) => { try { const n = await Notification.find({ userID: req.user.id }).sort({ createdAt: -1 }).limit(30); res.json({ notifications: n, unread: await Notification.countDocuments({ userID: req.user.id, read: false }) }); } catch (e) { res.status(500).json({ message: e.message }); } });
app.patch('/api/notifications/read-all', auth, async (req, res) => { try { await Notification.updateMany({ userID: req.user.id, read: false }, { read: true }); res.json({ ok: true }); } catch (e) { res.status(500).json({ message: e.message }); } });
app.patch('/api/notifications/:id/read', auth, async (req, res) => { try { await Notification.findByIdAndUpdate(req.params.id, { read: true }); res.json({ ok: true }); } catch (e) { res.status(500).json({ message: e.message }); } });

//chat & messaging

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
    if (!otherUserID) return res.status(400).json({ message: 'otherUserID required' });
    if (otherUserID === req.user.id) return res.status(400).json({ message: 'Cannot start a conversation with yourself' });
  
    pairKey = makePairKey(req.user.id, otherUserID);
    const conv = await Conversation.findOneAndUpdate(
      { pairKey },
      { $setOnInsert: { participants: [req.user.id, otherUserID], pairKey, productID: productID || null } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await conv.populate('participants', 'name avatar role');
    if (conv.productID) await conv.populate('productID', 'cropName imageURL');
    res.json(conv);
  } catch (e) {
 
    if (e.code === 11000) {
      try {
        const pairKey = makePairKey(req.user.id, req.body.otherUserID);
        const conv = await Conversation.findOne({ pairKey }).populate('participants', 'name avatar role');
        if (conv) return res.json(conv);
      } catch { }
    }
    res.status(500).json({ message: e.message });
  }
});


const CHAT_PAGE_SIZE = 30;
app.get('/api/conversations/:id/messages', auth, async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ message: 'Conversation not found' });
    // Strict: only participants can read messages
    if (!conv.participants.some(p => p.toString() === req.user.id)) {
      return res.status(403).json({ message: 'Access denied — you are not part of this conversation' });
    }

    const filter = { conversationID: req.params.id };
    if (req.query.before) {
      const cursorMsg = await Message.findById(req.query.before).select('createdAt');
      if (cursorMsg) filter.createdAt = { $lt: cursorMsg.createdAt };
    }

    // Fetch newest-first for pagination, then reverse to chronological order for display
    const page = await Message.find(filter).populate('senderID', 'name avatar').sort({ createdAt: -1 }).limit(CHAT_PAGE_SIZE);
    const msgs = page.reverse();
    const hasMore = page.length === CHAT_PAGE_SIZE;

    // Mark messages as read (only relevant on the initial/latest page load)
    if (!req.query.before) {
      await Message.updateMany({ conversationID: req.params.id, senderID: { $ne: req.user.id }, read: false }, { read: true });
      await Conversation.findByIdAndUpdate(req.params.id, { [`unreadCount.${req.user.id}`]: 0 });
    }

    res.json({ messages: msgs, hasMore });
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

/*Edit message */
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

/* Delete message*/
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

/* Order History (delivered + cancelled orders) */
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


// Khalti payment integration
const KHALTI_SECRET_KEY = process.env.KHALTI_SECRET_KEY || 'test_secret_key_dc74e0fd57cb46cd93832aee0a390791';
const KHALTI_BASE_URL = process.env.KHALTI_BASE_URL || 'https://a.khalti.com';
const CLIENT_BASE = process.env.CLIENT_URL || 'http://localhost:3000';

// khalti api request helper
async function khaltiRequest(endpoint, payload) {
  const resp = await axios.post(`${KHALTI_BASE_URL}${endpoint}`, payload, {
    headers: {
      'Authorization': `Key ${KHALTI_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  return resp.data;
}

// initiate full Khalti payment (called from client)
app.post('/api/payment/khalti/initiate', auth, async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findById(orderId)
      .populate('productID', 'cropName')
      .populate('consumerID', 'name email phone');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.consumerID._id.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorised' });
    if (['Paid', 'AdvancePaid'].includes(order.paymentStatus)) return res.status(400).json({ message: 'Order already paid' });

    const amountPaisa = Math.round(order.totalPrice * 100); // Khalti uses paisa
    const txnRef = `agri-full-${order._id}-${Date.now()}`;

    const payload = {
      return_url: `${CLIENT_BASE}/payment/callback?method=khalti&type=full&orderId=${orderId}`,
      website_url: CLIENT_BASE,
      amount: amountPaisa,
      purchase_order_id: txnRef,
      purchase_order_name: `AgriConnect - ${order.productID?.cropName || 'Order'}`,
      customer_info: {
        name: order.consumerID?.name || 'Customer',
        email: order.consumerID?.email || '',
        phone: order.consumerID?.phone || '',
      },
    };

    const khaltiResp = await khaltiRequest('/api/v2/epayment/initiate/', payload);
    // khaltiResp: { pidx, payment_url, expires_at, expires_in }

    await Payment.create({
      orderID: order._id, userID: req.user.id,
      method: 'Khalti', amount: order.totalPrice,
      status: 'Initiated', refId: khaltiResp.pidx,
    });
    await Order.findByIdAndUpdate(orderId, {
      paymentStatus: 'Initiated', paymentMethod: 'Khalti', paymentRef: txnRef,
    });

    res.json({ paymentUrl: khaltiResp.payment_url, pidx: khaltiResp.pidx });
  } catch (e) {
    console.error('[Khalti initiate]', e.response?.data || e.message);
    res.status(502).json({ message: 'Could not start Khalti payment right now. Please try again shortly.' });
  }
});

// verify Khalti payment (called from client after user completes payment)
app.post('/api/payment/khalti/verify', auth, async (req, res) => {
  try {
    const { pidx, orderId } = req.body;
    if (!pidx || !orderId) return res.status(400).json({ message: 'pidx and orderId are required' });

    // Prevent duplicate processing
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.consumerID.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorised' });
    if (order.paymentStatus === 'Paid') return res.json({ success: true, message: 'Already paid', alreadyVerified: true });

    // Server-to-server verification with Khalti
    const lookup = await khaltiRequest('/api/v2/epayment/lookup/', { pidx });
    // lookup: { pidx, total_amount, status, transaction_id, fee, refunded }

    if (lookup.status !== 'Completed') {
      await Order.findByIdAndUpdate(orderId, { paymentStatus: 'Failed' });
      return res.json({ success: false, message: `Payment status: ${lookup.status}` });
    }

    // Validate amount (Khalti returns paisa)
    const expectedPaisa = Math.round(order.totalPrice * 100);
    if (lookup.total_amount !== expectedPaisa) {
      console.error(`[Khalti] Amount mismatch: expected ${expectedPaisa}, got ${lookup.total_amount}`);
      return res.status(400).json({ success: false, message: 'Payment amount mismatch. Please contact support.' });
    }

    await Payment.findOneAndUpdate(
      { refId: pidx },
      { status: 'Completed', transactionId: lookup.transaction_id, rawResponse: lookup },
    );
    await Order.findByIdAndUpdate(orderId, {
      paymentStatus: 'Paid', paymentMethod: 'Khalti', paymentRef: lookup.transaction_id,
    });

    const populated = await Order.findById(orderId).populate('productID', 'cropName').populate('consumerID', 'name');
    if (populated) {
      await sendNotification(
        populated.farmerID, 'order_placed',
        '💜 Khalti Payment Received',
        `NPR ${populated.totalPrice} from ${populated.consumerID?.name} for ${populated.productID?.cropName}`,
        '/dashboard/logistics'
      );
    }
    res.json({ success: true, message: 'Khalti payment verified!', transactionId: lookup.transaction_id });
  } catch (e) {
    console.error('[Khalti verify]', e.response?.data || e.message);
    res.status(502).json({ message: 'Could not verify Khalti payment right now. If you were charged, contact support with your order ID.' });
  }
});

// initiate 25% advance via Khalti
app.post('/api/payment/cod-advance/initiate', auth, async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findById(orderId)
      .populate('productID', 'cropName')
      .populate('consumerID', 'name email phone');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.consumerID._id.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorised' });
    if (['Paid', 'AdvancePaid'].includes(order.paymentStatus)) return res.status(400).json({ message: 'Already paid' });

    const advanceAmount = Math.round(order.totalPrice * 0.25);
    const remainingAmount = order.totalPrice - advanceAmount;
    const advancePaisa = Math.round(advanceAmount * 100);  // Khalti uses paisa
    const txnRef = `agri-adv-${order._id}-${Date.now()}`;

    const payload = {
      return_url: `${CLIENT_BASE}/payment/callback?method=khalti&type=advance&orderId=${orderId}`,
      website_url: CLIENT_BASE,
      amount: advancePaisa,
      purchase_order_id: txnRef,
      purchase_order_name: `AgriConnect COD Advance - ${order.productID?.cropName || 'Order'}`,
      customer_info: {
        name: order.consumerID?.name || 'Customer',
        email: order.consumerID?.email || '',
        phone: order.consumerID?.phone || '',
      },
    };

    const khaltiResp = await khaltiRequest('/api/v2/epayment/initiate/', payload);

    await Payment.create({
      orderID: order._id, userID: req.user.id,
      method: 'Khalti-Advance', amount: advanceAmount,
      status: 'Initiated', refId: khaltiResp.pidx,
    });
    await Order.findByIdAndUpdate(orderId, {
      paymentStatus: 'Initiated', paymentMethod: 'COD', paymentRef: txnRef,
      advanceAmount, remainingAmount,
    });

    res.json({ paymentUrl: khaltiResp.payment_url, pidx: khaltiResp.pidx, advanceAmount, remainingAmount });
  } catch (e) {
    console.error('[Khalti COD advance initiate]', e.response?.data || e.message);
    res.status(502).json({ message: 'Could not start the Khalti advance payment right now. Please try again shortly.' });
  }
});

//verify 25% advance via Khalti 
app.post('/api/payment/cod-advance/verify', auth, async (req, res) => {
  try {
    const { pidx, orderId } = req.body;
    if (!pidx || !orderId) return res.status(400).json({ message: 'pidx and orderId are required' });

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.consumerID.toString() !== req.user.id) return res.status(403).json({ message: 'Not authorised' });
    if (order.paymentStatus === 'AdvancePaid') return res.json({ success: true, message: 'Advance already verified', alreadyVerified: true, order });

    // Server-to-server verification with Khalti
    const lookup = await khaltiRequest('/api/v2/epayment/lookup/', { pidx });

    if (lookup.status !== 'Completed') {
      await Order.findByIdAndUpdate(orderId, { paymentStatus: 'Failed' });
      return res.json({ success: false, message: `Advance payment status: ${lookup.status}` });
    }

    // Validate advance amount
    const expectedPaisa = Math.round(order.advanceAmount * 100);
    if (lookup.total_amount !== expectedPaisa) {
      console.error(`[Khalti COD] Amount mismatch: expected ${expectedPaisa}, got ${lookup.total_amount}`);
      return res.status(400).json({ success: false, message: 'Advance amount mismatch. Please contact support.' });
    }

    await Payment.findOneAndUpdate(
      { refId: pidx },
      { status: 'Completed', transactionId: lookup.transaction_id, rawResponse: lookup },
    );
    const updated = await Order.findByIdAndUpdate(
      orderId,
      { paymentStatus: 'AdvancePaid', paymentMethod: 'COD', advanceTxnRef: lookup.transaction_id },
      { new: true }
    ).populate('productID', 'cropName').populate('consumerID', 'name');

    if (updated) {
      await sendNotification(
        updated.farmerID, 'order_placed',
        '💜 COD Order — Advance Paid via Khalti',
        `${updated.consumerID?.name} paid NPR ${updated.advanceAmount} advance for ${updated.productID?.cropName}. Collect NPR ${updated.remainingAmount} on delivery.`,
        '/dashboard/logistics'
      );
    }
    res.json({ success: true, message: 'Advance verified! Pay the rest on delivery.', transactionId: lookup.transaction_id, order: updated });
  } catch (e) {
    console.error('[Khalti COD advance verify]', e.response?.data || e.message);
    res.status(502).json({ message: 'Could not verify the Khalti advance payment right now. If you were charged, contact support with your order ID.' });
  }
});

// COD without advance is not allowed — must use Khalti advance first
app.post('/api/payment/cod', auth, async (req, res) => {
  res.status(400).json({
    message: 'Direct COD without advance is not available. Please use COD with 25% Khalti advance.',
    codAdvanceRequired: true,
  });
});

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'Admin') return res.status(403).json({ message: 'Admin access required' });
  next();
};


// load every farmer's full profile at once.
app.get('/api/admin/farmers', auth, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const pageNum = Math.max(+page || 1, 1);
    const pageSize = Math.min(+limit || 20, 50);
    const filter = { role: 'Farmer' };
    if (search) filter.name = new RegExp(search, 'i');
    const [total, farmers] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter).select('name email phone avatar location isActive deactivatedAt createdAt')
        .sort({ createdAt: -1 }).skip((pageNum - 1) * pageSize).limit(pageSize).lean(),
    ]);
    // One aggregation for all their product counts, instead of N queries
    const farmerIds = farmers.map(f => f._id);
    const counts = await Product.aggregate([
      { $match: { farmerID: { $in: farmerIds } } },
      { $group: { _id: '$farmerID', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map(c => [c._id.toString(), c.count]));
    const withCounts = farmers.map(f => ({ ...f, productCount: countMap.get(f._id.toString()) || 0 }));
    res.json({ farmers: withCounts, pagination: { page: pageNum, limit: pageSize, total, hasMore: (pageNum * pageSize) < total } });
  } catch (e) { res.status(500).json({ message: e.message }); }
});


app.patch('/api/admin/farmers/:id/deactivate', auth, requireAdmin, async (req, res) => {
  try {
    const farmer = await User.findOne({ _id: req.params.id, role: 'Farmer' });
    if (!farmer) return res.status(404).json({ message: 'Farmer not found' });
    farmer.isActive = false;
    farmer.deactivatedAt = new Date();
    await farmer.save();
    const productsResult = await Product.updateMany({ farmerID: farmer._id }, { isAvailable: false });
    console.log(`[ADMIN] Farmer ${farmer._id} deactivated by admin ${req.user.id} — ${productsResult.modifiedCount} product(s) hidden`);
    res.json({ message: 'Farmer deactivated', hiddenProducts: productsResult.modifiedCount });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.patch('/api/admin/farmers/:id/reactivate', auth, requireAdmin, async (req, res) => {
  try {
    const farmer = await User.findOne({ _id: req.params.id, role: 'Farmer' });
    if (!farmer) return res.status(404).json({ message: 'Farmer not found' });
    farmer.isActive = true;
    farmer.deactivatedAt = undefined;
    await farmer.save();
 
    res.json({ message: 'Farmer reactivated' });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/nearest-farmers', auth, async (req, res) => {
  try {
    const { lat, lng, limit = 5 } = req.query;
    if (!lat || !lng) return res.status(400).json({ message: 'lat and lng required' });
    const cLat = +lat, cLng = +lng;
    const requestedLimit = Math.min(+limit || 5, 50);

    const farmers = await User.find({ role: 'Farmer', isActive: { $ne: false }, 'location.lat': { $exists: true, $ne: null } })
      .select('name location avatar bio').lean();

  
    const CANDIDATE_CAP = Math.max(requestedLimit * 4, 20);
    const withDirect = farmers.map(f => ({ f, directKm: haversineKm(cLat, cLng, f.location.lat, f.location.lng) }));
    withDirect.sort((a, b) => a.directKm - b.directKm);
    const candidates = withDirect.slice(0, CANDIDATE_CAP);

    // ONE query for product counts + ratings across ALL candidates,
    // instead of 2 separate queries per farmer.
    const farmerIds = candidates.map(c => c.f._id);
    const stats = await Product.aggregate([
      { $match: { farmerID: { $in: farmerIds }, isAvailable: true } },
      { $group: { _id: '$farmerID', productCount: { $sum: 1 }, avgRating: { $avg: { $cond: [{ $gt: ['$avgRating', 0] }, '$avgRating', null] } } } },
    ]);
    const statsById = new Map(stats.map(s => [s._id.toString(), s]));

    const results = candidates.map(({ f, directKm }) => {
      const { graph, nodeMap } = buildGraph({ lat: f.location.lat, lng: f.location.lng, label: f.name }, { lat: cLat, lng: cLng, label: 'You' });
      const result = aStar(graph, 'FARM', 'DEST', nodeMap);
      if (!result) return null;
      const waypoints = result.path.map(id => ({ id, label: nodeMap[id]?.label || id, lat: nodeMap[id]?.lat, lng: nodeMap[id]?.lng }));
      const s = statsById.get(f._id.toString());
      return {
        farmer: { ...f, productCount: s?.productCount || 0, avgRating: parseFloat((s?.avgRating || 0).toFixed(1)) },
        distance: result.distance,
        estimatedTime: fmtTime(result.distance),
        waypoints,
        directKm: parseFloat(directKm.toFixed(1)),
      };
    }).filter(Boolean);

    results.sort((a, b) => a.distance - b.distance);
    res.json({ farmers: results.slice(0, requestedLimit) });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/optimize-route/preview', auth, async (req, res) => { try { const { farmLat = 28.2, farmLng = 84.0, destLat = 27.7, destLng = 85.3, farmLabel, destLabel } = req.body; const { graph, nodeMap } = buildGraph({ lat: +farmLat, lng: +farmLng, label: farmLabel || 'Farm' }, { lat: +destLat, lng: +destLng, label: destLabel || 'Customer' }); const result = aStar(graph, 'FARM', 'DEST', nodeMap); if (!result) return res.status(422).json({ message: 'No route' }); const waypoints = result.path.map(id => ({ id, label: nodeMap[id]?.label || id, lat: nodeMap[id]?.lat, lng: nodeMap[id]?.lng })); res.json({ path: result.path, distance: result.distance, waypoints, estimatedTime: fmtTime(result.distance) }); } catch (e) { res.status(500).json({ message: e.message }); } });
app.get('/api/optimize-route/:orderId', auth, async (req, res) => { try { const order = await Order.findById(req.params.orderId).populate('farmerID', 'name location').populate('consumerID', 'name location').populate('productID', 'cropName location'); if (!order) return res.status(404).json({ message: 'Not found' }); const { graph, nodeMap } = buildGraph({ lat: order.productID.location.lat, lng: order.productID.location.lng, label: `${order.productID.cropName} Farm` }, { lat: order.consumerID.location?.lat || 27.7172, lng: order.consumerID.location?.lng || 85.3240, label: order.consumerID.name }); const result = aStar(graph, 'FARM', 'DEST', nodeMap); if (!result) return res.status(422).json({ message: 'No route' }); const waypoints = result.path.map(id => ({ id, label: nodeMap[id]?.label || id, lat: nodeMap[id]?.lat, lng: nodeMap[id]?.lng })); order.routeData = { path: result.path, distance: result.distance, waypoints }; await order.save(); res.json({ orderId: order._id, path: result.path, distance: result.distance, waypoints, estimatedTime: fmtTime(result.distance) }); } catch (e) { res.status(500).json({ message: e.message }); } });


app.get('/api/ml/demand-forecast/:productId', auth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId).select('farmerID');
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.farmerID.toString() !== req.user.id && req.user.role !== 'Admin') {
      return res.status(403).json({ message: 'Not authorised to view this product\'s forecast' });
    }
    const result = await predictDemand(Order, Product, req.params.productId);
    res.json(result);
  } catch (e) {
    console.error('[ML demand-forecast]', e.message);
    res.status(500).json({ message: 'Could not generate a forecast right now.' });
  }
});

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
      return { _id: p._id, cropName: p.cropName, category: p.category, demand: p.demand, price: p.price, avgRating: p.avgRating, trend, message, pricePrediction };
    });
    res.json({ summary: { totalUsers, totalFarmers, totalConsumers, totalProducts, totalOrders, weekOrders, totalRevenue: totalRevenue[0]?.total || 0 }, categoryDist, topProducts: trendData, dailyOrders });
  } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/market-insights', auth, async (req, res) => { try { const [td, cd, ro] = await Promise.all([Product.find({ isAvailable: true }).sort({ demand: -1 }).limit(5).select('cropName demand price category'), Product.aggregate([{ $group: { _id: '$category', count: { $sum: 1 }, avgPrice: { $avg: '$price' } } }]), Order.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * 86400000) } })]); res.json({ topDemand: td, categoryDist: cd, recentOrders: ro }); } catch (e) { res.status(500).json({ message: e.message }); } });
app.get('/api/health', (_, res) => res.json({ status: 'OK', version: '6.1' }));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀  AgriConnect v6.1 on http://localhost:${PORT}`));
module.exports = { app, io };
