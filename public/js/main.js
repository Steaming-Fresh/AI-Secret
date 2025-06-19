let currentUser = null;

document.addEventListener('DOMContentLoaded', async function() {
    // 只在主页面执行，避免在登录页面执行
    if (window.location.pathname === '/index.html' ||
        (window.location.pathname === '/' && document.getElementById('user-name'))) {
        
        // 检查登录状态
        await checkAuthStatus();
        
        // 初始化界面
        initializeInterface();
        
        // 加载初始数据
        await loadDashboardData();
    }
});

// 检查认证状态
async function checkAuthStatus() {
    try {
        const response = await fetch('/api/user');
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            updateUserInfo();
            updateMenuVisibility();
        } else {
            // 未登录，跳转到登录页
            window.location.href = '/login.html';
        }
    } catch (error) {
        console.error('检查登录状态错误:', error);
        window.location.href = '/login.html';
    }
}

// 更新用户信息显示
function updateUserInfo() {
    document.getElementById('user-name').textContent = currentUser.real_name;
    document.getElementById('user-role').textContent = getRoleName(currentUser.role);
}

// 获取角色中文名称
function getRoleName(role) {
    const roleNames = {
        admin: '系统管理员',
        proposer: '承办人',
        officer: '定密责任人',
        supervisor: '监督员'
    };
    return roleNames[role] || role;
}

