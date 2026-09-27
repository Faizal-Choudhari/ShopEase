const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const dbDir = path.join(__dirname, 'db');
fs.mkdirSync(dbDir, { recursive: true });
const app = express();
const PORT = process.env.PORT || 3000;
const db = new sqlite3.Database(path.join(dbDir, 'ecommerce.sqlite'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'shopease-demo-change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8, httpOnly: true, sameSite: 'lax' }
}));
app.use(express.static(path.join(__dirname, 'public')));

function run(sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function(err) {
    if (err) reject(err); else resolve({ id: this.lastID, changes: this.changes });
  }));
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}
async function initDb() {
  await run('PRAGMA foreign_keys = ON');
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','seller')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT DEFAULT ''
  )`);
  await run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    price REAL NOT NULL CHECK(price >= 0),
    original_price REAL,
    stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
    quality TEXT NOT NULL DEFAULT 'Standard',
    rating REAL NOT NULL DEFAULT 4.0,
    reviews_count INTEGER NOT NULL DEFAULT 0,
    image TEXT NOT NULL,
    badge TEXT DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(category_id) REFERENCES categories(id)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    UNIQUE(user_id, product_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
  )`);
  await run(`CREATE TABLE IF NOT EXISTS wishlist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    UNIQUE(user_id, product_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
  )`);
  await run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    total REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'Placed',
    shipping_name TEXT NOT NULL,
    shipping_address TEXT NOT NULL,
    shipping_city TEXT NOT NULL,
    shipping_pincode TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
  await run(`CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER,
    product_name TEXT NOT NULL,
    price REAL NOT NULL,
    quantity INTEGER NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL
  )`);
  await run(`CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comment TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
  )`);

  const seller = await get('SELECT id FROM users WHERE email = ?', ['seller@shopease.com']);
  if (!seller) await run('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)', ['Demo Seller','seller@shopease.com',bcrypt.hashSync('seller123',10),'seller']);
  const customer = await get('SELECT id FROM users WHERE email = ?', ['user@shopease.com']);
  if (!customer) await run('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)', ['Demo Customer','user@shopease.com',bcrypt.hashSync('user123',10),'customer']);

  const cats = [
    ['Electronics','Smart devices and useful technology'],
    ['Fashion','Everyday clothing and accessories'],
    ['Home & Living','Comfort and useful home products'],
    ['Books','Learning and entertainment'],
    ['Sports','Fitness and outdoor essentials']
  ];
  for (const c of cats) await run('INSERT OR IGNORE INTO categories(name,description) VALUES(?,?)', c);

  const count = await get('SELECT COUNT(*) AS count FROM products');
  if (count.count === 0) {
    const categoryIds = {};
    for (const c of cats) categoryIds[c[0]] = (await get('SELECT id FROM categories WHERE name=?',[c[0]])).id;
    const products = [
      [categoryIds['Electronics'],'Nova Wireless Headphones','Low-latency wireless headphones with deep bass, 40-hour battery and comfortable ear cushions.',2499,3999,24,'Premium',4.6,128,'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80','Bestseller'],
      [categoryIds['Fashion'],'Urban Classic Sneakers','Lightweight everyday sneakers with cushioned soles and breathable mesh.',1899,2999,31,'Premium',4.4,96,'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80','Trending'],
      [categoryIds['Home & Living'],'Aura Table Lamp','Minimal LED table lamp with warm and cool light modes for work and study.',1299,1799,18,'High Quality',4.7,74,'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=80','Deal'],
      [categoryIds['Books'],'The Everyday Coding Guide','Beginner-friendly programming guide covering logic, projects and practical problem solving.',699,899,45,'New',4.8,51,'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=900&q=80','New'],
      [categoryIds['Sports'],'FlexFit Training Bottle','BPA-free insulated bottle with leak-proof lid and 750 ml capacity.',799,1099,39,'Premium',4.5,62,'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=80','Popular']
    ];
    for (const p of products) await run(`INSERT INTO products(category_id,name,description,price,original_price,stock,quality,rating,reviews_count,image,badge) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,p);
  }
}

function requireLogin(req,res,next){ if(!req.session.user) return res.status(401).json({error:'Please login first'}); next(); }
function requireSeller(req,res,next){ if(!req.session.user || req.session.user.role!=='seller') return res.status(403).json({error:'Seller access required'}); next(); }

app.get('/api/session',(req,res)=>res.json({user:req.session.user||null}));
app.post('/api/auth/register',async(req,res)=>{
  try {
    const {name,email,password}=req.body;
    if(!name||!email||!password||password.length<6) return res.status(400).json({error:'Name, valid email and password of at least 6 characters are required'});
    const exists=await get('SELECT id FROM users WHERE email=?',[email.toLowerCase().trim()]);
    if(exists) return res.status(409).json({error:'Email already registered'});
    const r=await run('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)',[name.trim(),email.toLowerCase().trim(),bcrypt.hashSync(password,10),'customer']);
    res.status(201).json({message:'Account created successfully. Please login to continue.', user:{id:r.id,name:name.trim(),email:email.toLowerCase().trim(),role:'customer'}});
  } catch(e){res.status(500).json({error:'Registration failed'});}
});
app.post('/api/auth/login',async(req,res)=>{
  try { const {email,password}=req.body; const u=await get('SELECT * FROM users WHERE email=?',[String(email||'').toLowerCase().trim()]);
    if(!u || !bcrypt.compareSync(password||'',u.password_hash)) return res.status(401).json({error:'Invalid email or password'});
    const user={id:u.id,name:u.name,email:u.email,role:u.role}; req.session.user=user; res.json({user});
  } catch(e){res.status(500).json({error:'Login failed'});}
});
app.post('/api/auth/logout',(req,res)=>req.session.destroy(()=>res.json({message:'Logged out'})));


// Local shopping assistant. No API key or external AI service is required.
app.post('/api/chat', async (req,res)=>{
  try {
    const message=String(req.body.message||'').trim();
    if(!message) return res.status(400).json({error:'Message is required'});
    if(message.length>1200) return res.status(400).json({error:'Message is too long'});

    const text=message.toLowerCase();
    const products=await all(`SELECT p.id,p.name,p.description,p.price,p.original_price,p.stock,p.quality,p.rating,p.reviews_count,c.name AS category_name
      FROM products p JOIN categories c ON p.category_id=c.id WHERE p.active=1 ORDER BY p.id DESC`);

    const money=n=>'₹'+Number(n||0).toLocaleString('en-IN');
    const productList=products.map(p=>`${p.name} | ${p.category_name} | ${money(p.price)} | ${p.stock>0?p.stock+' in stock':'Out of stock'} | ${p.quality} quality | ★ ${Number(p.rating).toFixed(1)}`);
    const findProduct=()=>products.find(p=>text.includes(p.name.toLowerCase())) || products.find(p=>p.name.toLowerCase().split(/\s+/).some(w=>w.length>3&&text.includes(w)));
    const p=findProduct();

    if(/^(hi|hello|hey|namaste|good morning|good evening)\b/.test(text)){
      return res.json({reply:'Hi! 👋 I’m your free ShopEase local assistant. Ask me about products, prices, stock, categories, your cart, wishlist, orders, or store features.'});
    }
    if(/\b(help|what can you do|what do you do)\b/.test(text)){
      return res.json({reply:'I can help with product prices, stock, quality, ratings, categories, products under a budget, cart, wishlist, orders, and basic store navigation. I work locally inside this website and need no API key.'});
    }
    if(/\b(cart|bag)\b/.test(text)){
      if(!req.session.user) return res.json({reply:'Please login first so I can check your cart.'});
      const cart=await all(`SELECT p.name,ci.quantity,p.price,(p.price*ci.quantity) subtotal FROM cart_items ci JOIN products p ON ci.product_id=p.id WHERE ci.user_id=?`,[req.session.user.id]);
      if(!cart.length) return res.json({reply:'Your cart is empty. You can add products from the Home page.'});
      const total=cart.reduce((s,i)=>s+i.subtotal,0);
      return res.json({reply:`You have ${cart.reduce((s,i)=>s+i.quantity,0)} item(s) in your cart:\n${cart.map(i=>`• ${i.name} × ${i.quantity} — ${money(i.subtotal)}`).join('\n')}\nTotal: ${money(total)}.`});
    }
    if(/\b(wishlist|saved)\b/.test(text)){
      if(!req.session.user) return res.json({reply:'Please login first so I can check your wishlist.'});
      const list=await all(`SELECT p.name,p.price FROM wishlist_items w JOIN products p ON w.product_id=p.id WHERE w.user_id=?`,[req.session.user.id]);
      return res.json({reply:list.length?`Your wishlist has ${list.length} item(s):\n${list.map(i=>`• ${i.name} — ${money(i.price)}`).join('\n')}`:'Your wishlist is empty. Tap the ♡ button on a product to save it.'});
    }
    if(/\b(order|orders|purchase|purchases|delivery)\b/.test(text)){
      if(!req.session.user) return res.json({reply:'Please login first so I can check your orders.'});
      const orders=await all(`SELECT id,total,status,created_at FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 5`,[req.session.user.id]);
      return res.json({reply:orders.length?`Your recent orders:\n${orders.map(o=>`• Order #${o.id} — ${money(o.total)} — ${o.status} — ${new Date(o.created_at).toLocaleDateString('en-IN')}`).join('\n')}`:'You have no orders yet.'});
    }
    if(/\b(category|categories|types)\b/.test(text)){
      const cats=[...new Set(products.map(p=>p.category_name))];
      return res.json({reply:`We currently have these categories:\n${cats.map(c=>'• '+c).join('\n')}`});
    }
    const budgetMatch=text.match(/(?:under|below|less than|within)\s*(?:₹|rs\.?|inr\s*)?(\d+(?:\.\d+)?)/i);
    if(budgetMatch){
      const budget=Number(budgetMatch[1]);
      const matches=products.filter(x=>x.price<=budget);
      return res.json({reply:matches.length?`Products under ${money(budget)}:\n${matches.map(x=>`• ${x.name} — ${money(x.price)}${x.stock?'':' — out of stock'}`).join('\n')}`:`I couldn't find an active product under ${money(budget)}.`});
    }
    if(/\b(cheap|cheapest|lowest price|low price|affordable)\b/.test(text)){
      const matches=[...products].sort((a,b)=>a.price-b.price).slice(0,5);
      return res.json({reply:`Our lowest-priced products are:\n${matches.map(x=>`• ${x.name} — ${money(x.price)}`).join('\n')}`});
    }
    if(/\b(best|top|highest rated|rating)\b/.test(text)){
      const matches=[...products].sort((a,b)=>b.rating-a.rating).slice(0,5);
      return res.json({reply:`Top-rated products:\n${matches.map(x=>`• ${x.name} — ★ ${Number(x.rating).toFixed(1)} (${x.reviews_count} reviews)`).join('\n')}`});
    }
    if(p){
      return res.json({reply:`${p.name}\nCategory: ${p.category_name}\nPrice: ${money(p.price)}${p.original_price>p.price?' (original '+money(p.original_price)+')':''}\nStock: ${p.stock>0?p.stock+' available':'Out of stock'}\nQuality: ${p.quality}\nRating: ★ ${Number(p.rating).toFixed(1)} (${p.reviews_count} reviews)\n\n${p.description}`});
    }
    if(/\b(price|cost|how much)\b/.test(text)){
      return res.json({reply:'Tell me the product name and I can show its current price. You can also ask, for example, “price of headphones”.'});
    }
    if(/\b(stock|available|availability)\b/.test(text)){
      const inStock=products.filter(x=>x.stock>0);
      return res.json({reply:inStock.length?`Currently in stock:\n${inStock.map(x=>`• ${x.name} — ${x.stock} available`).join('\n')}`:'There are currently no products in stock.'});
    }
    if(/\b(search|find|looking for|show me)\b/.test(text)){
      const words=text.replace(/search|find|looking for|show me/g,'').trim().split(/\s+/).filter(w=>w.length>2);
      const matches=products.filter(x=>words.some(w=>(x.name+' '+x.description+' '+x.category_name).toLowerCase().includes(w)));
      return res.json({reply:matches.length?`I found:\n${matches.slice(0,8).map(x=>`• ${x.name} — ${money(x.price)} — ${x.stock>0?'In stock':'Out of stock'}`).join('\n')}`:'I couldn’t find a matching product. Try a product name or category.'});
    }

    return res.json({reply:`I’m a local ShopEase assistant, so I answer from your store database. I currently know these products:\n${productList.slice(0,8).join('\n')}\n\nTry asking “show products under ₹1000”, “what is in my cart?”, or “price of headphones”.`});
  } catch(e){ console.error('Chat error:',e); res.status(500).json({error:'Could not use the local shopping assistant'}); }
});

