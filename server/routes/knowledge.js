const express = require('express');

module.exports = function(db) {
  const router = express.Router();

  // 获取知识库列表
  router.get('/', async (req, res) => {
    try {
      const { category, keyword } = req.query;
      let sql = `
        SELECT kb.*, u.real_name as creator_name 
        FROM knowledge_base kb 
        LEFT JOIN users u ON kb.created_by = u.id 
        WHERE 1=1
      `;
      const params = [];

      if (category) {
        sql += ' AND kb.category = ?';
        params.push(category);
      }

      if (keyword) {
        sql += ' AND (kb.title LIKE ? OR kb.content LIKE ? OR kb.keywords LIKE ?)';
        const searchTerm = `%${keyword}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }

      sql += ' ORDER BY kb.created_at DESC';

      const knowledge = await db.query(sql, params);
      res.json({ knowledge });

    } catch (error) {
      console.error('获取知识库错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  });

  // 获取知识库分类
  router.get('/categories', async (req, res) => {
    try {
      const categories = await db.query('SELECT DISTINCT category FROM knowledge_base ORDER BY category');
      res.json({ categories: categories.map(c => c.category) });

    } catch (error) {
      console.error('获取分类错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  });

  // 创建知识条目
  router.post('/', async (req, res) => {
    try {
      const { title, content, category, source, keywords } = req.body;
      
      if (!title || !content || !category) {
        return res.status(400).json({ error: '标题、内容和分类不能为空' });
      }

      const result = await db.run(
        'INSERT INTO knowledge_base (title, content, category, source, keywords, created_by) VALUES (?, ?, ?, ?, ?, ?)',
        [title, content, category, source, keywords, req.session.user.id]
      );

      // 记录操作日志
      await db.run(
        'INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details) VALUES (?, ?, ?, ?, ?)',
        [req.session.user.id, 'create', 'knowledge', result.id, `创建知识条目: ${title}`]
      );

      res.json({ success: true, id: result.id });

    } catch (error) {
      console.error('创建知识条目错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  });

  // 获取单个知识条目
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const knowledge = await db.query(
        'SELECT kb.*, u.real_name as creator_name FROM knowledge_base kb LEFT JOIN users u ON kb.created_by = u.id WHERE kb.id = ?',
        [id]
      );

      if (knowledge.length === 0) {
        return res.status(404).json({ error: '知识条目不存在' });
      }

      res.json({ knowledge: knowledge[0] });

    } catch (error) {
      console.error('获取知识条目错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  });

  return router;
};