const express = require('express');
const path = require('path');
const db = require('./db');
const multer = require('multer');
const session = require('express-session'); //  express-session

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// إعداد الجلسة (session)

app.use(session({
  secret: process.env.SESSION_SECRET || 'put_a_strong_secret_here',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 2 } // مثلاً 2 ساعة
}));

// دالة مساعدة للتحقق من تسجيل الدخول
function ensureAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  // لو جيت من متصفح نعمل إعادة توجيه للصفحة الرئيسية (أو صفحة تسجيل الدخول)
  // لو كانت طلب API (Accept: application/json) نرجع خطأ 401
  const acceptsJson = req.headers.accept && req.headers.accept.indexOf('application/json') !== -1;
  if (acceptsJson) return res.status(401).json({ error: '🚫 الوصول مرفوض ' });
  return res.status(401).send('<h2>🚫 وصول مرفوض</h2>');
}

// حماية الوصول لملفات لوحة الإدارة قبل أن تُخدم كملفات ثابتة
// مهم: هذا middleware يجب أن يكون قبل express.static حتى يمنع الوصول المباشر
app.use((req, res, next) => {
  // منع الوصول المباشر لكل ملفات Admin-Html الموجودة تحت المسار "/Admin-Html"
  // (يقابل URLs مثل /Admin-Html/admin.html)
  if (req.path.startsWith('/Admin-Html')) {
    if (req.session && req.session.authenticated) return next();
    // لمنع الوصول المباشر نعيد توجيه أو نرف
    return res.status(401).send('<h2>🚫 </h2>');
  }
  next();
});

// نخلي ملفات HTML و CSS و uploads متاحة (باقي الكود كما كان)
app.use(express.static(path.join(__dirname, 'HTML')));
app.use('/CSS', express.static(path.join(__dirname, 'CSS')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// الصفحة الرئيسية
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'HTML/Intro-Html/intro.html')));

// ------------------ Login ------------------
// هنا بعد التحقق نضع علامة في الجلسة
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM admin WHERE username = ?`, [username], (err, row) => {
    if (err) return res.status(500).send(`<h2>خطأ: ${err.message}</h2>`);
    if (!row) return res.status(401).send('<h2>❌ اسم المستخدم غير موجود</h2>');
    if (row.password !== password) return res.status(401).send('<h2>❌ كلمة المرور غير صحيحة</h2>');
    // نجاح تسجيل الدخول
    req.session.authenticated = true;
    req.session.adminUser = username;
    // نرسل صفحة الادمن (أو نعيد توجيه)
    return res.sendFile(path.join(__dirname, 'HTML/Admin-Html/admin.html'));
  });
});

// logout
app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'فشل تسجيل الخروج' });
    res.json({ message: '✅ تم تسجيل الخروج' });
  });
});

// ------------------ Categories ------------------
app.get('/categories', (req, res) => {
  db.all(`SELECT * FROM categories ORDER BY name`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// حماية إنشاء التصنيف (خاص بالإدارة)
app.post('/categories', ensureAuth, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: '⚠️ اسم التصنيف مطلوب' });
  db.run(`INSERT INTO categories (name) VALUES (?)`, [name], function(err){
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, name });
  });
});

// ------------------ Products ------------------
// حماية إنشاء المنتج وتعديله وحذفه (العمليات الإدارية)
app.post('/products', ensureAuth, upload.single('image'), (req, res) => {
  const { name, description, price, category_id } = req.body;
  const image = req.file ? '/uploads/' + req.file.filename : null;
  if (!name || !price) return res.status(400).json({ error: '⚠️ لازم تدخل اسم المنتج و السعر' });
  db.run(`INSERT INTO products (image, name, description, price, category_id) VALUES (?, ?, ?, ?, ?)`,
    [image, name, description || null, price, category_id || null],
    function(err){
      if(err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, image, name, description, price, category_id });
    });
});


// تعديل التصنيف
app.put('/categories/:id', ensureAuth, (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: '⚠️ اسم التصنيف مطلوب' });

  db.run(`UPDATE categories SET name=? WHERE id=?`, [name, id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: '🚫 التصنيف غير موجود' });
    res.json({ message: '✅ تم تحديث التصنيف' });
  });
});

// حذف التصنيف
app.delete('/categories/:id', ensureAuth, (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM categories WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: '🚫 التصنيف غير موجود' });
    res.json({ message: '🗑️ تم حذف التصنيف بنجاح' });
  });
});


// قراءة المنتجات تبقى متاحة للجميع
app.get('/products', (req, res) => {
  db.all(`SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/products/:id', (req, res) => {
  db.get(`SELECT * FROM products WHERE id = ?`, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: '🚫 المنتج غير موجود' });
    res.json(row);
  });
});

