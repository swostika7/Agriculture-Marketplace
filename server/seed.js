require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/agri-marketplace-v6')
  .then(() => console.log('✅  Connected'))
  .catch(e => { console.error(e); process.exit(1); });

const User = mongoose.model('User', new mongoose.Schema({
  name:String, email:{type:String,unique:true}, password:String, phone:String,
  role:String, location:{city:String,lat:Number,lng:Number}, bio:String, avatar:String,
},{ timestamps:true }));

const Product = mongoose.model('Product', new mongoose.Schema({
  farmerID:mongoose.Schema.Types.ObjectId, cropName:String, description:String,
  category:String, quantity:Number, unit:String, price:Number, aiSuggestedPrice:Number,
  priceStatus:{ type:String, enum:['match','sale','above','none'], default:'none' },
  location:{city:String,lat:Number,lng:Number},
  season:String, imageURL:String, isAvailable:Boolean, demand:Number,
},{ timestamps:true }));

const Order = mongoose.model('Order', new mongoose.Schema({
  farmerID:mongoose.Schema.Types.ObjectId, consumerID:mongoose.Schema.Types.ObjectId,
  productID:mongoose.Schema.Types.ObjectId, quantity:Number, totalPrice:Number,
  status:String, paymentStatus:String, paymentMethod:String, deliveryAddress:String,
},{ timestamps:true }));

function calcPriceStatus(price, ai) {
  if (!ai) return 'none';
  const d = (price - ai) / ai;
  if (Math.abs(d) <= 0.02) return 'match';
  if (d < -0.02)           return 'sale';
  return 'above';
}

// All prices in NPR
const FARMERS = [
  { name:'Hari Bahadur Tamang', email:'hari@farm.np',  phone:'9841000001', role:'Farmer', city:'Pokhara',    lat:28.2096, lng:83.9856, bio:'Organic farmer with 15 years of experience growing fresh vegetables in the hills of Pokhara.' },
  { name:'Sita Devi Sharma',    email:'sita@farm.np',  phone:'9841000002', role:'Farmer', city:'Chitwan',    lat:27.5291, lng:84.3542, bio:'Specialising in seasonal fruits and dairy farming in the Chitwan valley.' },
  { name:'Ram Prasad Poudel',   email:'ram@farm.np',   phone:'9841000003', role:'Farmer', city:'Dharan',     lat:26.8065, lng:87.2846, bio:'Grain farmer and herb grower from eastern Nepal.' },
  { name:'Gita Kumari Rai',     email:'gita@farm.np',  phone:'9841000004', role:'Farmer', city:'Biratnagar', lat:26.4525, lng:87.2718, bio:'Growing organic spices and herbs for 20 years.' },
];
const CONSUMERS = [
  { name:'Anita Shrestha', email:'anita@city.np', phone:'9851000001', role:'Consumer', city:'Kathmandu', lat:27.7172, lng:85.3240, bio:'Health-conscious consumer.' },
  { name:'Bikash Karki',   email:'bikash@city.np',phone:'9851000002', role:'Consumer', city:'Lalitpur',  lat:27.6644, lng:85.3188, bio:'Home chef who values fresh produce.' },
  { name:'Admin User',     email:'admin@agri.np', phone:'9800000000', role:'Admin',    city:'Kathmandu', lat:27.7172, lng:85.3240, bio:'Platform administrator.' },
];

