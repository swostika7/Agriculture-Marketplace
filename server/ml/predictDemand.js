const fs = require('fs');
const path = require('path');
const { RandomForestRegression } = require('ml-random-forest');
const { CATEGORY_ENCODING, WINDOW_SIZE } = require('./prepareData');

const MODEL_PATH = path.join(__dirname, 'model', 'random_forest_demand.json');
const META_PATH  = path.join(__dirname, 'model', 'metadata.json');

let cachedModel = null;
let cachedMeta = null;

function loadModel() {
 
  if (!fs.existsSync(MODEL_PATH) || !fs.existsSync(META_PATH)) return null;
  const mtime = fs.statSync(MODEL_PATH).mtimeMs;
  if (cachedModel && cachedModel._mtime === mtime) return cachedModel;

  const modelJSON = JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8'));
  cachedMeta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
  cachedModel = RandomForestRegression.load(modelJSON);
  cachedModel._mtime = mtime;
  return cachedModel;
}

function getIsoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * @param {mongoose.Model} Order
 * @param {mongoose.Model} Product
 * @param {string} productId
 */
async function predictDemand(Order, Product, productId) {
  const model = loadModel();
  if (!model) {
    return { insufficientData: true, reason: 'No trained model exists yet. Run `node server/ml/trainModel.js` once there is enough order history.' };
  }

  const product = await Product.findById(productId).select('cropName category price discountPrice avgRating demand').lean();
  if (!product) return { insufficientData: true, reason: 'Product not found.' };

  const recentWeeks = await Order.aggregate([
    { $match: { productID: product._id, status: { $ne: 'Cancelled' } } },
    { $group: { _id: { y: { $isoWeekYear: '$createdAt' }, w: { $isoWeek: '$createdAt' } }, quantity: { $sum: '$quantity' } } },
    { $sort: { '_id.y': -1, '_id.w': -1 } },
    { $limit: WINDOW_SIZE },
  ]);

  if (recentWeeks.length < WINDOW_SIZE) {
    return {
      insufficientData: true,
      reason: `This product only has ${recentWeeks.length} week(s) of real order history — at least ${WINDOW_SIZE} are needed to predict its next period.`,
      productId, productName: product.cropName, currentDemand: product.demand || 0,
    };
  }

  // recentWeeks is newestfirst
  const qtys = recentWeeks.reverse().map(w => w.quantity);
  const rollingAvg3 = parseFloat((qtys.reduce((a,b)=>a+b,0) / WINDOW_SIZE).toFixed(2));
  const nowWeek = getIsoWeek(new Date());

  const features = [
    qtys[0], qtys[1], qtys[2], rollingAvg3,
    CATEGORY_ENCODING[product.category] ?? CATEGORY_ENCODING.Other,
    product.price || 0,
    product.discountPrice ? 1 : 0,
    product.avgRating || 0,
    nowWeek,
  ];

  const [predictedDemand] = model.predict([features]);

  return {
    insufficientData: false,
    productId,
    productName: product.cropName,
    currentDemand: qtys[qtys.length - 1], // most recent completed period's actual demand
    predictedDemand: Math.max(0, parseFloat(predictedDemand.toFixed(1))), // demand can't be negative
    predictionPeriod: 'next_week',
    modelName: cachedMeta.modelName,
    modelVersion: cachedMeta.modelVersion,
    // Honest, not invented: this is the model's OVERALL test-set R² from
    // training time, not a per-prediction confidence score. Only surfaced
    // when it's a real, positive, meaningful number.
    modelTestR2: cachedMeta.metrics.r2 > 0 ? cachedMeta.metrics.r2 : null,
    trainedAt: cachedMeta.trainedAt,
  };
}

module.exports = { predictDemand, loadModel };