// 根据用户角色更新菜单可见性
function updateMenuVisibility() {
    const navItems = document.querySelectorAll('.nav-item[data-roles]');
    navItems.forEach(item => {
        const allowedRoles = item.dataset.roles.split(',');
        if (allowedRoles.includes(currentUser.role)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

// 初始化界面交互
function initializeInterface() {
    // 导航菜单切换
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            if (this.style.display === 'none') return;
            
            // 移除所有活动状态
            navItems.forEach(nav => nav.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
            
            // 添加当前活动状态
            this.classList.add('active');
            const tabId = this.dataset.tab + '-tab';
            document.getElementById(tabId).classList.add('active');
            
            // 加载对应模块数据
            loadModuleData(this.dataset.tab);
        });
    });

    // 注销按钮
    document.getElementById('logout-btn').addEventListener('click', logout);

    // 模态框处理
    setupModal();
}

// 加载工作台数据
async function loadDashboardData() {
    try {
        const response = await fetch('/api/dashboard');
        const data = await response.json();
        
        document.getElementById('total-secrets').textContent = data.totalSecrets;
        document.getElementById('pending-applications').textContent = data.pendingApplications;
        document.getElementById('expiring-soon').textContent = data.expiringSoon;
        
        // 显示最近活动
        const recentLogs = document.getElementById('recent-logs');
        recentLogs.innerHTML = data.recentLogs.map(log => `
            <div class="activity-item">
                <span class="activity-user">${log.user_name}</span>
                <span class="activity-action">${getActionName(log.action)}</span>
                <span class="activity-time">${formatDateTime(log.timestamp)}</span>
                <div class="activity-details">${log.details}</div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('加载工作台数据错误:', error);
    }
}

// 根据标签加载对应模块数据
async function loadModuleData(module) {
    switch (module) {
        case 'knowledge':
            await loadKnowledgeData();
            break;
        case 'workflow':
            await loadWorkflowData();
            break;
        case 'ledger':
            await loadLedgerData();
            break;
        case 'users':
            await loadUsersData();
            break;
        case 'audit':
            await loadAuditData();
            break;
    }
}

// 加载知识库数据
async function loadKnowledgeData() {
    try {
        const response = await fetch('/api/knowledge');
        const data = await response.json();
        
        const knowledgeList = document.getElementById('knowledge-list');
        knowledgeList.innerHTML = data.knowledge.map(item => `
            <div class="knowledge-item">
                <h4>${item.title}</h4>
                <p class="knowledge-category">分类: ${item.category}</p>
                <p class="knowledge-content">${item.content.substring(0, 200)}...</p>
                <div class="knowledge-meta">
                    <span>创建者: ${item.creator_name || '未知'}</span>
                    <span>创建时间: ${formatDateTime(item.created_at)}</span>
                </div>
            </div>
        `).join('');
        
        // 加载分类选项
        const categoryResponse = await fetch('/api/knowledge/categories');
        const categoryData = await categoryResponse.json();
        const categoryFilter = document.getElementById('category-filter');
        categoryFilter.innerHTML = '<option value="">全部分类</option>' + 
            categoryData.categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
            
    } catch (error) {
        console.error('加载知识库数据错误:', error);
    }
}

// 加载工作流数据
async function loadWorkflowData() {
    try {
        const response = await fetch('/api/workflow/applications');
        const data = await response.json();
        
        const applicationsList = document.getElementById('applications-list');
        applicationsList.innerHTML = data.applications.map(app => `
            <div class="application-item">
                <div class="application-header">
                    <h4>${app.title}</h4>
                    <span class="status-badge status-${app.status}">${getStatusName(app.status)}</span>
                </div>
                <div class="application-info">
                    <span>密级: ${app.secrecy_level}</span>
                    <span>申请人: ${app.proposer_name}</span>
                    <span>提交时间: ${formatDateTime(app.submitted_at)}</span>
                </div>
                <div class="application-content">
                    ${app.content.substring(0, 100)}...
                </div>
                ${app.status === 'pending' && currentUser.role === 'officer' ? 
                    `<div class="application-actions">
                        <button class="btn btn-success" onclick="approveApplication(${app.id}, 'approve')">批准</button>
                        <button class="btn btn-danger" onclick="approveApplication(${app.id}, 'reject')">驳回</button>
                    </div>` : ''}
            </div>
        `).join('');
        
        // 显示新申请按钮
        const newAppBtn = document.getElementById('new-application-btn');
        if (currentUser.role === 'proposer') {
            newAppBtn.style.display = 'block';
            newAppBtn.onclick = showNewApplicationForm;
        } else {
            newAppBtn.style.display = 'none';
        }
        
    } catch (error) {
        console.error('加载工作流数据错误:', error);
    }
}

// 加载台账数据
async function loadLedgerData() {
    try {
        const response = await fetch('/api/ledger');
        const data = await response.json();
        
        const secretsList = document.getElementById('secrets-list');
        secretsList.innerHTML = data.secrets.map(secret => `
            <div class="secret-item">
                <div class="secret-header">
                    <h4>${secret.title}</h4>
                    <span class="level-badge level-${secret.secrecy_level}">${secret.secrecy_level}</span>
                    <span class="status-badge status-${secret.status}">${getStatusName(secret.status)}</span>
                </div>
                <div class="secret-info">
                    <span>编号: ${secret.secret_number}</span>
                    <span>部门: ${secret.department}</span>
                    <span>保管人: ${secret.keeper}</span>
                </div>
                <div class="secret-dates">
                    <span>创建日期: ${secret.created_date}</span>
                    ${secret.expiry_date ? `<span>到期日期: ${secret.expiry_date}</span>` : ''}
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('加载台账数据错误:', error);
    }
}

// 加载用户数据
async function loadUsersData() {
    if (currentUser.role !== 'admin') return;
    
    try {
        const response = await fetch('/api/users');
        const data = await response.json();
        
        const usersList = document.getElementById('users-list');
        usersList.innerHTML = data.users.map(user => `
            <div class="user-item">
                <div class="user-info">
                    <h4>${user.real_name} (${user.username})</h4>
                    <span class="role-badge">${getRoleName(user.role)}</span>
                    <span class="status-badge status-${user.status}">${user.status === 'active' ? '启用' : '禁用'}</span>
                </div>
                <div class="user-details">
                    <span>部门: ${user.department || '未设置'}</span>
                    <span>邮箱: ${user.email || '未设置'}</span>
                    <span>电话: ${user.phone || '未设置'}</span>
                </div>
                <div class="user-actions">
                    <button class="btn btn-primary" onclick="toggleUserStatus(${user.id}, '${user.status}')">
                        ${user.status === 'active' ? '禁用' : '启用'}
                    </button>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('加载用户数据错误:', error);
    }
}

// 加载审计数据
async function loadAuditData() {
    if (!['admin', 'supervisor'].includes(currentUser.role)) return;
    
    try {
        const response = await fetch('/api/audit/logs');
        const data = await response.json();
        
        const auditLogs = document.getElementById('audit-logs');
        auditLogs.innerHTML = data.logs.map(log => `
            <div class="audit-item">
                <div class="audit-header">
                    <span class="audit-user">${log.user_name}</span>
                    <span class="audit-action">${getActionName(log.action)}</span>
                    <span class="audit-time">${formatDateTime(log.timestamp)}</span>
                </div>
                <div class="audit-details">${log.details}</div>
                <div class="audit-meta">
                    <span>资源类型: ${log.resource_type}</span>
                    ${log.resource_id ? `<span>资源ID: ${log.resource_id}</span>` : ''}
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('加载审计数据错误:', error);
    }
}

// 显示新申请表单
function showNewApplicationForm() {
    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = `
        <h3>提交定密申请</h3>
        <form id="new-application-form">
            <div class="form-group">
                <label>标题</label>
                <input type="text" name="title" required>
            </div>
            <div class="form-group">
                <label>内容描述</label>
                <textarea name="content" rows="4" required></textarea>
            </div>
            <div class="form-group">
                <label>密级</label>
                <select name="secrecy_level" required>
                    <option value="">请选择</option>
                    <option value="秘密">秘密</option>
                    <option value="机密">机密</option>
                    <option value="绝密">绝密</option>
                </select>
            </div>
            <div class="form-group">
                <label>定密理由</label>
                <textarea name="reason" rows="3" required></textarea>
            </div>
            <div class="form-group">
                <label>知悉范围</label>
                <input type="text" name="scope" required>
            </div>
            <div class="form-group">
                <label>保密期限(天)</label>
                <input type="number" name="duration" min="1">
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">提交申请</button>
                <button type="button" class="btn" onclick="closeModal()">取消</button>
            </div>
        </form>
    `;
    
    document.getElementById('modal').style.display = 'block';
    
    // 处理表单提交
    document.getElementById('new-application-form').addEventListener('submit', submitNewApplication);
}

// 提交新申请
async function submitNewApplication(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    try {
        const response = await fetch('/api/workflow/applications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            closeModal();
            loadWorkflowData();
            showMessage('申请提交成功');
        } else {
            const error = await response.json();
            showMessage(error.error, 'error');
        }
    } catch (error) {
        console.error('提交申请错误:', error);
        showMessage('提交失败，请稍后重试', 'error');
    }
}

// 审批申请
async function approveApplication(id, action) {
    const comments = prompt(`请输入${action === 'approve' ? '批准' : '驳回'}意见:`);
    if (comments === null) return;
    
    try {
        const response = await fetch(`/api/workflow/applications/${id}/approve`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, comments })
        });
        
        if (response.ok) {
            loadWorkflowData();
            showMessage(`申请${action === 'approve' ? '批准' : '驳回'}成功`);
        } else {
            const error = await response.json();
            showMessage(error.error, 'error');
        }
    } catch (error) {
        console.error('审批申请错误:', error);
        showMessage('操作失败，请稍后重试', 'error');
    }
}

