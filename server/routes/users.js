const express = require('express');
const bcrypt = require('bcryptjs');

module.exports = function(db) {
  const router = express.Router();

  // 获取用户列表
  router.get('/', async (req, res) => {
    try {
      const users = await db.query(`
        SELECT id, username, real_name, role, department, email, phone, status, created_at 
        FROM users 
        ORDER BY created_at DESC
      `);
      
      res.json({ users });

    } catch (error) {
      console.error('获取用户列表错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  });

  // 创建用户 (仅管理员)
  router.post('/', async (req, res) => {
    try {
      if (req.session.user.role !== 'admin') {
        return res.status(403).json({ error: '权限不足' });
      }

      const { username, password, real_name, role, department, email, phone } = req.body;
      
      if (!username || !password || !real_name || !role) {
        return res.status(400).json({ error: '必填字段不能为空' });
      }

      const hashedPassword = bcrypt.hashSync(password, 10);
      
      const result = await db.run(
        'INSERT INTO users (username, password, real_name, role, department, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [username, hashedPassword, real_name, role, department, email, phone]
      );

      // 记录操作日志
      await db.run(
        'INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details) VALUES (?, ?, ?, ?, ?)',
        [req.session.user.id, 'create', 'user', result.id, `创建用户: ${username}`]
      );

      res.json({ success: true, userId: result.id });

    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        res.status(400).json({ error: '用户名已存在' });
      } else {
        console.error('创建用户错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
      }
    }
  });

  // 更新用户状态
  router.patch('/:id/status', async (req, res) => {
    try {
      if (req.session.user.role !== 'admin') {
        return res.status(403).json({ error: '权限不足' });
      }

      const { id } = req.params;
      const { status } = req.body;

      await db.run('UPDATE users SET status = ? WHERE id = ?', [status, id]);

      // 记录操作日志
      await db.run(
        'INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details) VALUES (?, ?, ?, ?, ?)',
        [req.session.user.id, 'update', 'user', id, `更新用户状态: ${status}`]
      );

      res.json({ success: true });

    } catch (error) {
      console.error('更新用户状态错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  });

  return router;
};