app.get('/api/categories',async(req,res)=>res.json(await all('SELECT * FROM categories ORDER BY name')));
app.get('/api/products',async(req,res)=>{
  try { const {category,search,sort}=req.query; let sql=`SELECT p.*,c.name AS category_name FROM products p JOIN categories c ON p.category_id=c.id WHERE p.active=1`; const params=[];
    if(category){sql+=' AND c.id=?';params.push(category)}
    if(search){sql+=' AND (p.name LIKE ? OR p.description LIKE ? OR c.name LIKE ?)';params.push(`%${search}%`,`%${search}%`,`%${search}%`)}
    const order={price_asc:'p.price ASC',price_desc:'p.price DESC',rating:'p.rating DESC',newest:'p.created_at DESC'}[sort]||'p.id DESC'; sql+=` ORDER BY ${order}`;
    res.json(await all(sql,params));
  } catch(e){res.status(500).json({error:'Could not load products'});}
});
app.get('/api/products/:id',async(req,res)=>{const p=await get(`SELECT p.*,c.name AS category_name FROM products p JOIN categories c ON p.category_id=c.id WHERE p.id=? AND p.active=1`,[req.params.id]); if(!p)return res.status(404).json({error:'Product not found'}); p.reviews=await all(`SELECT r.*,u.name FROM reviews r JOIN users u ON r.user_id=u.id WHERE r.product_id=? ORDER BY r.created_at DESC`,[p.id]); res.json(p);});