const CROPS = [
  { cropName:'Cherry Tomatoes',     description:'Fresh sun-ripened cherry tomatoes', category:'Vegetable', unit:'kg',    price:420,  aiSugg:420,  season:'Summer',     imageURL:'https://images.unsplash.com/photo-1546094096-0df4bcadb8ba?w=400&auto=format&fit=crop', demand:45 },
  { cropName:'Organic Spinach',     description:'Crispy green spinach, no pesticides',category:'Vegetable', unit:'kg',    price:280,  aiSugg:320,  season:'Spring',     imageURL:'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=400&auto=format&fit=crop', demand:32 },
  { cropName:'Baby Carrots',        description:'Sweet and crunchy, freshly harvested', category:'Vegetable', unit:'kg',   price:260,  aiSugg:260,  season:'Autumn',     imageURL:'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=400&auto=format&fit=crop', demand:28 },
  { cropName:'Alphonso Mangoes',    description:'Premium mangoes, sweet and aromatic',  category:'Fruit',     unit:'kg',   price:750,  aiSugg:750,  season:'Summer',     imageURL:'https://images.unsplash.com/photo-1553279768-865429fa0078?w=400&auto=format&fit=crop', demand:67 },
  { cropName:'Wild Strawberries',   description:'Naturally sweet mountain strawberries',category:'Fruit',     unit:'kg',   price:800,  aiSugg:950,  season:'Spring',     imageURL:'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=400&auto=format&fit=crop', demand:54 },
  { cropName:'Basmati Rice',        description:'Premium long-grain aromatic rice',     category:'Grain',     unit:'kg',   price:120,  aiSugg:120,  season:'Autumn',     imageURL:'https://images.unsplash.com/photo-1536304929831-ee1ca9d44906?w=400&auto=format&fit=crop', demand:89 },
  { cropName:'Yellow Maize',        description:'Traditional yellow maize for flour',   category:'Grain',     unit:'kg',   price:85,   aiSugg:85,   season:'Summer',     imageURL:'https://images.unsplash.com/photo-1601593346740-925612772716?w=400&auto=format&fit=crop', demand:41 },
  { cropName:'Fresh Buffalo Milk',  description:'Pure buffalo milk, collected fresh',   category:'Dairy',     unit:'litre',price:140,  aiSugg:140,  season:'Year-Round', imageURL:'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&auto=format&fit=crop', demand:95 },
  { cropName:'Organic Turmeric',    description:'High-curcumin turmeric, sun-dried',    category:'Herb',      unit:'kg',   price:1000, aiSugg:1200, season:'Winter',     imageURL:'https://images.unsplash.com/photo-1615485500704-8e990f9900f7?w=400&auto=format&fit=crop', demand:23 },
  { cropName:'Fresh Ginger',        description:'Pungent fresh ginger for cooking',     category:'Herb',      unit:'kg',   price:560,  aiSugg:560,  season:'Autumn',     imageURL:'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=400&auto=format&fit=crop', demand:37 },
  { cropName:'Green Capsicum',      description:'Crisp green bell peppers',             category:'Vegetable', unit:'kg',   price:340,  aiSugg:380,  season:'Summer',     imageURL:'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=400&auto=format&fit=crop', demand:19 },
  { cropName:'Red Lentils (Masur)', description:'Protein-rich red lentils from terai',  category:'Grain',     unit:'kg',   price:310,  aiSugg:310,  season:'Year-Round', imageURL:'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&auto=format&fit=crop', demand:60 },
];

async function seed() {
  try {
    await Promise.all([User.deleteMany(), Product.deleteMany(), Order.deleteMany()]);
    const pw = await bcrypt.hash('password123', 10);

    const farmerDocs   = await User.insertMany(FARMERS.map(u => ({ ...u, password:pw, location:{city:u.city,lat:u.lat,lng:u.lng} })));
    const consumerDocs = await User.insertMany(CONSUMERS.map(u => ({ ...u, password:pw, location:{city:u.city,lat:u.lat,lng:u.lng} })));

    const productDocs = await Product.insertMany(CROPS.map((c, i) => {
      const f = farmerDocs[i % farmerDocs.length];
      return {
        cropName:c.cropName, description:c.description, category:c.category,
        quantity:50+Math.floor(Math.random()*200), unit:c.unit,
        price:c.price, aiSuggestedPrice:c.aiSugg,
        priceStatus:calcPriceStatus(c.price, c.aiSugg),
        farmerID:f._id, location:{city:f.location.city, lat:f.location.lat, lng:f.location.lng},
        season:c.season, imageURL:c.imageURL, isAvailable:true, demand:c.demand,
      };
    }));

    const statuses = ['Pending','In-Transit','Delivered'];
    await Order.insertMany(productDocs.slice(0,6).map((p,i)=>({
      farmerID:p.farmerID, consumerID:consumerDocs[i%2]._id, productID:p._id,
      quantity:1+Math.floor(Math.random()*5),
      totalPrice:p.price*(1+Math.floor(Math.random()*4)),
      status:statuses[i%3], paymentStatus:i%3===2?'Paid':'Unpaid',
      paymentMethod:i%3===2?'Khalti':'', deliveryAddress:consumerDocs[i%2].location.city,
    })));

    console.log('\n✨  AgriConnect v3 seed complete!');
    console.log('   Farmer   → hari@farm.np  / password123');
    console.log('   Consumer → anita@city.np / password123');
    console.log('   Admin    → admin@agri.np / password123\n');
    process.exit(0);
  } catch(e) { console.error(e); process.exit(1); }
}
seed();
