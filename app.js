const StorageService = {
    INTERVALS: [1, 2, 4, 7, 15, 30],
    API_URL: 'http://localhost:3000/api',
    
    async getData() {
        try {
            const res = await fetch(`${this.API_URL}/data`);
            return await res.json();
        } catch (e) { return { kp: [], wq: [] }; }
    },
    async addKp(data) {
        await fetch(`${this.API_URL}/kp`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
    },
    async updateKp(id, updateData) {
        await fetch(`${this.API_URL}/kp/${id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(updateData) });
    },
    async deleteKp(id) {
        await fetch(`${this.API_URL}/kp/${id}`, { method: 'DELETE' });
    },
    async addWq(data) {
        await fetch(`${this.API_URL}/wq`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
    },
    async deleteWq(id) {
        await fetch(`${this.API_URL}/wq/${id}`, { method: 'DELETE' });
    }
};

const app = {
    currentTab: 'today',
    db: { kp: [], wq: [] },
    pendingReviewId: null,
    mdeInstance: null, // 新增：保存 Markdown 编辑器实例
    currentFormTags: [],
    activeTagPrefix: '',
    currentFilterTag: '', // 新增：当前选择的筛选标签

    async init() {
        // 新增：配置 marked.js 支持 highlight.js
        if (window.marked && window.hljs) {
            marked.setOptions({
                highlight: function(code, lang) {
                    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                    return hljs.highlight(code, { language }).value;
                }
            });
        }
        this.db = await StorageService.getData();
        this.bindEvents();
        this.render();
    },

    bindEvents() {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.currentTab = e.target.dataset.target;
                this.currentFilterTag = ''; // 新增：切换 Tab 时清空筛选状态
                this.render();
            });
        });
    },

    isDue(timestamp) {
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);
        return timestamp <= endOfDay.getTime();
    },

    // 新增：渲染标签筛选器
    renderFilterBar(algoData) {
        const filterContainer = document.getElementById('filter-container');
        if (this.currentTab !== 'kp-algo' || algoData.length === 0) {
            filterContainer.style.display = 'none';
            return;
        }

        const tagsSet = new Set();
        algoData.forEach(item => item.tags?.forEach(t => tagsSet.add(t)));
        const uniqueTags = Array.from(tagsSet).sort();

        filterContainer.style.display = 'block';
        // 修复文字折行：加上 white-space: nowrap; flex-shrink: 0; 让 select 占满剩余空间
        filterContainer.innerHTML = `
            <div class="filter-bar">
                <span style="font-size: 14px; font-weight: bold; color: var(--text-muted); white-space: nowrap; flex-shrink: 0;">🏷️ 题型筛选:</span>
                <select class="filter-select" style="flex: 1;" onchange="app.setFilter(this.value)">
                    <option value="">全部题型 (共 ${algoData.length} 题)</option>
                    ${uniqueTags.map(t => `<option value="${t}" ${this.currentFilterTag === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
            </div>
        `;
    },

    setFilter(tag) {
        this.currentFilterTag = tag;
        this.render();
    },

    // 新增：控制 Markdown 折叠展开
    toggleMarkdown(id) {
        const el = document.getElementById(`md-${id}`);
        const btn = document.getElementById(`btn-md-${id}`);
        if (el.classList.contains('show')) {
            el.classList.remove('show');
            btn.innerHTML = '📝 查看思路';
        } else {
            el.classList.add('show');
            btn.innerHTML = '🔽 收起思路';
        }
    },

    // ======== 标签选择器组件 ========
    getAllUniqueTags() {
        const tagsSet = new Set();
        this.db.kp.forEach(item => item.tags?.forEach(t => tagsSet.add(t)));
        this.db.wq.forEach(item => item.tags?.forEach(t => tagsSet.add(t)));
        return Array.from(tagsSet);
    },

    initTagInput(prefix) {
        this.currentFormTags = [];
        this.activeTagPrefix = prefix;
        const input = document.getElementById(`${prefix}-tag-input`);
        const dropdown = document.getElementById(`${prefix}-tag-dropdown`);

        const showDropdown = () => {
            const filter = input.value.trim().toLowerCase();
            const allTags = this.getAllUniqueTags();
            let availableTags = allTags.filter(t => !this.currentFormTags.includes(t));
            if (filter) availableTags = availableTags.filter(t => t.toLowerCase().includes(filter));

            let html = '';
            if (filter && !allTags.map(t=>t.toLowerCase()).includes(filter)) {
                html += `<div class="tag-option" onmousedown="app.addFormTag('${input.value.trim()}')">➕ 创建新标签: <strong>${input.value.trim()}</strong></div>`;
            }
            if (availableTags.length > 0) {
                html += availableTags.map(t => `<div class="tag-option" onmousedown="app.addFormTag('${t}')">${t}</div>`).join('');
            }
            dropdown.innerHTML = html;
            dropdown.style.display = 'block';
        };

        input.addEventListener('focus', showDropdown);
        input.addEventListener('input', showDropdown);
        input.addEventListener('blur', () => setTimeout(() => dropdown.style.display = 'none', 150));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && input.value.trim()) {
                e.preventDefault();
                this.addFormTag(input.value.trim());
            }
        });
    },

    addFormTag(tag) {
        if (!this.currentFormTags.includes(tag)) {
            this.currentFormTags.push(tag);
            this.renderFormTagsUI();
        }
        const input = document.getElementById(`${this.activeTagPrefix}-tag-input`);
        input.value = '';
        input.focus(); 
    },

    removeFormTag(tag) {
        this.currentFormTags = this.currentFormTags.filter(t => t !== tag);
        this.renderFormTagsUI();
    },

    renderFormTagsUI() {
        const container = document.getElementById(`${this.activeTagPrefix}-tags-container`);
        if(container) {
            container.innerHTML = this.currentFormTags.map(t => `<span class="tag-chip">${t} <span class="remove" onclick="app.removeFormTag('${t}')">×</span></span>`).join('');
        }
    },

    // ======== 表单动态渲染 ========
    renderForm() {
        const container = document.getElementById('form-container');
        // 清理旧的编辑器实例，防止内存泄漏
        if (this.mdeInstance) {
            this.mdeInstance.toTextArea();
            this.mdeInstance = null;
        }
        
        if (this.currentTab === 'today') {
            container.style.display = 'none';
            return;
        }
        
        container.style.display = 'block';
        
        if (this.currentTab === 'kp-algo') {
            container.innerHTML = `
                <div class="form-grid">
                    <!-- ... 上面的标题和标签代码保持不变 ... -->
                    <div class="form-row">
                        <select id="kp-category" style="flex: 1;"><option value="algo">💻 算法题</option></select>
                        <input type="text" id="kp-title" placeholder="题目名称" style="flex: 3;">
                        <label style="flex: 1.5; font-size:14px; display:flex; align-items:center; gap:6px; cursor:pointer; color:var(--success); font-weight:bold;">
                            <input type="checkbox" id="kp-perfect" checked> 独立完美完成
                        </label>
                    </div>
                    <div class="form-row">
                        <div class="tag-input-wrapper" style="flex: 2;">
                            <div id="kp-tags-container" class="tags-container"></div>
                            <input type="text" id="kp-tag-input" placeholder="输入标签 (Enter添加)" autocomplete="off">
                            <div id="kp-tag-dropdown" class="tag-dropdown"></div>
                        </div>
                        <input type="url" id="kp-link" placeholder="题目链接" style="flex: 2;">
                    </div>
                    <!-- 这里是我们要挂载 EasyMDE 的 textarea -->
                    <div class="form-row" style="display: block;">
                        <textarea id="kp-desc"></textarea>
                    </div>
                    <div class="form-row" style="justify-content: flex-end;">
                        <button class="btn-primary" onclick="app.addItem('kp')">记录训练日志</button>
                    </div>
                </div>`;
            this.initTagInput('kp');

            // 新增：初始化 EasyMDE
            // 必须用 setTimeout 确保 DOM 已经渲染完毕
            setTimeout(() => {
                this.mdeInstance = new EasyMDE({
                    element: document.getElementById('kp-desc'),
                    placeholder: "支持 Markdown 语法！点击上方眼睛图标开启分屏预览，直接贴入代码块...",
                    spellChecker: false,
                    status: false, // 隐藏底部状态栏，节省空间
                    minHeight: "150px"
                });
            }, 0);
        } else if (this.currentTab === 'kp-cs') {
            // 计算机基础：精简版
            container.innerHTML = `
                <div class="form-grid">
                    <div class="form-row">
                        <select id="kp-category" style="flex: 1;"><option value="cs">🖥️ CS基础</option></select>
                        <input type="text" id="kp-title" placeholder="知识点名称" style="flex: 4;">
                        <input type="url" id="kp-link" placeholder="知识点链接 (飞书/Notion)" style="flex: 3;">
                    </div>
                    <div class="form-row">
                        <div class="tag-input-wrapper" style="flex: 1;">
                            <div id="kp-tags-container" class="tags-container"></div>
                            <input type="text" id="kp-tag-input" placeholder="选择标签..." autocomplete="off">
                            <div id="kp-tag-dropdown" class="tag-dropdown"></div>
                        </div>
                        <button class="btn-primary" style="flex: 0.2;" onclick="app.addItem('kp')">新增</button>
                    </div>
                </div>`;
            this.initTagInput('kp');
        } else if (this.currentTab === 'wq-choice') {
            // 笔试错题集：坑点笔记采用 textarea
            container.innerHTML = `
                <div class="form-grid">
                    <div class="form-row">
                        <select id="wq-type" style="flex: 1;"><option value="choice">📝 笔试/行测</option></select>
                        <input type="text" id="wq-title" placeholder="题目简述" style="flex: 4;">
                        <input type="url" id="wq-link" placeholder="题目链接 (选填)" style="flex: 3;">
                    </div>
                    <div class="form-row">
                        <div class="tag-input-wrapper" style="flex: 1;">
                            <div id="wq-tags-container" class="tags-container"></div>
                            <input type="text" id="wq-tag-input" placeholder="关联知识点标签..." autocomplete="off">
                            <div id="wq-tag-dropdown" class="tag-dropdown"></div>
                        </div>
                    </div>
                    <div class="form-row">
                        <textarea id="wq-note" placeholder="坑点笔记：详细记录错误原因、正确逻辑、涉及的陷阱等..."></textarea>
                    </div>
                    <div class="form-row" style="justify-content: flex-end;">
                        <button class="btn-primary" style="background:var(--warning)" onclick="app.addItem('wq')">录入错题</button>
                    </div>
                </div>`;
            this.initTagInput('wq');
        }
    },

    // ======== 逻辑处理 ========
    async addItem(type) {
        const titleEl = document.getElementById(`${type}-title`);
        if (!titleEl || !titleEl.value.trim()) return alert('标题是必填的');
        if (this.currentFormTags.length === 0) return alert('请至少添加一个标签！');

        const now = Date.now();
        if (type === 'kp') {
            const cat = document.getElementById('kp-category').value;
            const isPerfect = (cat === 'algo') ? document.getElementById('kp-perfect').checked : true;
            
            // 重点修改：如果有编辑器实例，从实例中取值，否则从原生 textarea 取值
            let descContent = "";
            if (this.mdeInstance) {
                descContent = this.mdeInstance.value().trim();
                // 提交后清空编辑器
                this.mdeInstance.value('');
            } else {
                const descEl = document.getElementById('kp-desc');
                descContent = descEl ? descEl.value.trim() : "";
                if (descEl) descEl.value = '';
            }
            
            const newItem = {
                id: 'k_' + now,
                category: cat,
                title: titleEl.value.trim(),
                link: document.getElementById('kp-link').value.trim(),
                tags: [...this.currentFormTags],
                desc: descContent, 
                isPerfect, createdAt: now,
                nextReview: now + (StorageService.INTERVALS[0] * 86400000), stage: 0
            };
            this.db.kp.push(newItem);
            
            // 提交后重置表单UI
            titleEl.value = '';
            document.getElementById('kp-link').value = '';
            this.currentFormTags = [];
            this.renderFormTagsUI();
            
            this.render();
            await StorageService.addKp(newItem);
        } else {
            const newItem = {
                id: 'w_' + now,
                qType: document.getElementById('wq-type').value,
                title: titleEl.value.trim(),
                link: document.getElementById('wq-link').value.trim(),
                tags: [...this.currentFormTags],
                note: document.getElementById('wq-note').value.trim(),
                createdAt: now
            };
            this.db.wq.push(newItem);
            this.render();
            await StorageService.addWq(newItem);
        }
    },

    async deleteItem(type, id) {
        if (!confirm('确定删除吗？')) return;
        if (type === 'kp') {
            this.db.kp = this.db.kp.filter(i => i.id !== id);
            await StorageService.deleteKp(id);
        } else {
            this.db.wq = this.db.wq.filter(i => i.id !== id);
            await StorageService.deleteWq(id);
        }
        this.render();
    },

    triggerReview(id) {
        const point = this.db.kp.find(p => p.id === id);
        const relatedWQs = this.db.wq.filter(wq => wq.tags.some(tag => point.tags.includes(tag)));
        if (relatedWQs.length > 0) {
            this.pendingReviewId = id;
            document.getElementById('modal-wq-list').innerHTML = relatedWQs.map(wq => `
                <div class="wq-item">
                    <a href="${wq.link || '#'}" target="_blank">[笔试错题] ${wq.title} ↗</a>
                    <div class="wq-note">⚠️ 避坑提醒：${wq.note}</div>
                </div>`).join('');
            document.getElementById('review-modal').style.display = 'flex';
        } else {
            this.executeReview(id);
        }
    },

    confirmReview(isSuccess) {
        document.getElementById('review-modal').style.display = 'none';
        if (this.pendingReviewId && isSuccess) this.executeReview(this.pendingReviewId);
        this.pendingReviewId = null;
    },

    async executeReview(id) {
        const point = this.db.kp.find(p => p.id === id);
        point.stage++;
        if (point.stage >= StorageService.INTERVALS.length) {
            point.nextReview = new Date('2099-12-31').getTime();
        } else {
            if (point.category === 'algo' && !point.isPerfect) point.isPerfect = true;
            point.nextReview = Date.now() + (StorageService.INTERVALS[point.stage] * 86400000);
        }
        this.render();
        await StorageService.updateKp(id, { nextReview: point.nextReview, stage: point.stage, isPerfect: point.isPerfect });
    },

    renderRecentStats() {
        const container = document.getElementById('simple-chart');
        container.innerHTML = '';
        const counts = {};
        this.db.kp.filter(item => item.category === 'algo').forEach(item => {
            const dateStr = new Date(item.createdAt).toDateString();
            counts[dateStr] = (counts[dateStr] || 0) + 1;
        });
        const today = new Date();
        const last7Days = [];
        let maxCount = 0;
        for (let i = 6; i >= 0; i--) {
            const d = new Date(); d.setDate(today.getDate() - i);
            const count = counts[d.toDateString()] || 0;
            if (count > maxCount) maxCount = count;
            last7Days.push({ date: d, count: count });
        }
        const scale = maxCount > 0 ? maxCount : 1;
        last7Days.forEach(item => {
            const heightPct = item.count === 0 ? 0 : Math.max((item.count / scale) * 100, 5); 
            const dateLabel = `${item.date.getMonth() + 1}/${item.date.getDate()}`;
            const col = document.createElement('div');
            col.className = 'chart-col';
            col.innerHTML = `
                <div class="bar-wrapper" title="${dateLabel}: ${item.count} 题">
                    ${item.count > 0 ? `<div class="bar-count">${item.count}</div>` : ''}
                    <div class="bar" style="height: ${heightPct}%"></div>
                </div>
                <div class="bar-date">${dateLabel}</div>`;
            container.appendChild(col);
        });
    },

    render() {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.getElementById(`tab-${this.currentTab}`).classList.add('active');
        const titles = {'today': '📅 今日待复习', 'kp-algo': '💻 算法刷题库', 'kp-cs': '🖥️ 计算机基础', 'wq-choice': '📝 笔试错题集'};
        document.getElementById('current-view-title').innerText = titles[this.currentTab];
        
        const duePoints = this.db.kp.filter(p => this.isDue(p.nextReview) && p.stage < StorageService.INTERVALS.length);
        document.getElementById('due-count').innerText = duePoints.length;
        
        const isAlgoTab = (this.currentTab === 'kp-algo');
        document.getElementById('stats-container').style.display = isAlgoTab ? 'block' : 'none';
        if (isAlgoTab) this.renderRecentStats();
        
        this.renderForm();
        
        const listEl = document.getElementById('list-container');
        listEl.innerHTML = '';
        
        // 修复问题2：每次渲染列表前，强制隐藏筛选器容器，防止污染其他 Tab
        const filterContainer = document.getElementById('filter-container');
        if (filterContainer) filterContainer.style.display = 'none';

        let data = []; 
        let isKPMode = true;

        // 获取数据
        if (this.currentTab === 'today') {
            data = duePoints.sort((a, b) => (a.isPerfect === b.isPerfect) ? (a.nextReview - b.nextReview) : (a.isPerfect ? 1 : -1));
        } else if (this.currentTab === 'kp-algo') {
            const allAlgoData = this.db.kp.filter(p => p.category === 'algo');
            this.renderFilterBar(allAlgoData); // 渲染筛选器
            // 执行标签筛选
            data = this.currentFilterTag ? allAlgoData.filter(item => item.tags && item.tags.includes(this.currentFilterTag)) : allAlgoData;
        } else if (this.currentTab === 'kp-cs') {
            data = this.db.kp.filter(p => p.category === 'cs');
            document.getElementById('filter-container').style.display = 'none';
        } else if (this.currentTab === 'wq-choice') { 
            data = this.db.wq; isKPMode = false; 
            document.getElementById('filter-container').style.display = 'none';
        }

        if (data.length === 0) { listEl.innerHTML = `<div style="text-align:center; padding: 40px; color: var(--text-muted);">暂无记录</div>`; return; }
        
        data.forEach(item => {
            if (isKPMode) {
                const due = this.isDue(item.nextReview), mastered = item.stage >= 6;
                const isAlgo = item.category === 'algo';
                
                // 处理 Markdown 文本
                let mdHtml = '';
                if (isAlgo) {
                    mdHtml = item.desc ? marked.parse(item.desc) : '<p style="color:#999; font-style:italic;">暂无思路记录</p>';
                }

                listEl.innerHTML += `
                    <div class="card ${mastered ? 'done' : (due ? 'due' : '')} ${(!item.isPerfect && isAlgo) ? 'imperfect' : ''}">
                        <div class="card-info" style="width: 100%;">
                            <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px;">
                                <h3 style="margin: 0;"><a href="${item.link || '#'}" target="_blank" class="card-link">${item.title}</a> 
                                ${isAlgo ? (item.isPerfect ? '<span class="badge-perfect">✨ 完美</span>' : '<span class="badge-imperfect">⚠️ 待巩固</span>') : ''}</h3>
                                
                                <!-- 展开折叠按钮 -->
                                ${isAlgo ? `<button id="btn-md-${item.id}" class="btn-toggle" onclick="app.toggleMarkdown('${item.id}')">📝 查看思路</button>` : ''}
                            </div>
                            
                            <div class="meta" style="margin-top: 10px;">
                                <span class="tag">阶段: ${mastered ? 'MAX' : item.stage + '/6'}</span>
                                ${item.tags.map(t => `<span class="tag">#${t}</span>`).join('')}
                            </div>
                            
                            <!-- 核心：动态判断如果是算法题，渲染 Markdown 容器，否则按普通模式渲染 -->
                            ${isAlgo ? `<div id="md-${item.id}" class="markdown-body">${mdHtml}</div>` : 
                             (item.desc ? `<div class="algo-desc-area">${item.desc}</div>` : '')}
                        </div>
                        
                        <div class="card-actions" style="margin-top: -2px;">
                            ${(due && !mastered) ? `<button class="btn-success" onclick="app.triggerReview('${item.id}')">复习</button>` : ''}
                            <button class="btn-danger" onclick="app.deleteItem('kp', '${item.id}')">删除</button>
                        </div>
                    </div>`;
            } else {
                // ... 保留原有 wq (错题) 的渲染逻辑 ...
                listEl.innerHTML += `
                    <div class="card cs">
                        <div class="card-info">
                            <h3><a href="${item.link || '#'}" target="_blank" class="card-link">${item.title}</a></h3>
                            <div class="wq-note-area">💡 避坑总结：${item.note || '无笔记'}</div>
                            <div class="meta">${item.tags.map(t => `<span class="tag">#${t}</span>`).join('')}</div>
                        </div>
                        <div class="card-actions">
                            <button class="btn-danger" onclick="app.deleteItem('wq', '${item.id}')">删除</button>
                        </div>
                    </div>`;
            }
        });
    }
};

window.onload = () => app.init();