app.get('/api/cart',requireLogin,async(req,res)=>{res.json(await all(`SELECT ci.id,ci.quantity,p.id AS product_id,p.name,p.price,p.stock,p.image,p.quality,(p.price*ci.quantity) AS subtotal FROM cart_items ci JOIN products p ON ci.product_id=p.id WHERE ci.user_id=? ORDER BY ci.id DESC`,[req.session.user.id]));});
app.post('/api/cart',requireLogin,async(req,res)=>{try{const pid=Number(req.body.productId),qty=Number(req.body.quantity||1);const p=await get('SELECT * FROM products WHERE id=? AND active=1',[pid]);if(!p)return res.status(404).json({error:'Product not found'});if(qty<1||qty>p.stock)return res.status(400).json({error:`Only ${p.stock} item(s) available`});const old=await get('SELECT * FROM cart_items WHERE user_id=? AND product_id=?',[req.session.user.id,pid]);const newQty=(old?old.quantity:0)+qty;if(newQty>p.stock)return res.status(400).json({error:`Only ${p.stock} item(s) available`});if(old)await run('UPDATE cart_items SET quantity=? WHERE id=?',[newQty,old.id]);else await run('INSERT INTO cart_items(user_id,product_id,quantity) VALUES(?,?,?)',[req.session.user.id,pid,qty]);res.json({message:'Added to cart'});}catch(e){res.status(500).json({error:'Could not add to cart'});}});
app.patch('/api/cart/:id',requireLogin,async(req,res)=>{const qty=Number(req.body.quantity);const item=await get(`SELECT ci.*,p.stock FROM cart_items ci JOIN products p ON ci.product_id=p.id WHERE ci.id=? AND ci.user_id=?`,[req.params.id,req.session.user.id]);if(!item)return res.status(404).json({error:'Cart item not found'});if(qty<1||qty>item.stock)return res.status(400).json({error:`Quantity must be between 1 and ${item.stock}`});await run('UPDATE cart_items SET quantity=? WHERE id=?',[qty,item.id]);res.json({message:'Cart updated'});});
app.delete('/api/cart/:id',requireLogin,async(req,res)=>{await run('DELETE FROM cart_items WHERE id=? AND user_id=?',[req.params.id,req.session.user.id]);res.json({message:'Removed'});});

