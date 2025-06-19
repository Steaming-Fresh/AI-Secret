const express = require('express');
const session = require('express-session');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 数据库设置
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
  } else {
    console.log('已连接到SQLite数据库');
    initializeDatabase();
  }
});

// 数据库操作包装器
const dbWrapper = {
  query: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },
  run: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }
};

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'secrecy-management-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24小时
}));

// 静态文件服务
app.use(express.static('public'));

// 认证中间件
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: '请先登录' });
  }
  next();
};

// 登录路由
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const users = await dbWrapper.query(
      'SELECT * FROM users WHERE username = ? AND status = "active"',
      [username]
    );
    
    if (users.length === 0) {
      return res.status(401).json({ error: '用户不存在或已禁用' });
    }
    
    const user = users[0];
    const isPasswordValid = bcrypt.compareSync(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ error: '密码错误' });
    }
    
    // 保存用户信息到session
    req.session.user = {
      id: user.id,
      username: user.username,
      real_name: user.real_name,
      role: user.role,
      department: user.department
    };
    
    // 记录登录日志
    await dbWrapper.run(
      'INSERT INTO audit_logs (user_id, action, resource_type, details) VALUES (?, ?, ?, ?)',
      [user.id, 'login', 'system', `用户登录: ${username}`]
    );
    
    res.json({ 
      success: true, 
      user: req.session.user 
    });
    
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 注销路由
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// 获取当前用户信息
app.get('/api/user', requireAuth, (req, res) => {
  res.json({ user: req.session.user });
});

