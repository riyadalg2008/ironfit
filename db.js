// db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// مسار قاعدة البيانات
const dbPath = path.resolve(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('خطأ في فتح قاعدة البيانات:', err.message);
  } else {
    console.log('✅ تم الاتصال بقاعدة البيانات');
  }
});

// إنشاء جدول admin إذا ماكانش موجود
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `, (err) => {
    if (err) {
      console.error('خطأ في إنشاء جدول admin:', err.message);
    } else {
      console.log('✅ تم التأكد من وجود جدول admin');
    }
  });
});

// إدخال حساب الأدمين الافتراضي fouzi / admin-V1 إذا ماكانش موجود
db.get(`SELECT * FROM admin WHERE username = ?`, ['fouzi'], (err, row) => {
  if (err) {
    console.error('خطأ في جلب الأدمين:', err.message);
  } else if (!row) {
    db.run(
      `INSERT INTO admin (username, password) VALUES (?, ?)`,
      ['fouzi', 'admin-V1'],
      (err) => {
        if (err) {
          console.error('خطأ في إدخال الأدمين:', err.message);
        } else {
          console.log('✅ تم إدخال الأدمين الافتراضي (fouzi / admin-V1)');
        }
      }
    );
  }
});

// إنشاء جدول المنتجات إذا ماكانش موجود
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image TEXT,             -- صورة المنتج (رابط أو مسار)
      name TEXT NOT NULL,     -- اسم المنتج
      description TEXT,       -- وصف المنتج
      price REAL NOT NULL     -- سعر المنتج
    )
  `, (err) => {
    if (err) {
      console.error('خطأ في إنشاء جدول المنتجات:', err.message);
    } else {
      console.log('✅ تم التأكد من وجود جدول المنتجات');
    }
  });
});


// إضافة في db.js
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    )
  `, (err) => {
    if (err) console.error('خطأ في إنشاء جدول التصنيفات:', err.message);
    else console.log('✅ تم التأكد من وجود جدول التصنيفات');
  });

  // إضافة عمود category_id للمنتجات
  db.run(`
    ALTER TABLE products
    ADD COLUMN category_id INTEGER
  `, [], (err) => {
    if (err && !err.message.includes('duplicate column name')) console.error('خطأ إضافة عمود التصنيف:', err.message);
    else console.log('✅ تم التأكد من وجود عمود التصنيف في المنتجات');
  });
});


// إنشاء جدول الطلبات إذا ماكانش موجود
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_address TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      product_price REAL NOT NULL,      -- السعر الفردي للمنتج وقت الشراء
      total_price REAL NOT NULL,        -- السعر الكلي
      status TEXT DEFAULT 'pending',    -- حالة الطلب
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `, (err) => {
    if (err) {
      console.error('خطأ في إنشاء جدول الطلبات:', err.message);
    } else {
      console.log('✅ تم التأكد من وجود جدول الطلبات');
    }
  });
});

module.exports = db;
