const express = require('express');

module.exports = function(db) {
  const router = express.Router();

  // 获取秘密台账列表
  router.get('/', async (req, res) => {
    try {
      const { status, secrecy_level, department } = req.query;
      let sql = `
        SELECT sl.*, sa.proposer_id, p.real_name as proposer_name
        FROM secrets_ledger sl
        LEFT JOIN secrecy_applications sa ON sl.application_id = sa.id
        LEFT JOIN users p ON sa.proposer_id = p.id
        WHERE 1=1
      `;
      const params = [];

      if (status) {
        sql += ' AND sl.status = ?';
        params.push(status);
      }

      if (secrecy_level) {
        sql += ' AND sl.secrecy_level = ?';
        params.push(secrecy_level);
      }

      if (department) {
        sql += ' AND sl.department = ?';
        params.push(department);
      }

      sql += ' ORDER BY sl.created_date DESC';

      const secrets = await db.query(sql, params);
      res.json({ secrets });

    } catch (error) {
      console.error('获取台账列表错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  });

  // 获取统计信息
  router.get('/statistics', async (req, res) => {
    try {
      // 按密级统计
      const levelStats = await db.query(`
        SELECT secrecy_level, COUNT(*) as count 
        FROM secrets_ledger 
        WHERE status = 'active' 
        GROUP BY secrecy_level
      `);

      // 按部门统计
      const departmentStats = await db.query(`
        SELECT department, COUNT(*) as count 
        FROM secrets_ledger 
        WHERE status = 'active' 
        GROUP BY department
      `);

      // 按状态统计
      const statusStats = await db.query(`
        SELECT status, COUNT(*) as count 
        FROM secrets_ledger 
        GROUP BY status
      `);

      // 即将到期的秘密
      const expiringSoon = await db.query(`
        SELECT COUNT(*) as count 
        FROM secrets_ledger 
        WHERE status = 'active' 
        AND expiry_date IS NOT NULL 
        AND DATE(expiry_date) <= DATE('now', '+30 days')
      `);

      res.json({
        levelStats,
        departmentStats,
        statusStats,
        expiringSoon: expiringSoon[0].count
      });

    } catch (error) {
      console.error('获取统计信息错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  });

  // 变更秘密状态
  router.patch('/:id/status', async (req, res) => {
    try {
      const { id } = req.params;
      const { status, reason } = req.body;

      if (!status || !['active', 'changed', 'declassified'].includes(status)) {
        return res.status(400).json({ error: '无效的状态' });
      }

      // 获取当前记录
      const secrets = await db.query('SELECT * FROM secrets_ledger WHERE id = ?', [id]);
      if (secrets.length === 0) {
        return res.status(404).json({ error: '记录不存在' });
      }

      const secret = secrets[0];
      const changeHistory = secret.change_history ? JSON.parse(secret.change_history) : [];
      
      // 添加变更记录
      changeHistory.push({
        timestamp: new Date().toISOString(),
        user: req.session.user.real_name,
        from_status: secret.status,
        to_status: status,
        reason: reason || ''
      });

      await db.run(
        'UPDATE secrets_ledger SET status = ?, change_history = ? WHERE id = ?',
        [status, JSON.stringify(changeHistory), id]
      );

      // 记录操作日志
      await db.run(
        'INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details) VALUES (?, ?, ?, ?, ?)',
        [req.session.user.id, 'update', 'secret', id, `变更秘密状态: ${secret.status} -> ${status}`]
      );

      res.json({ success: true });

    } catch (error) {
      console.error('变更状态错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  });

  return router;
};