app.put('/products/:id', ensureAuth, upload.single('image'), (req, res) => {
  const { id } = req.params;
  const { name, description, price, category_id } = req.body;
  const image = req.file ? '/uploads/' + req.file.filename : req.body.image || null;
  db.run(`UPDATE products SET image=?, name=?, description=?, price=?, category_id=? WHERE id=?`,
    [image, name, description || null, price, category_id || null, id],
    function(err){
      if(err) return res.status(500).json({ error: err.message });
      if(this.changes === 0) return res.status(404).json({ error: '🚫 المنتج غير موجود' });
      res.json({ message: '✅ تم تعديل المنتج بنجاح' });
    });
});

app.delete('/products/:id', ensureAuth, (req, res) => {
  db.run(`DELETE FROM products WHERE id=?`, [req.params.id], function(err){
    if(err) return res.status(500).json({ error: err.message });
    if(this.changes === 0) return res.status(404).json({ error: '🚫 المنتج غير موجود' });
    res.json({ message: '🗑️ تم حذف المنتج بنجاح' });
  });
});

// ------------------ Orders ------------------
// إنشاء الطلب يبقى متاح للجميع (الزبون)
app.post('/orders', (req, res) => {
  const { product_id, customer_name, customer_email, customer_phone, customer_address, quantity } = req.body;
  if(!product_id||!customer_name||!customer_email||!customer_phone||!customer_address||!quantity)
    return res.status(400).json({ error:'⚠️ لازم تدخل جميع البيانات' });

  db.get(`SELECT name, price FROM products WHERE id=?`, [product_id], (err, product)=>{
    if(err || !product) return res.status(400).json({ error:'❌ المنتج غير موجود' });
    const total_price = product.price * quantity;
    db.run(`INSERT INTO orders (product_id, customer_name, customer_email, customer_phone, customer_address, quantity, product_price, total_price) VALUES (?,?,?,?,?,?,?,?)`,
      [product_id, customer_name, customer_email, customer_phone, customer_address, quantity, product.price, total_price],
      function(err){
        if(err) return res.status(500).json({ error:'❌ فشل إنشاء الطلب' });
        res.json({ message:'✅ تم إنشاء الطلب بنجاح', order_id:this.lastID, product_name:product.name, product_price:product.price, total_price });
      });
  });
});

// عرض الطلبات — هذا راوت إداري فنحميه
app.get('/orders', ensureAuth, (req,res)=>{
  db.all(`SELECT o.id, p.name AS product_name, o.customer_name, o.customer_email, o.customer_phone, o.customer_address, o.quantity, o.product_price, o.total_price, o.status, o.created_at
          FROM orders o JOIN products p ON o.product_id = p.id ORDER BY o.created_at DESC`, [], (err, rows)=>{
    if(err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.put('/orders/:id/confirm', ensureAuth, (req,res)=>{
  const { id } = req.params;
  db.run(`UPDATE orders SET status='confirmed' WHERE id=?`, [id], function(err){
    if(err) return res.status(500).json({ error: err.message });
    if(this.changes===0) return res.status(404).json({ error:'🚫 الطلب غير موجود' });
    res.json({ message:'✅ تم تأكيد الطلب بنجاح' });
  });
});

app.delete('/orders/:id', ensureAuth, (req,res)=>{
  db.run(`DELETE FROM orders WHERE id=?`, [req.params.id], function(err){
    if(err) return res.status(500).json({ error: err.message });
    if(this.changes===0) return res.status(404).json({ error:'🚫 الطلب غير موجود' });
    res.json({ message:'🗑️ تم حذف الطلب بنجاح' });
  });
});

// ------------------ Start Server ------------------
app.listen(3000, ()=> console.log('🚀 السيرفر خدام على http://localhost:3000'));
