/**
 * Recommendation system test suite.
 *
 * Run with: node server/test/recommendation.test.js
 *
 * This file does NOT copy-paste the scoring functions. It extracts the
 * real CBF block straight out of server.js and evaluates it, so the
 * tests can never silently drift out of sync with production code the
 * way a duplicated copy would.
 */
const fs = require('fs');
const path = require('path');

// ── Load the real functions from server.js ─────────────────────────────
const SERVER = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
function slice(startMarker, endMarker) {
  const s = SERVER.indexOf(startMarker);
  const e = SERVER.indexOf(endMarker, s);
  if (s === -1 || e === -1) throw new Error(`Could not locate block: ${startMarker}`);
  return SERVER.slice(s, e);
}
const haversineSrc = slice('function haversineKm(', '\nfunction ');
const tagsSrc      = slice('const CBF_STOPWORDS', 'async function sendNotification');
// Cut at the final closing brace so the trailing `/* ===` banner comment
// that introduces the next section isn't dragged in half-open.
const cbfRaw       = slice('function buildTFMap(', '   A* PATHFINDING');
const cbfSrc       = cbfRaw.slice(0, cbfRaw.lastIndexOf('}') + 1);

const ctx = {};
new Function('exports', `${haversineSrc}\n${tagsSrc}\n${cbfSrc}
  Object.assign(exports, { haversineKm, generateFeatureTags, buildTFMap, cosineSim,
    buildIDF, buildTFIDFVector, buildUserProfileVector, blendVectors,
    contentBasedRecommend, CBF_WEIGHTS });`)(ctx);

const { generateFeatureTags, cosineSim, buildIDF, buildTFIDFVector,
        buildUserProfileVector, contentBasedRecommend } = ctx;

// ── Harness ────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

const KTM = { lat: 27.7172, lng: 85.3240 };
const catalog = [
  { _id:'1', cropName:'Cherry Tomato',    category:'Vegetable', isAvailable:true, demand:40, location:{lat:27.70,lng:85.32} },
  { _id:'2', cropName:'Organic Spinach',  category:'Vegetable', isAvailable:true, demand:30, location:{lat:27.71,lng:85.33} },
  { _id:'3', cropName:'Cauliflower',      category:'Vegetable', isAvailable:true, demand:25, location:{lat:27.72,lng:85.34} },
  { _id:'4', cropName:'Alphonso Mango',   category:'Fruit',     isAvailable:true, demand:50, location:{lat:27.73,lng:85.35} },
  { _id:'5', cropName:'Banana',           category:'Fruit',     isAvailable:true, demand:45, location:{lat:27.74,lng:85.36} },
  { _id:'6', cropName:'Watermelon',       category:'Fruit',     isAvailable:true, demand:20, location:{lat:27.75,lng:85.37} },
  { _id:'7', cropName:'Basmati Rice',     category:'Grain',     isAvailable:true, demand:60, location:{lat:27.76,lng:85.38} },
  { _id:'8', cropName:'Wheat Flour',      category:'Grain',     isAvailable:true, demand:35, location:{lat:27.77,lng:85.39} },
  { _id:'9', cropName:'Fresh Cow Milk',   category:'Dairy',     isAvailable:true, demand:95, location:{lat:27.72,lng:85.33} },
  { _id:'10',cropName:'Paneer',           category:'Dairy',     isAvailable:true, demand:55, location:{lat:27.71,lng:85.32} },
  { _id:'11',cropName:'Ginger',           category:'Herb',      isAvailable:true, demand:65, location:{lat:27.70,lng:85.31} },
  { _id:'12',cropName:'Turmeric',         category:'Herb',      isAvailable:true, demand:50, location:{lat:27.71,lng:85.31} },
];
const rec = (o) => contentBasedRecommend({ allProducts: catalog, consumerLat: KTM.lat, consumerLng: KTM.lng, ...o });

console.log('Recommendation test suite (functions loaded from real server.js)');
console.log('='.repeat(64));

console.log('\n1-4. Category routing');
check('Tomato -> Vegetable on top',  rec({queryCategory:'Vegetable',queryCropName:'Tomato'}).products[0]?.category==='Vegetable');
check('Banana -> Fruit on top',      rec({queryCategory:'Fruit',queryCropName:'Banana'}).products[0]?.category==='Fruit');
check('Rice -> Grain on top',        rec({queryCategory:'Grain',queryCropName:'Rice'}).products[0]?.category==='Grain');
check('Milk -> Dairy on top',        rec({queryCategory:'Dairy',queryCropName:'Milk'}).products[0]?.category==='Dairy');

