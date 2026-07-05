// ============================================================
//  入境游管理系统 - 多人协作后端
//  Express + JSON File + JWT 认证 (纯JS，无需编译)
// ============================================================

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const DATA_FILE = process.env.DB_PATH || path.join(__dirname, 'store.json');

// ============ JSON File Storage ============
// 数据结构: { appData: {...}, users: [...], version: 0, updatedBy: '', updatedAt: '' }

function loadStore() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { appData: { tours: [], suppliers: [], financeData: { revenues: [], payments: {}, reimbursements: [] } }, users: [], version: 0, updatedBy: '', updatedAt: '' };
  }
}

function saveStore(store) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

// Initialize store
let store = loadStore();

// Initialize admin user if none exist
if (!store.users || store.users.length === 0) {
  store.users = [{
    id: 1,
    username: 'admin',
    password: bcrypt.hashSync('admin123', 10),
    displayName: '管理员',
    role: 'admin',
    createdAt: new Date().toISOString()
  }];
  saveStore(store);
  console.log('[初始化] 默认管理员账号已创建: admin / admin123');
}

// Helper: get next user ID
function nextUserId() {
  return store.users.length > 0 ? Math.max(...store.users.map(u => u.id)) + 1 : 1;
}

// ============ Middleware ============
app.use(express.json({ limit: '50mb' }));

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  next();
}

// ============ API Routes ============

// --- 登录 ---
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });

  // 重新加载文件（防止多进程/多实例数据不同步）
  store = loadStore();
  const user = store.users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    token,
    user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role }
  });
});

// --- 验证 token ---
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// --- 获取数据 ---
app.get('/api/data', requireAuth, (req, res) => {
  store = loadStore();
  res.json({
    data: store.appData,
    version: store.version || 0,
    updatedBy: store.updatedBy || '',
    updatedAt: store.updatedAt || ''
  });
});

// --- 保存数据 (乐观锁) ---
app.post('/api/data', requireAuth, (req, res) => {
  const { data, version } = req.body;
  if (!data) return res.status(400).json({ error: '数据不能为空' });

  store = loadStore();
  const currentVersion = store.version || 0;

  // 版本检查：防止多人同时编辑互相覆盖
  if (version !== undefined && version !== currentVersion) {
    return res.status(409).json({
      error: '数据已被其他人修改，请刷新后重试',
      currentVersion: currentVersion,
      updatedBy: store.updatedBy,
      updatedAt: store.updatedAt
    });
  }

  const newVersion = currentVersion + 1;
  const now = new Date().toISOString();
  store.appData = data;
  store.version = newVersion;
  store.updatedBy = req.user.displayName;
  store.updatedAt = now;
  saveStore(store);

  res.json({ success: true, version: newVersion, updatedBy: req.user.displayName, updatedAt: now });
});

// --- 用户列表 (管理员) ---
app.get('/api/users', requireAuth, requireAdmin, (req, res) => {
  store = loadStore();
  res.json(store.users.map(u => ({
    id: u.id, username: u.username, displayName: u.displayName, role: u.role, createdAt: u.createdAt
  })));
});

// --- 创建用户 (管理员) ---
app.post('/api/users', requireAuth, requireAdmin, (req, res) => {
  const { username, password, displayName, role } = req.body;
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: '用户名、密码和显示名称不能为空' });
  }
  store = loadStore();
  if (store.users.some(u => u.username === username)) {
    return res.status(400).json({ error: '用户名已存在' });
  }
  const newUser = {
    id: nextUserId(),
    username,
    password: bcrypt.hashSync(password, 10),
    displayName,
    role: role || 'user',
    createdAt: new Date().toISOString()
  };
  store.users.push(newUser);
  saveStore(store);
  res.json({ success: true, user: { id: newUser.id, username, displayName, role: newUser.role } });
});

// --- 删除用户 (管理员) ---
app.delete('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
  const userId = parseInt(req.params.id);
  if (userId === req.user.id) return res.status(400).json({ error: '不能删除自己' });
  store = loadStore();
  const idx = store.users.findIndex(u => u.id === userId);
  if (idx === -1) return res.status(404).json({ error: '用户不存在' });
  store.users.splice(idx, 1);
  saveStore(store);
  res.json({ success: true });
});

// --- 修改密码 ---
app.post('/api/change-password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ error: '请填写原密码和新密码' });
  store = loadStore();
  const user = store.users.find(u => u.id === req.user.id);
  if (!user || !bcrypt.compareSync(oldPassword, user.password)) {
    return res.status(400).json({ error: '原密码错误' });
  }
  user.password = bcrypt.hashSync(newPassword, 10);
  saveStore(store);
  res.json({ success: true });
});

// --- 注入演示数据 (管理员) ---
app.post('/api/seed-demo', requireAuth, requireAdmin, (req, res) => {
  const demoData = req.body.data;
  if (!demoData) return res.status(400).json({ error: '演示数据不能为空' });
  store = loadStore();
  store.appData = demoData;
  store.version = (store.version || 0) + 1;
  store.updatedBy = req.user.displayName;
  store.updatedAt = new Date().toISOString();
  saveStore(store);
  res.json({ success: true, version: store.version });
});

// ============ Static Files ============
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// ============ Start ============
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  入境游管理系统已启动`);
  console.log(`  访问地址: http://localhost:${PORT}`);
  console.log(`  管理员账号: admin / admin123\n`);
});
