const express = require('express');

module.exports = function(db) {
  const router = express.Router();

  // 获取操作日志
  router.get('/logs', async (req, res) => {
    try {
      if (!['admin', 'supervisor'].includes(req.session.user.role)) {
        return res.status(403).json({ error: '权限不足' });
      }

      const { user_id, action, resource_type, start_date, end_date, page = 1, limit = 50 } = req.query;
      let sql = `
        SELECT al.*, u.real_name as user_name, u.department
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE 1=1
      `;
      const params = [];

      if (user_id) {
        sql += ' AND al.user_id = ?';
        params.push(user_id);
      }

      if (action) {
        sql += ' AND al.action = ?';
        params.push(action);
      }

      if (resource_type) {
        sql += ' AND al.resource_type = ?';
        params.push(resource_type);
      }

      if (start_date) {
        sql += ' AND DATE(al.timestamp) >= ?';
        params.push(start_date);
      }

      if (end_date) {
        sql += ' AND DATE(al.timestamp) <= ?';
        params.push(end_date);
      }

      sql += ' ORDER BY al.timestamp DESC';

      // 分页
      const offset = (page - 1) * limit;
      sql += ` LIMIT ? OFFSET ?`;
      params.push(parseInt(limit), offset);

      const logs = await db.query(sql, params);

      // 获取总数
      let countSql = `
        SELECT COUNT(*) as total
        FROM audit_logs al
        WHERE 1=1
      `;
      const countParams = [];

      if (user_id) {
        countSql += ' AND al.user_id = ?';
        countParams.push(user_id);
      }

      if (action) {
        countSql += ' AND al.action = ?';
        countParams.push(action);
      }

      if (resource_type) {
        countSql += ' AND al.resource_type = ?';
        countParams.push(resource_type);
      }

      if (start_date) {
        countSql += ' AND DATE(al.timestamp) >= ?';
        countParams.push(start_date);
      }

      if (end_date) {
        countSql += ' AND DATE(al.timestamp) <= ?';
        countParams.push(end_date);
      }

      const countResult = await db.query(countSql, countParams);
      const total = countResult[0].total;

      res.json({
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      console.error('获取审计日志错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  });

  // 获取审计统计
  router.get('/statistics', async (req, res) => {
    try {
      if (!['admin', 'supervisor'].includes(req.session.user.role)) {
        return res.status(403).json({ error: '权限不足' });
      }

      // 按操作类型统计
      const actionStats = await db.query(`
        SELECT action, COUNT(*) as count 
        FROM audit_logs 
        WHERE DATE(timestamp) >= DATE('now', '-30 days')
        GROUP BY action 
        ORDER BY count DESC
      `);

      // 按用户统计
      const userStats = await db.query(`
        SELECT u.real_name, COUNT(*) as count 
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE DATE(al.timestamp) >= DATE('now', '-30 days')
        GROUP BY al.user_id 
        ORDER BY count DESC
        LIMIT 10
      `);

      // 每日活动统计
      const dailyStats = await db.query(`
        SELECT DATE(timestamp) as date, COUNT(*) as count 
        FROM audit_logs 
        WHERE DATE(timestamp) >= DATE('now', '-7 days')
        GROUP BY DATE(timestamp) 
        ORDER BY date
      `);

      res.json({
        actionStats,
        userStats,
        dailyStats
      });

    } catch (error) {
      console.error('获取审计统计错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  });

  return router;
};