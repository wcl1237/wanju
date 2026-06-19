import React from 'react';

/**
 * 首页 — 操作手册
 */
const HomePage: React.FC = () => {
  return (
    <div style={s.container}>
      <style>{`
        .quick-link-card {
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
        }
        .quick-link-card:hover {
          transform: translateY(-4px);
          background: rgba(255, 255, 255, 0.08) !important;
          border-color: rgba(99, 102, 241, 0.5) !important;
          box-shadow: 0 10px 20px -10px rgba(99, 102, 241, 0.4);
        }
        .section-card {
          transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
          backdrop-filter: blur(20px);
        }
        .section-card:hover {
          border-color: rgba(139, 92, 246, 0.3) !important;
          background: rgba(255, 255, 255, 0.04) !important;
          box-shadow: 0 16px 40px -15px rgba(0, 0, 0, 0.6);
        }
        .arch-box {
          transition: all 0.25s ease !important;
        }
        .arch-box:hover {
          transform: translateY(-2px);
          background: rgba(255, 255, 255, 0.06) !important;
          box-shadow: 0 6px 15px -8px rgba(255, 255, 255, 0.15);
        }
        .faq-item {
          transition: all 0.25s ease !important;
        }
        .faq-item:hover {
          border-color: rgba(245, 158, 11, 0.3) !important;
          background: rgba(255, 255, 255, 0.04) !important;
        }
      `}</style>
      <div style={s.content}>
        {/* 顶部 Hero */}
        <div style={s.hero}>
          <div style={s.heroIcon}>📖</div>
          <h1 style={s.heroTitle}>玩聚 · 操作手册</h1>
          <p style={s.heroSubtitle}>快速了解系统功能，高效搭建你的智能客服体系</p>
        </div>

        {/* 快速导航 */}
        <div style={s.quickNav}>
          {quickLinks.map((link, i) => (
            <a key={i} href={`#section-${i}`} className="quick-link-card" style={s.quickLink}>
              <span style={{ fontSize: 24 }}>{link.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{link.label}</span>
            </a>
          ))}
        </div>

        {/* 正文 */}
        <div style={s.body}>
          {sections.map((section, i) => (
            <div key={i} id={`section-${i}`} className="section-card" style={s.section}>
              <div style={{ ...s.sectionHeader, borderLeftColor: section.color }}>
                <span style={{ fontSize: 28 }}>{section.icon}</span>
                <div>
                  <h2 style={s.sectionTitle}>{section.title}</h2>
                  <p style={s.sectionDesc}>{section.desc}</p>
                </div>
              </div>
              <div style={s.sectionBody}>
                {section.steps.map((step, j) => (
                  <div key={j} style={s.step}>
                    <div style={{ ...s.stepNumber, background: section.color }}>{j + 1}</div>
                    <div style={s.stepContent}>
                      <div style={s.stepTitle}>{step.title}</div>
                      <div style={s.stepText}>{step.text}</div>
                      {step.tip && (
                        <div style={s.tip}>
                          <span style={{ fontSize: 14 }}>💡</span>
                          <span>{step.tip}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* 架构概览 */}
          <div className="section-card" style={s.section}>
            <div style={{ ...s.sectionHeader, borderLeftColor: '#8b5cf6' }}>
              <span style={{ fontSize: 28 }}>🏛️</span>
              <div>
                <h2 style={s.sectionTitle}>系统架构概览</h2>
                <p style={s.sectionDesc}>各模块关系一览</p>
              </div>
            </div>
            <div style={s.archDiagram}>
              <div style={s.archRow}>
                <div className="arch-box" style={{ ...s.archBox, borderColor: '#a855f7' }}>
                  <div style={s.archBoxTitle}>🏭 智能体 (Blueprint)</div>
                  <div style={s.archBoxText}>面向用户的入口，选择运行时类型并配置</div>
                </div>
              </div>
              <div style={s.archArrow}>▼ 选择运行时</div>
              <div style={s.archRow}>
                <div className="arch-box" style={{ ...s.archBox, borderColor: '#22c55e' }}>
                  <div style={s.archBoxTitle}>⚡ ReAct 运行时</div>
                  <div style={s.archBoxText}>LLM + 工具循环，支持绑定 Agent</div>
                </div>
                <div className="arch-box" style={{ ...s.archBox, borderColor: '#f59e0b' }}>
                  <div style={s.archBoxTitle}>🔄 工作流运行时</div>
                  <div style={s.archBoxText}>图引擎驱动的确定性流程</div>
                </div>
              </div>
              <div style={s.archArrow}>▼ 调用能力</div>
              <div style={s.archRow}>
                <div className="arch-box" style={{ ...s.archBox, borderColor: '#06b6d4' }}>
                  <div style={s.archBoxTitle}>🧑‍💼 Agent 池</div>
                  <div style={s.archBoxText}>可复用的 Prompt + 工具 + 技能组合</div>
                </div>
                <div className="arch-box" style={{ ...s.archBox, borderColor: '#10b981' }}>
                  <div style={s.archBoxTitle}>⚡ 技能中心</div>
                  <div style={s.archBoxText}>Skill → SkillToolBridge → Function Calling Tool</div>
                </div>
                <div className="arch-box" style={{ ...s.archBox, borderColor: '#3b82f6' }}>
                  <div style={s.archBoxTitle}>📚 知识库</div>
                  <div style={s.archBoxText}>文档向量化，语义检索</div>
                </div>
              </div>
              <div style={s.archArrow}>▼ 容器沙箱执行环境</div>
              <div style={s.archRow}>
                <div className="arch-box" style={{ ...s.archBox, borderColor: '#ec4899', minWidth: 220 }}>
                  <div style={s.archBoxTitle}>🦞 云龙虾 (OpenClaw)</div>
                  <div style={s.archBoxText}>通用容器沙箱，双向 WebSocket 通道</div>
                </div>
                <div className="arch-box" style={{ ...s.archBox, borderColor: '#06b6d4', minWidth: 220 }}>
                  <div style={s.archBoxTitle}>🤖 Code Agent</div>
                  <div style={s.archBoxText}>容器化编码助手，ReAct + 工作流引擎</div>
                </div>
              </div>
            </div>
          </div>

          {/* 常见问题 */}
          <div className="section-card" style={s.section}>
            <div style={{ ...s.sectionHeader, borderLeftColor: '#f59e0b' }}>
              <span style={{ fontSize: 28 }}>❓</span>
              <div>
                <h2 style={s.sectionTitle}>常见问题</h2>
                <p style={s.sectionDesc}>快速解答</p>
              </div>
            </div>
            <div style={s.sectionBody}>
              {faqs.map((faq, i) => (
                <div key={i} className="faq-item" style={s.faqItem}>
                  <div style={s.faqQ}>Q: {faq.q}</div>
                  <div style={s.faqA}>{faq.a}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── 数据 ─── */

const quickLinks = [
  { icon: '🏭', label: '智能体' },
  { icon: '🧑‍💼', label: 'Agent 池' },
  { icon: '🔄', label: '工作流' },
  { icon: '⚡', label: '技能中心' },
  { icon: '📚', label: '知识库' },
  { icon: '🎫', label: '工单管理' },
  { icon: '🦞', label: '云龙虾' },
  { icon: '🤖', label: 'Code Agent' },
];

interface Step { title: string; text: string; tip?: string }
interface Section { icon: string; title: string; desc: string; color: string; steps: Step[] }

const sections: Section[] = [
  {
    icon: '🏭', title: '智能体 (Blueprint)', desc: '配置面向用户的对话入口',
    color: '#a855f7',
    steps: [
      { title: '进入智能体页面', text: '点击左侧导航「智能体」，查看所有已创建的智能体卡片。' },
      { title: '新建智能体', text: '点击右上角「+ 新建智能体」，填写名称、描述和图标，选择运行时类型（ReAct 或 工作流）。', tip: '编排链类型暂未开放，后续版本将提供可视化编辑器。' },
      { title: '配置 ReAct 运行时', text: '可以绑定一个 Agent（继承其 Prompt、工具和技能配置），也可以自定义 System Prompt、勾选可用工具、技能和工作流。' },
      { title: '配置工作流运行时', text: '选择要绑定的工作流，并设置兜底回复文案（当工作流未命中时使用）。' },
      { title: '发起对话', text: '在智能体卡片上点击「💬 对话」，即可进入该智能体的专属对话页面进行测试。' },
    ],
  },
  {
    icon: '🧑‍💼', title: 'Agent 池', desc: '管理可复用的 Agent 角色定义',
    color: '#06b6d4',
    steps: [
      { title: '创建 Agent', text: '点击左侧「Agent 池」→「+ 新建 Agent」，填写名称和 Prompt（角色定义）。' },
      { title: '配置能力', text: '勾选该 Agent 可使用的工具（知识检索、创建工单、保存用户信息）、技能和工作流。', tip: 'Agent 的能力定义可以被 Blueprint 继承或覆盖。' },
      { title: 'AI 辅助生成 Prompt', text: '在 Prompt 输入框上方点击「✨ AI 帮我写」，系统会根据 Agent 名称和描述自动生成 Prompt。' },
      { title: '在 Blueprint 中使用', text: '在智能体编辑页面的「绑定 Agent」下拉框中选择已创建 of Agent。可选择「继承 Agent 配置」或「自定义配置」。' },
    ],
  },
  {
    icon: '🔄', title: '工作流', desc: '可视化搭建确定性业务流程',
    color: '#f59e0b',
    steps: [
      { title: '创建工作流', text: '点击左侧「工作流」→「+ 创建工作流」，进入可视化编辑器。' },
      { title: '拖拽添加节点', text: '从左侧节点面板拖拽节点到画布上。支持的节点类型：开始、结束、消息回复、AI 生成、知识检索、条件判断、参数提取、Agent 调用等。' },
      { title: '连接节点', text: '从一个节点的输出锚点拖拽到另一个节点的输入锚点，建立流程连线。', tip: '条件节点有「是」和「否」两个输出分支。' },
      { title: '配置节点属性', text: '点击节点，在右侧属性面板中编辑参数（如回复文本、AI Prompt、提取字段等）。' },
      { title: '保存工作流', text: '点击顶部「💾 保存」，保存后页面不会跳转，可继续编辑。' },
    ],
  },
  {
    icon: '⚡', title: '技能中心', desc: '创建可被 AI 自主调用的自定义工具',
    color: '#10b981',
    steps: [
      { title: '进入技能中心', text: '点击左侧「技能中心」，查看已创建的技能卡片。每个技能会作为 Function Calling 工具注册到 AI 对话中。' },
      { title: 'AI 智能创建', text: '点击「✨ AI 创建」，用自然语言描述你想要的技能，AI 会自动生成名称、描述、参数和 Prompt 模板。', tip: '尽量详细描述使用场景，AI 会生成更准确的 Tool description。' },
      { title: '手动创建', text: '点击「+ 手动创建」，填写 Tool 描述（告诉 AI 何时使用）、输入参数和 Prompt 模板。', tip: 'Tool 描述要「积极一些」，覆盖尽可能多的触发场景，即使用户没明确说关键词也应触发。' },
      { title: '定义参数', text: '点击「+ 添加参数」定义输入参数（如 order_id、reason），在 Prompt 模板中用 {{order_id}} 引用。LLM 会自动从对话中提取参数值。' },
      { title: '启用/禁用', text: '可随时切换技能的启用状态。禁用后 AI 不会看到该工具。' },
    ],
  },
  {
    icon: '📚', title: '知识库', desc: '上传文档，让 AI 拥有专业知识',
    color: '#3b82f6',
    steps: [
      { title: '进入知识库', text: '点击左侧「知识库」，查看已上传的文档列表。' },
      { title: '上传文档', text: '点击「📤 上传文档」，选择 TXT/MD/PDF 等格式的文件。系统会自动分片并生成向量嵌入。', tip: '单个文档建议不超过 50MB，大文件建议分拆后上传。' },
      { title: '测试检索', text: '上传完成后，可在对话中通过「知识检索」工具验证检索效果。' },
    ],
  },
  {
    icon: '🎫', title: '工单管理', desc: '查看和管理 AI 对话中创建的工单',
    color: '#ef4444',
    steps: [
      { title: '查看工单列表', text: '点击左侧「工单管理」，查看所有由 AI 对话生成的工单。' },
      { title: '手动创建工单', text: '点击右上角「➕ 创建工单」，填写工单标题、描述、优先级等信息。' },
      { title: '工单详情', text: '点击工单卡片查看详情，包括创建时间、关联的对话信息等。' },
    ],
  },
  {
    icon: '🦞', title: '云龙虾 (OpenClaw)', desc: '按需拉起隔离 Docker 沙箱，支持物理与代码级高级交互',
    color: '#ec4899',
    steps: [
      { title: '进入云龙虾控制台', text: '点击左侧导航「云龙虾」，即可查看控制台界面。首次进入时状态显示为「云龙虾服务就绪」。' },
      { title: '一键拉起沙箱容器', text: '点击「🔥 一键启动云龙虾」按钮，系统将自动在宿主机后台通过 Docker 守护进程，秒级冷启动专属于当前登录用户的隔离容器实例。', tip: '若本地不存在 OpenClaw 镜像，系统会在后台自动下载拉取镜像 (ghcr.io/openclaw/openclaw:latest)，此时启动可能需要一些时间，请耐心等待日志加载。' },
      { title: '实时对话与 WebSocket 调试', text: '容器成功运行后，左侧为双向 WebSocket 通信的聊天界面，支持直接对虚拟 Agent 下达任务（如编写代码、执行 shell、操作浏览器截图）；右侧终端输出实时容器连接日志。', tip: '对话顶部的延迟指标（如 RTT 延迟: 12ms）是通过 WebSocket 3 秒心跳在前端与容器网关之间实时测量并展现的。' },
      { title: '暂停实例与资源释放', text: '点击右上角「⏸️ 暂停实例」，系统将优雅停止容器运行并释放宿主机资源，同时【保留】用户挂载目录下的全部代码与历史会话，重新启动可瞬间恢复。', tip: '若 10 分钟无数据交换，系统定时器也会自动触发暂停清理。' },
      { title: '物理销毁实例与彻底清空', text: '点击右上角「🗑️ 销毁实例」并确认警告，系统将不仅停止容器，还会从宿主机磁盘彻底【物理删除】该用户目录下的所有历史文件、设置及工作区代码。此操作不可逆。' },
    ],
  },
  {
    icon: '🤖', title: 'Code Agent', desc: '容器化智能编码助手，执行结构化工作流',
    color: '#06b6d4',
    steps: [
      { title: '进入 Code Agent 控制台', text: '点击左侧导航「Code Agent」，进入容器管理与对话界面。' },
      { title: '启动容器', text: '点击「🚀 启动 Code Agent」按钮，系统将自动为当前用户拉起一个独立的 Docker 容器，运行内置的 ReAct Agent。', tip: '容器首次启动需要几秒钟初始化，底部日志会显示启动进度。' },
      { title: '对话交互', text: '在聊天窗口中直接与 Agent 对话，Agent 会自主使用 Bash、文件读写、代码搜索等工具完成任务。每个工具调用都会独立显示为单独的气泡。' },
      { title: '推送工作流', text: '点击右上角「📋 推送工作流」，从预设模板中选择工作流（如「项目结构分析」），Agent 会按步骤自主执行，结果实时流式输出。', tip: '工作流执行过程中顶部会显示进度条，点击展开可查看各步骤状态。' },
      { title: '决策交互', text: '当 Agent 遇到需要人工判断的场景时，会弹出决策卡片。您可以点击选项或输入自由文本来响应，响应后 Agent 自动继续执行。', tip: '决策卡片会显示您选择的内容，方便之后回顾。' },
      { title: '销毁与重建', text: '点击「🗑️ 销毁实例」彻底清空容器和所有对话历史，重新启动即为全新环境。' },
    ],
  },
];

const faqs = [
  { q: 'ReAct 和工作流运行时有什么区别？', a: 'ReAct 是基于大模型的自主推理+行动循环，适合开放式对话；工作流是确定性的流程图引擎，适合结构化的业务流程（如退款、投诉处理）。' },
  { q: 'Agent 和 Blueprint 是什么关系？', a: 'Agent 是可复用的角色定义（Prompt + 能力），Blueprint 是面向用户的智能体入口。Blueprint 可以绑定 Agent 来继承其配置，也可以独立自定义。' },
  { q: '技能和内置 Action 有什么区别？', a: '内置 Action（如知识检索、创建工单）是代码实现的工具；技能是用户可配置的 Prompt-based Tool，通过 SkillToolBridge 转为 Function Calling 工具。两者对 LLM 来说都是工具。' },
  { q: '如何测试我的智能体配置？', a: '在智能体列表页点击卡片上的「💬 对话」按钮，即可进入专属对话测试页面。' },
  { q: '启动云龙虾时提示“容器引导异常”或连接不上怎么办？', a: '首先请确保您的宿主机已经运行了 Docker Desktop (可在控制台执行 docker ps 验证)；其次检查 server/.env 里的 OPENCLAW_SHARED_DATA_DIR 路径是否为绝对路径，如果是 macOS，需确认该路径已在 Docker 共享目录 File Sharing 列表中授权。' },
  { q: '为什么打开了新的云龙虾窗口，旧的控制台就会断开并显示已被接管？', a: '为避免同一个用户的 Docker 沙箱代理被多处同时控制而产生状态和数据竞争，系统设计了抢占接管（Owner Takeover）机制。当在别处建立新链路时，旧的 WebSocket 会自动关闭并显示提示，随时可以在旧控制台点击“夺回连接”切换回来。' },
  { q: 'Code Agent 和云龙虾有什么区别？', a: 'Code Agent 内置了完整的 ReAct 推理引擎和工作流系统，专注于编码任务的自动化执行；云龙虾是通用的容器沙箱，更侧重于自定义 Agent 的部署和调试。两者都运行在独立的 Docker 容器中。' },
  { q: 'Code Agent 的对话刷新后会丢失吗？', a: '不会。所有对话内容（包括文本、工具调用、工作流事件、决策记录）都以 JSONL 格式持久化存储在容器内，刷新页面后会完整恢复对话历史。只有「销毁实例」才会清空历史。' },
  { q: 'Code Agent 的工作流执行中途可以暂停吗？', a: '遇到决策点时会自动暂停等待用户响应。目前不支持手动暂停正在执行的步骤，但您可以销毁容器来终止执行。' },
];

/* ─── 样式 ─── */

const s: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    overflow: 'auto',
    background: 'radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.12) 0%, rgba(139, 92, 246, 0.08) 35%, rgba(10, 10, 18, 0.98) 100%)',
  },
  content: {
    maxWidth: 900, margin: '0 auto', padding: '40px 24px 80px',
  },
  hero: {
    textAlign: 'center', marginBottom: 40,
  },
  heroIcon: {
    fontSize: 56, marginBottom: 12,
  },
  heroTitle: {
    fontSize: 32, fontWeight: 800, color: '#f1f5f9', margin: '0 0 8px',
    background: 'linear-gradient(135deg, #a855f7, #3b82f6, #10b981)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
  },
  heroSubtitle: {
    fontSize: 15, color: '#64748b', margin: 0,
  },

  // 快速导航
  quickNav: {
    display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const, marginBottom: 48,
  },
  quickLink: {
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 6,
    padding: '14px 18px', borderRadius: 12,
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
    textDecoration: 'none', cursor: 'pointer', transition: 'all 0.2s',
    minWidth: 80,
  },

  // 正文
  body: {
    display: 'flex', flexDirection: 'column' as const, gap: 36,
  },
  section: {
    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 16, overflow: 'hidden',
  },
  sectionHeader: {
    display: 'flex', alignItems: 'center', gap: 14, padding: '20px 24px',
    borderLeft: '4px solid', borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
  },
  sectionTitle: {
    fontSize: 18, fontWeight: 700, color: '#f1f5f9', margin: 0,
  },
  sectionDesc: {
    fontSize: 13, color: '#64748b', margin: '2px 0 0',
  },
  sectionBody: {
    padding: '20px 24px', display: 'flex', flexDirection: 'column' as const, gap: 16,
  },

  // 步骤
  step: {
    display: 'flex', gap: 14, alignItems: 'flex-start',
  },
  stepNumber: {
    width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0,
    marginTop: 2,
  },
  stepContent: {
    flex: 1, minWidth: 0,
  },
  stepTitle: {
    fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 4,
  },
  stepText: {
    fontSize: 13, color: '#94a3b8', lineHeight: 1.6,
  },
  tip: {
    display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 8,
    padding: '8px 12px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)',
    borderRadius: 8, fontSize: 12, color: '#fbbf24', lineHeight: 1.5,
  },

  // 架构图
  archDiagram: {
    padding: '24px', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 8,
  },
  archRow: {
    display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' as const,
  },
  archBox: {
    padding: '14px 20px', borderRadius: 12, border: '1.5px solid',
    background: 'rgba(255,255,255,0.03)', minWidth: 180, textAlign: 'center' as const,
  },
  archBoxTitle: {
    fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 4,
  },
  archBoxText: {
    fontSize: 11, color: '#64748b',
  },
  archArrow: {
    fontSize: 12, color: '#475569', fontWeight: 600, padding: '4px 0',
  },

  // FAQ
  faqItem: {
    padding: '14px 16px', background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10,
  },
  faqQ: {
    fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 6,
  },
  faqA: {
    fontSize: 13, color: '#94a3b8', lineHeight: 1.6,
  },
};

export default HomePage;