// 切换用户状态
async function toggleUserStatus(userId, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    
    try {
        const response = await fetch(`/api/users/${userId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        
        if (response.ok) {
            loadUsersData();
            showMessage('用户状态更新成功');
        } else {
            const error = await response.json();
            showMessage(error.error, 'error');
        }
    } catch (error) {
        console.error('更新用户状态错误:', error);
        showMessage('操作失败，请稍后重试', 'error');
    }
}

// 设置模态框
function setupModal() {
    const modal = document.getElementById('modal');
    const closeBtn = document.querySelector('.close');
    
    closeBtn.onclick = closeModal;
    
    window.onclick = function(event) {
        if (event.target === modal) {
            closeModal();
        }
    };
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

// 注销
async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/';
    } catch (error) {
        console.error('注销错误:', error);
        window.location.href = '/';
    }
}

// 工具函数
function getActionName(action) {
    const actions = {
        login: '登录',
        create: '创建',
        update: '更新',
        approve: '批准',
        reject: '驳回'
    };
    return actions[action] || action;
}

function getStatusName(status) {
    const statuses = {
        pending: '待审批',
        approved: '已批准',
        rejected: '已驳回',
        active: '有效',
        changed: '变更',
        declassified: '解密'
    };
    return statuses[status] || status;
}

function formatDateTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN');
}

function showMessage(message, type = 'success') {
    // 简单的消息提示
    alert(message);
}