app.get('/api/wishlist',requireLogin,async(req,res)=>res.json(await all(`SELECT w.id,p.* ,c.name AS category_name FROM wishlist_items w JOIN products p ON w.product_id=p.id JOIN categories c ON p.category_id=c.id WHERE w.user_id=? ORDER BY w.id DESC`,[req.session.user.id])));
app.get('/api/wishlist/ids',requireLogin,async(req,res)=>res.json(await all('SELECT product_id FROM wishlist_items WHERE user_id=?',[req.session.user.id])));
app.post('/api/wishlist/:productId',requireLogin,async(req,res)=>{await run('INSERT OR IGNORE INTO wishlist_items(user_id,product_id) VALUES(?,?)',[req.session.user.id,req.params.productId]);res.json({message:'Saved to wishlist'});});
app.delete('/api/wishlist/:productId',requireLogin,async(req,res)=>{await run('DELETE FROM wishlist_items WHERE user_id=? AND product_id=?',[req.session.user.id,req.params.productId]);res.json({message:'Removed from wishlist'});});

app.post('/api/orders',requireLogin,async(req,res)=>{
  const {shippingName,shippingAddress,shippingCity,shippingPincode,paymentMethod}=req.body;
  if(!shippingName||!shippingAddress||!shippingCity||!shippingPincode||!paymentMethod)return res.status(400).json({error:'Please complete all checkout fields'});
  try {
    const items=await all(`SELECT ci.product_id,ci.quantity,p.name,p.price,p.stock FROM cart_items ci JOIN products p ON ci.product_id=p.id WHERE ci.user_id=?`,[req.session.user.id]);
    if(!items.length)return res.status(400).json({error:'Your cart is empty'});
    for(const i of items)if(i.quantity>i.stock) return res.status(400).json({error:`Not enough stock for ${i.name}`});
    const total=items.reduce((s,i)=>s+i.price*i.quantity,0);
    await run('BEGIN TRANSACTION');
    const order=await run(`INSERT INTO orders(user_id,total,shipping_name,shipping_address,shipping_city,shipping_pincode,payment_method) VALUES(?,?,?,?,?,?,?)`,[req.session.user.id,total,shippingName,shippingAddress,shippingCity,shippingPincode,paymentMethod]);
    for(const i of items){await run(`INSERT INTO order_items(order_id,product_id,product_name,price,quantity) VALUES(?,?,?,?,?)`,[order.id,i.product_id,i.name,i.price,i.quantity]);await run('UPDATE products SET stock=stock-? WHERE id=?',[i.quantity,i.product_id]);}
    await run('DELETE FROM cart_items WHERE user_id=?',[req.session.user.id]); await run('COMMIT'); res.status(201).json({orderId:order.id,total});
  } catch(e){try{await run('ROLLBACK')}catch{};res.status(500).json({error:'Order could not be placed'});}
});
app.get('/api/orders',requireLogin,async(req,res)=>res.json(await all(`SELECT o.*, (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id=o.id) AS item_count FROM orders o WHERE o.user_id=? ORDER BY o.created_at DESC`,[req.session.user.id])));
app.get('/api/orders/:id',requireLogin,async(req,res)=>{const o=await get('SELECT * FROM orders WHERE id=? AND user_id=?',[req.params.id,req.session.user.id]);if(!o)return res.status(404).json({error:'Order not found'});o.items=await all('SELECT * FROM order_items WHERE order_id=?',[o.id]);res.json(o);});