// 工作台统计数据
app.get('/api/dashboard', requireAuth, async (req, res) => {
  try {
    // 总秘密数量
    const totalSecrets = await dbWrapper.query(
      'SELECT COUNT(*) as count FROM secrets_ledger WHERE status = "active"'
    );
    
    // 待审批申请
    const pendingApplications = await dbWrapper.query(
      'SELECT COUNT(*) as count FROM secrecy_applications WHERE status = "pending"'
    );
    
    // 即将到期
    const expiringSoon = await dbWrapper.query(`
      SELECT COUNT(*) as count FROM secrets_ledger 
      WHERE status = 'active' AND expiry_date IS NOT NULL 
      AND DATE(expiry_date) <= DATE('now', '+30 days')
    `);
    
    // 最近活动
    const recentLogs = await dbWrapper.query(`
      SELECT al.*, u.real_name as user_name 
      FROM audit_logs al 
      LEFT JOIN users u ON al.user_id = u.id 
      ORDER BY al.timestamp DESC 
      LIMIT 10
    `);
    
    res.json({
      totalSecrets: totalSecrets[0].count,
      pendingApplications: pendingApplications[0].count,
      expiringSoon: expiringSoon[0].count,
      recentLogs
    });
    
  } catch (error) {
    console.error('获取工作台数据错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// API路由
app.use('/api/users', requireAuth, require('./server/routes/users')(dbWrapper));
app.use('/api/knowledge', requireAuth, require('./server/routes/knowledge')(dbWrapper));
app.use('/api/workflow', requireAuth, require('./server/routes/workflow')(dbWrapper));
app.use('/api/ledger', requireAuth, require('./server/routes/ledger')(dbWrapper));
app.use('/api/audit', requireAuth, require('./server/routes/audit')(dbWrapper));

// 路由设置
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// 初始化数据库
async function initializeDatabase() {
  try {
    // 创建用户表
    await dbWrapper.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        real_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'proposer', 'officer', 'supervisor')),
        department TEXT,
        email TEXT,
        phone TEXT,
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建知识库表
    await dbWrapper.run(`
      CREATE TABLE IF NOT EXISTS knowledge_base (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        source TEXT,
        keywords TEXT,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users (id)
      )
    `);

    // 创建定密申请表
    await dbWrapper.run(`
      CREATE TABLE IF NOT EXISTS secrecy_applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        secrecy_level TEXT NOT NULL CHECK (secrecy_level IN ('绝密', '机密', '秘密')),
        basis_id INTEGER,
        reason TEXT NOT NULL,
        scope TEXT NOT NULL,
        duration INTEGER,
        proposer_id INTEGER NOT NULL,
        approver_id INTEGER,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        comments TEXT,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        approved_at DATETIME,
        FOREIGN KEY (proposer_id) REFERENCES users (id),
        FOREIGN KEY (approver_id) REFERENCES users (id),
        FOREIGN KEY (basis_id) REFERENCES knowledge_base (id)
      )
    `);

    // 创建秘密台账表
    await dbWrapper.run(`
      CREATE TABLE IF NOT EXISTS secrets_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id INTEGER NOT NULL,
        secret_number TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        secrecy_level TEXT NOT NULL,
        department TEXT,
        keeper TEXT,
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'changed', 'declassified')),
        created_date DATE,
        expiry_date DATE,
        change_history TEXT,
        FOREIGN KEY (application_id) REFERENCES secrecy_applications (id)
      )
    `);

    // 创建审计日志表
    await dbWrapper.run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id INTEGER,
        details TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
    `);

    // 创建默认用户
    await createDefaultUsers();
    await createDefaultKnowledge();
    
    console.log('数据库初始化完成');
    
  } catch (error) {
    console.error('数据库初始化错误:', error);
  }
}

// 创建默认用户
async function createDefaultUsers() {
  const defaultUsers = [
    { username: 'admin', password: 'admin123', real_name: '系统管理员', role: 'admin', department: '系统部' },
    { username: 'proposer', password: 'prop123', real_name: '张承办', role: 'proposer', department: '业务部' },
    { username: 'officer', password: 'off123', real_name: '李责任', role: 'officer', department: '保密办' },
    { username: 'supervisor', password: 'sup123', real_name: '王监督', role: 'supervisor', department: '监察部' }
  ];

  for (const user of defaultUsers) {
    try {
      const existing = await dbWrapper.query('SELECT id FROM users WHERE username = ?', [user.username]);
      if (existing.length === 0) {
        const hashedPassword = bcrypt.hashSync(user.password, 10);
        await dbWrapper.run(
          'INSERT INTO users (username, password, real_name, role, department) VALUES (?, ?, ?, ?, ?)',
          [user.username, hashedPassword, user.real_name, user.role, user.department]
        );
        console.log(`创建用户: ${user.username}`);
      }
    } catch (error) {
      console.error(`创建用户 ${user.username} 失败:`, error);
    }
  }
}

// 创建默认知识库数据
async function createDefaultKnowledge() {
  const knowledgeItems = [
    {
      title: '保守国家秘密法第九条',
      content: '下列涉及国家安全和利益的事项，泄露后可能损害国家在政治、经济、国防、外交等领域的安全和利益的，应当确定为国家秘密...',
      category: '法律法规',
      source: '《保守国家秘密法》',
      keywords: '国家秘密,确定,条件'
    },
    {
      title: '定密权限规定',
      content: '中央国家机关、省级机关及其授权的机关、单位可以确定绝密级国家秘密；设区的市、自治州一级的机关及其授权的机关、单位可以确定机密级和秘密级国家秘密...',
      category: '权限规定',
      source: '《保守国家秘密法实施条例》',
      keywords: '定密权限,机关,授权'
    }
  ];

  for (const item of knowledgeItems) {
    try {
      const existing = await dbWrapper.query('SELECT id FROM knowledge_base WHERE title = ?', [item.title]);
      if (existing.length === 0) {
        await dbWrapper.run(
          'INSERT INTO knowledge_base (title, content, category, source, keywords, created_by) VALUES (?, ?, ?, ?, ?, ?)',
          [item.title, item.content, item.category, item.source, item.keywords, 1]
        );
      }
    } catch (error) {
      console.error(`创建知识条目失败:`, error);
    }
  }
}

// 启动服务器
app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log('演示账户:');
  console.log('- 管理员: admin / admin123');
  console.log('- 承办人: proposer / prop123');
  console.log('- 定密责任人: officer / off123');
  console.log('- 监督员: supervisor / sup123');
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...');
  db.close((err) => {
    if (err) {
      console.error('关闭数据库连接出错:', err.message);
    } else {
      console.log('数据库连接已关闭');
    }
  });
  process.exit(0);
});