console.log('\n5. New user, no history, no location');
{
  const r = contentBasedRecommend({ queryCategory:'Fruit', allProducts:catalog, viewHistory:[] });
  check('returns results without crashing', Array.isArray(r.products) && r.products.length > 0);
  check('usedProfile flag is false for a cold-start user', r.usedProfile === false);
}

console.log('\n6. Vegetable-heavy history');
{
  const history = [
    {cropName:'Spinach',category:'Vegetable'},
    {cropName:'Cauliflower',category:'Vegetable'},
    {cropName:'Tomato',category:'Vegetable'},
  ];
  const r = rec({queryCategory:'Vegetable', viewHistory:history});
  check('top result is a Vegetable', r.products[0]?.category==='Vegetable');
  check('usedProfile flag is true when history exists', r.usedProfile === true);
  check('reason explains the profile influence', /often browse Vegetable/.test(r.reason), r.reason);
}

console.log('\n7-10. Robustness');
{
  const grainRes = rec({queryCategory:'Grain',queryCropName:'Rice'}).products;
  const gingerRank = grainRes.findIndex(p=>p.cropName==='Ginger');
  check('similar-spelling unrelated category not in top 3', gingerRank===-1||gingerRank>=3);

  const vegRes = rec({queryCategory:'Vegetable',queryCropName:'Cauliflower'}).products;
  const milk = vegRes.findIndex(p=>p.cropName==='Fresh Cow Milk');
  const spin = vegRes.findIndex(p=>p.cropName==='Organic Spinach');
  check('nearby+popular wrong-category loses to correct category', spin!==-1 && (milk===-1||spin<milk));

  check('same category, unmatched name still returns category peers',
    rec({queryCategory:'Dairy',queryCropName:'Cheese'}).products.some(p=>p.category==='Dairy'));

  check('exact match excluded still returns same category',
    rec({queryCategory:'Fruit',queryCropName:'Alphonso Mango',excludeId:'4'}).products[0]?.category==='Fruit');
}

console.log('\n11. TF-IDF weighting');
{
  const idf = buildIDF(catalog);
  check('rare specific term outweighs common category term',
    idf['cauliflower'] > idf['vegetable'],
    `cauliflower=${idf['cauliflower']?.toFixed(3)} vegetable=${idf['vegetable']?.toFixed(3)}`);
  check('all IDF weights are positive (smoothing holds)',
    Object.values(idf).every(v => v > 0));

  const q     = buildTFIDFVector(generateFeatureTags('Cauliflower','Vegetable'), idf);
  const right = buildTFIDFVector(generateFeatureTags('Cauliflower','Vegetable'), idf);
  const wrong = buildTFIDFVector(generateFeatureTags('Fresh Cow Milk','Dairy'), idf);
  check('identical product scores ~1.0 similarity', cosineSim(q,right) > 0.99);
  check('unrelated-category product scores ~0 similarity', cosineSim(q,wrong) < 0.01,
    cosineSim(q,wrong).toFixed(4));
}

console.log('\n12. User profile centroid (Rocchio)');
{
  const idf = buildIDF(catalog);
  check('no history -> null profile (clean cold-start fallback)',
    buildUserProfileVector([], idf) === null);

  const centroid = buildUserProfileVector(
    [{cropName:'Spinach',category:'Vegetable'},{cropName:'Cauliflower',category:'Vegetable'}], idf);
  check('history produces a non-empty centroid vector',
    centroid && Object.keys(centroid).length > 0);

  const recency = buildUserProfileVector(
    [{cropName:'Ginger',category:'Herb'},{cropName:'Banana',category:'Fruit'}], idf);
  check('most recent view carries more weight than the oldest',
    (recency['banana']||0) > (recency['ginger']||0),
    `banana=${(recency['banana']||0).toFixed(4)} ginger=${(recency['ginger']||0).toFixed(4)}`);
}

console.log('\n13. Profile influences but never overrides the explicit query');
{
  const dairyHistory = Array(5).fill({cropName:'Milk',category:'Dairy'});
  const r = rec({queryCategory:'Fruit', queryCropName:'Banana', viewHistory:dairyHistory});
  check('heavy Dairy history still yields Fruit for an explicit Fruit query',
    r.products[0]?.category==='Fruit', r.products[0]?.category);
}

console.log('\n14. Explainability');
{
  const r = rec({queryCategory:'Vegetable', queryCropName:'Tomato',
                 viewHistory:[{cropName:'Spinach',category:'Vegetable'}]});
  check('every result carries a human-readable reason',
    r.products.every(p => typeof p._reason === 'string' && p._reason.length > 0));
  check('top result cites the category match',
    /same category/.test(r.products[0]._reason), r.products[0]._reason);
}

console.log('\n' + '='.repeat(64));
console.log(`RESULT: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