app.post('/api/products/:id/reviews',requireLogin,async(req,res)=>{const rating=Number(req.body.rating),comment=String(req.body.comment||'').trim();if(!Number.isInteger(rating)||rating<1||rating>5)return res.status(400).json({error:'Rating must be 1 to 5'});const bought=await get(`SELECT oi.id FROM order_items oi JOIN orders o ON oi.order_id=o.id WHERE o.user_id=? AND oi.product_id=? AND o.status!='Cancelled'`,[req.session.user.id,req.params.id]);if(!bought)return res.status(403).json({error:'Buy this item before reviewing it'});try{await run('INSERT INTO reviews(user_id,product_id,rating,comment) VALUES(?,?,?,?)',[req.session.user.id,req.params.id,rating,comment]);const stats=await get('SELECT AVG(rating) avg, COUNT(*) cnt FROM reviews WHERE product_id=?',[req.params.id]);await run('UPDATE products SET rating=?,reviews_count=? WHERE id=?',[Number(stats.avg.toFixed(1)),stats.cnt,req.params.id]);res.status(201).json({message:'Review added'});}catch(e){res.status(409).json({error:'You already reviewed this item'});}});

app.post('/api/seller/products',requireSeller,async(req,res)=>{try{const {categoryId,name,description,price,originalPrice,stock,quality,image,badge}=req.body;if(!categoryId||!name||!description||Number(price)<0||Number(stock)<0)return res.status(400).json({error:'Fill all required product fields'});const r=await run(`INSERT INTO products(category_id,name,description,price,original_price,stock,quality,image,badge) VALUES(?,?,?,?,?,?,?,?,?)`,[categoryId,name,description,Number(price),Number(originalPrice||price),Number(stock),quality||'Standard',image||'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80',badge||'']);res.status(201).json({id:r.id});}catch(e){res.status(500).json({error:'Could not create product'});}});
app.put('/api/seller/products/:id',requireSeller,async(req,res)=>{try{const {categoryId,name,description,price,originalPrice,stock,quality,image,badge}=req.body;await run(`UPDATE products SET category_id=?,name=?,description=?,price=?,original_price=?,stock=?,quality=?,image=?,badge=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,[categoryId,name,description,Number(price),Number(originalPrice||price),Number(stock),quality||'Standard',image,badge||'',req.params.id]);res.json({message:'Product updated'});}catch(e){res.status(500).json({error:'Could not update product'});}});
app.delete('/api/seller/products/:id',requireSeller,async(req,res)=>{await run('UPDATE products SET active=0 WHERE id=?',[req.params.id]);res.json({message:'Product removed from store'});});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
initDb().then(()=>app.listen(PORT,()=>console.log(`ShopEase running at http://localhost:${PORT}`))).catch(err=>{console.error(err);process.exit(1)});
