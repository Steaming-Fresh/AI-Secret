const express = require('express');

module.exports = function(db) {
  const router = express.Router();

  // 获取申请列表
  router.get('/applications', async (req, res) => {
    try {
      const { status, proposer_id } = req.query;
      let sql = `
        SELECT sa.*, 
               p.real_name as proposer_name, 
               a.real_name as approver_name,
               kb.title as basis_title
        FROM secrecy_applications sa
        LEFT JOIN users p ON sa.proposer_id = p.id
        LEFT JOIN users a ON sa.approver_id = a.id
        LEFT JOIN knowledge_base kb ON sa.basis_id = kb.id
        WHERE 1=1
      `;
      const params = [];

      // 根据用户角色过滤数据
      if (req.session.user.role === 'proposer') {
        sql += ' AND sa.proposer_id = ?';
        params.push(req.session.user.id);
      } else if (req.session.user.role === 'officer') {
        sql += ' AND (sa.status = "pending" OR sa.approver_id = ?)';
        params.push(req.session.user.id);
      }

      if (status) {
        sql += ' AND sa.status = ?';
        params.push(status);
      }

      if (proposer_id) {
        sql += ' AND sa.proposer_id = ?';
        params.push(proposer_id);
      }

      sql += ' ORDER BY sa.submitted_at DESC';

      const applications = await db.query(sql, params);
      res.json({ applications });

    } catch (error) {
      console.error('获取申请列表错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  });

  // 提交定密申请
  router.post('/applications', async (req, res) => {
    try {
      if (req.session.user.role !== 'proposer') {
        return res.status(403).json({ error: '只有承办人可以提交申请' });
      }

      const { title, content, secrecy_level, basis_id, reason, scope, duration } = req.body;
      
      if (!title || !content || !secrecy_level || !reason || !scope) {
        return res.status(400).json({ error: '必填字段不能为空' });
      }

      const result = await db.run(
        `INSERT INTO secrecy_applications 
         (title, content, secrecy_level, basis_id, reason, scope, duration, proposer_id) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [title, content, secrecy_level, basis_id, reason, scope, duration, req.session.user.id]
      );

      // 记录操作日志
      await db.run(
        'INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details) VALUES (?, ?, ?, ?, ?)',
        [req.session.user.id, 'create', 'application', result.id, `提交定密申请: ${title}`]
      );

      res.json({ success: true, applicationId: result.id });

    } catch (error) {
      console.error('提交申请错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  });

  // 审批申请
  router.patch('/applications/:id/approve', async (req, res) => {
    try {
      if (req.session.user.role !== 'officer') {
        return res.status(403).json({ error: '只有定密责任人可以审批' });
      }

      const { id } = req.params;
      const { action, comments } = req.body; // action: 'approve' or 'reject'

      if (!action || !['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: '无效的操作类型' });
      }

      const status = action === 'approve' ? 'approved' : 'rejected';
      
      await db.run(
        'UPDATE secrecy_applications SET status = ?, approver_id = ?, approved_at = CURRENT_TIMESTAMP, comments = ? WHERE id = ?',
        [status, req.session.user.id, comments, id]
      );

      // 如果批准，生成台账记录
      if (action === 'approve') {
        const applications = await db.query('SELECT * FROM secrecy_applications WHERE id = ?', [id]);
        if (applications.length > 0) {
          const app = applications[0];
          const secretNumber = `SEC-${new Date().getFullYear()}-${String(id).padStart(6, '0')}`;
          
          await db.run(
            `INSERT INTO secrets_ledger 
             (application_id, secret_number, title, secrecy_level, department, keeper, created_date, expiry_date) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id, 
              secretNumber, 
              app.title, 
              app.secrecy_level, 
              req.session.user.department, 
              req.session.user.real_name,
              new Date().toISOString().split('T')[0],
              app.duration ? new Date(Date.now() + parseInt(app.duration) * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : null
            ]
          );
        }
      }

      // 记录操作日志
      await db.run(
        'INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details) VALUES (?, ?, ?, ?, ?)',
        [req.session.user.id, action, 'application', id, `${action === 'approve' ? '批准' : '驳回'}申请: ${comments || ''}`]
      );

      res.json({ success: true });

    } catch (error) {
      console.error('审批申请错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  });

  return router;
};