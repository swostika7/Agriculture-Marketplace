const CATEGORY_ENCODING = { Vegetable:0, Fruit:1, Grain:2, Dairy:3, Herb:4, Other:5 };
const WINDOW_SIZE = 3;        // use the last 3 periods to predict the next
const MIN_WEEKS_PER_PRODUCT = WINDOW_SIZE + 2; // need >= 5 real weeks to get >=2 usable rows per product
const TRAIN_FRACTION = 0.8;

/**
 * @param {mongoose.Model} Order
 * @param {mongoose.Model} Product
 * @returns {Promise<{rows, featureNames, insufficientData, reason, stats}>}
 */
async function prepareTrainingData(Order, Product) {
  const featureNames = [
    'qty_t-3', 'qty_t-2', 'qty_t-1', 'rollingAvg3',
    'categoryEncoded', 'price', 'hasDiscount', 'avgRating', 'isoWeekOfYear',
  ];

//product weekly demand aggregation 
  const weekly = await Order.aggregate([
    { $match: { status: { $ne: 'Cancelled' } } },
    { $group: {
        _id: { productID: '$productID', y: { $isoWeekYear: '$createdAt' }, w: { $isoWeek: '$createdAt' } },
        quantity: { $sum: '$quantity' },
      } },
    { $sort: { '_id.productID': 1, '_id.y': 1, '_id.w': 1 } },
  ]);

  if (weekly.length === 0) {
    return { rows: [], featureNames, insufficientData: true,
      reason: 'No non-cancelled orders exist yet — there is no demand history to learn from.',
      stats: { totalWeeklyBuckets: 0, productsWithEnoughHistory: 0 } };
  }

  // group into per-product chronological order
  const byProduct = new Map();
  for (const row of weekly) {
    const pid = row._id.productID.toString();
    if (!byProduct.has(pid)) byProduct.set(pid, []);
    byProduct.get(pid).push({ year: row._id.y, week: row._id.w, quantity: row.quantity });
  }

  //ONE query for all product
  const productIds = [...byProduct.keys()];
  const products = await Product.find({ _id: { $in: productIds } })
    .select('category price discountPrice avgRating').lean();
  const productById = new Map(products.map(p => [p._id.toString(), p]));

  //build sliding-window rows per product, chronological order
  const rows = [];
  let productsWithEnoughHistory = 0;
  for (const [pid, series] of byProduct) {
    if (series.length < MIN_WEEKS_PER_PRODUCT) continue; // not enough real history
    const product = productById.get(pid);
    if (!product) continue; // product was deleted can't build features for it

    productsWithEnoughHistory++;
    for (let i = WINDOW_SIZE; i < series.length; i++) {
      const window = series.slice(i - WINDOW_SIZE, i); // t-3, t-2, t-1 —before the target
      const target = series[i];                        // t — the period we're predicting
      const qtys = window.map(w => w.quantity);
      rows.push({
        productID: pid,
        year: target.year, week: target.week,           // kept for chronological sorting/splitting, not used as a feature
        features: [
          qtys[0], qtys[1], qtys[2],
          parseFloat((qtys.reduce((a,b)=>a+b,0) / WINDOW_SIZE).toFixed(2)),
          CATEGORY_ENCODING[product.category] ?? CATEGORY_ENCODING.Other,
          product.price || 0,
          product.discountPrice ? 1 : 0,
          product.avgRating || 0,
          target.week,
        ],
        target: target.quantity,
      });
    }
  }

  if (rows.length < 10 || productsWithEnoughHistory === 0) {
    return { rows, featureNames, insufficientData: true,
      reason: `Only ${productsWithEnoughHistory} product(s) have ${MIN_WEEKS_PER_PRODUCT}+ weeks of real order history ` +
              `(${rows.length} usable training row(s) total). A Random Forest trained on this few examples would just ` +
              `memorize noise, not learn a real pattern — collect more order history before training.`,
      stats: { totalWeeklyBuckets: weekly.length, productsWithEnoughHistory, usableRows: rows.length } };
  }

  // sort chronologically
  // most recent rows test. Never a random shuffle for time-series data.
  rows.sort((a,b) => a.year - b.year || a.week - b.week);
  const splitIndex = Math.floor(rows.length * TRAIN_FRACTION);
  const trainRows = rows.slice(0, splitIndex);
  const testRows  = rows.slice(splitIndex);

  return {
    rows, trainRows, testRows, featureNames,
    insufficientData: testRows.length === 0 || trainRows.length === 0,
    reason: testRows.length === 0 ? 'Not enough rows to hold out a real time-aware test split.' : null,
    stats: {
      totalWeeklyBuckets: weekly.length,
      productsWithEnoughHistory,
      usableRows: rows.length,
      trainRows: trainRows.length,
      testRows: testRows.length,
    },
  };
}

module.exports = { prepareTrainingData, CATEGORY_ENCODING, WINDOW_SIZE, MIN_WEEKS_PER_PRODUCT, TRAIN_FRACTION };
