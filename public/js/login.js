document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const errorMessage = document.getElementById('error-message');

    // 处理登录表单提交
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        // 清除之前的错误信息
        errorMessage.style.display = 'none';
        
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // 登录成功，跳转到主页
                window.location.href = '/index.html';
            } else {
                // 显示错误信息
                showError(data.error || '登录失败');
            }
        } catch (error) {
            console.error('登录请求错误:', error);
            showError('网络连接错误，请稍后重试');
        }
    });

    // 演示账户快速登录
    const accountItems = document.querySelectorAll('.account-item');
    accountItems.forEach(item => {
        item.addEventListener('click', function() {
            const text = this.textContent;
            const match = text.match(/:\s*(\w+)\s*\/\s*(\w+)/);
            if (match) {
                document.getElementById('username').value = match[1];
                document.getElementById('password').value = match[2];
            }
        });
    });

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
    }
});