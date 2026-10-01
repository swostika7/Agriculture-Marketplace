require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { RandomForestRegression } = require('ml-random-forest');
const { prepareTrainingData } = require('./prepareData');

const MODEL_DIR = path.join(__dirname, 'model');
const MODEL_PATH = path.join(MODEL_DIR, 'random_forest_demand.json');
const META_PATH = path.join(MODEL_DIR, 'metadata.json');


const Order = mongoose.models.Order || mongoose.model('Order', new mongoose.Schema({
  productID: mongoose.Schema.Types.ObjectId, quantity: Number, status: String,
}, { timestamps: true, strict: false }));
const Product = mongoose.models.Product || mongoose.model('Product', new mongoose.Schema({
  category: String, price: Number, discountPrice: Number, avgRating: Number,
}, { strict: false }));

// Real regression metrics standard formulas, nothing approximated
function mae(yTrue, yPred) {
  return yTrue.reduce((s, y, i) => s + Math.abs(y - yPred[i]), 0) / yTrue.length;
}
function rmse(yTrue, yPred) {
  return Math.sqrt(yTrue.reduce((s, y, i) => s + (y - yPred[i]) ** 2, 0) / yTrue.length);
}
function r2(yTrue, yPred) {
  const mean = yTrue.reduce((a, b) => a + b, 0) / yTrue.length;
  const ssRes = yTrue.reduce((s, y, i) => s + (y - yPred[i]) ** 2, 0);
  const ssTot = yTrue.reduce((s, y) => s + (y - mean) ** 2, 0);
  return ssTot === 0 ? (ssRes === 0 ? 1 : 0) : 1 - ssRes / ssTot;
}

function chooseHyperparams(trainSize) {
  return {
    nEstimators: Math.min(150, Math.max(20, trainSize * 2)),
    maxDepth: Math.min(10, Math.max(3, Math.round(Math.log2(trainSize + 1)) + 2)),
    minNumSamples: Math.max(2, Math.round(trainSize * 0.05)),
  };
}

async function main() {
  console.log(' Random Forest demand-prediction training\n' + '='.repeat(60));
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/agri-marketplace-v6');
  console.log('✅ Connected to MongoDB\n');

  const data = await prepareTrainingData(Order, Product);
  console.log('Data preparation stats:', JSON.stringify(data.stats, null, 2));

  if (data.insufficientData) {
    console.log('\n❌ INSUFFICIENT HISTORICAL DATA — no model was trained or saved.');
    console.log(`   Reason: ${data.reason}`);
    console.log(`   Minimum required: ${require('./prepareData').MIN_WEEKS_PER_PRODUCT}+ weeks of real, non-cancelled orders per product.`);
    console.log('   The API will correctly report this to the frontend instead of a fake prediction.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const { trainRows, testRows, featureNames } = data;
  const xTrain = trainRows.map(r => r.features);
  const yTrain = trainRows.map(r => r.target);
  const xTest = testRows.map(r => r.features);
  const yTest = testRows.map(r => r.target);

  const hp = chooseHyperparams(trainRows.length);
  console.log(`\nTraining on ${trainRows.length} rows, testing on ${testRows.length} rows (time-aware split — test rows are strictly the most recent periods).`);
  console.log('Hyperparameters (scaled to dataset size):', hp);

  const rf = new RandomForestRegression({
    nEstimators: hp.nEstimators,
    maxFeatures: 0.8,
    replacement: true,
    seed: 42,
    treeOptions: { maxDepth: hp.maxDepth, minNumSamples: hp.minNumSamples },
  });

  const trainStart = Date.now();
  rf.train(xTrain, yTrain);
  const trainMs = Date.now() - trainStart;

  const predictions = rf.predict(xTest);
  const metrics = {
    mae: parseFloat(mae(yTest, predictions).toFixed(3)),
    rmse: parseFloat(rmse(yTest, predictions).toFixed(3)),
    r2: parseFloat(r2(yTest, predictions).toFixed(3)),
  };

  console.log('\n' + '='.repeat(60));
  console.log('EVALUATION (on held-out, most-recent real orders — never seen during training):');
  console.log(`  MAE  (mean absolute error):        ${metrics.mae}  units`);
  console.log(`  RMSE (root mean squared error):    ${metrics.rmse}  units`);
  console.log(`  R²   (variance explained):         ${metrics.r2}`);
  console.log('='.repeat(60));

  if (metrics.r2 < 0) {
    console.log('\n⚠️  R² is negative — the model performs WORSE than simply predicting');
    console.log('   the average demand every time. With this little data that is not');
    console.log('   surprising; it means the model is not yet reliable. It will still');
    console.log('   be saved (so the pipeline itself can be verified end-to-end), but');
    console.log('   the API should not be trusted for real decisions until it is');
    console.log('   retrained on more order history and R² is meaningfully positive.');
  }

  fs.mkdirSync(MODEL_DIR, { recursive: true });
  fs.writeFileSync(MODEL_PATH, JSON.stringify(rf.toJSON()));
  fs.writeFileSync(META_PATH, JSON.stringify({
    modelName: 'RandomForestRegression',
    modelVersion: `v${Date.now()}`,
    trainedAt: new Date().toISOString(),
    featureNames,
    hyperparameters: hp,
    trainRows: trainRows.length,
    testRows: testRows.length,
    metrics,
    trainDurationMs: trainMs,
    library: 'ml-random-forest@' + require('ml-random-forest/package.json').version,
  }, null, 2));

  console.log(`\n Model saved to ${MODEL_PATH}`);
  console.log(` Metadata saved to ${META_PATH}`);
  await mongoose.disconnect();
}

main().catch(e => { console.error('Training failed:', e); process.exit(1); });
