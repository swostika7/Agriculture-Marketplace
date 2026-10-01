require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const OUT_DIR = path.join(__dirname, 'data');
const MIN_ROWS = 200;       
const MIN_POSITIVES = 20;    

const RecommendationEvent = mongoose.models.RecommendationEvent ||
  mongoose.model('RecommendationEvent', new mongoose.Schema({}, { strict:false, timestamps:true }));

const FEATURE_NAMES = [
  'contentSim', 'sameCategory', 'distanceKm', 'demand', 'price', 'avgRating', 'rank',
];

async function main() {
  console.log('Exporting learning-to-rank dataset\n' + '='.repeat(55));
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/agri-marketplace-v6');
  console.log('Connected to MongoDB\n');

  const events = await RecommendationEvent.find({}).lean();
  const impressions = events.filter(e => e.eventType === 'impression');
  const engaged = events.filter(e => e.eventType === 'click' || e.eventType === 'add_to_cart');

  console.log(`Total events:      ${events.length}`);
  console.log(`  impressions:     ${impressions.length}`);
  console.log(`  clicks/add-cart: ${engaged.length}`);

  if (impressions.length === 0) {
    console.log('\nNo impressions logged yet — nothing to export.');
    console.log('The logging pipeline is in place; this fills up as real users browse.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const ENGAGE_WINDOW_MS = 60 * 60 * 1000;
  const engagedKey = new Map();
  for (const e of engaged) {
    const k = `${e.userID}_${e.productID}`;
    if (!engagedKey.has(k)) engagedKey.set(k, []);
    engagedKey.get(k).push(new Date(e.createdAt).getTime());
  }

  const rows = impressions.map(imp => {
    const k = `${imp.userID}_${imp.productID}`;
    const impTime = new Date(imp.createdAt).getTime();
    const times = engagedKey.get(k) || [];
    const label = times.some(t => t >= impTime && t - impTime <= ENGAGE_WINDOW_MS) ? 1 : 0;
    return {
      features: [
        imp.contentSim ?? 0,
        imp.sameCategory ? 1 : 0,
        imp.distanceKm ?? -1,        // -1 = unknown location, kept distinguishable from 0km
        imp.demand ?? 0,
        imp.price ?? 0,
        imp.avgRating ?? 0,
        imp.rank ?? 0,
      ],
      label,
    };
  });

  const positives = rows.filter(r => r.label === 1).length;
  console.log(`\nUsable rows: ${rows.length}  (positives: ${positives}, negatives: ${rows.length - positives})`);

  if (rows.length < MIN_ROWS || positives < MIN_POSITIVES) {
    console.log(`\nNOT ENOUGH DATA to train a trustworthy ranker yet.`);
    console.log(`  Need at least ${MIN_ROWS} rows and ${MIN_POSITIVES} positive (clicked) examples.`);
    console.log(`  Exporting anyway so you can inspect the shape, but do NOT train on this`);
    console.log(`  and report the result as meaningful — it would just be fitting noise.`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'ranking_dataset.json'),
    JSON.stringify({ featureNames: FEATURE_NAMES, rows, exportedAt: new Date().toISOString() }, null, 2));

  const csv = [FEATURE_NAMES.join(',') + ',label',
    ...rows.map(r => r.features.join(',') + ',' + r.label)].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'ranking_dataset.csv'), csv);

  console.log(`\nWrote ${OUT_DIR}/ranking_dataset.json and .csv`);
  await mongoose.disconnect();
}

main().catch(e => { console.error('Export failed:', e); process.exit(1); });
