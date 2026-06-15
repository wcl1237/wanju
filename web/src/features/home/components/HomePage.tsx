import React from 'react';

/**
 * 首页 — 操作手册
 */
const HomePage: React.FC = () => {
  return (
    <div style={s.container}>
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
            <a key={i} href={`#section-${i}`} style={s.quickLink}>
              <span style={{ fontSize: 24 }}>{link.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{link.label}</span>
            </a>
          ))}
        </div>

        {/* 正文 */}
        <div style={s.body}>
          {sections.map((section, i) => (
            <div key={i} id={`section-${i}`} style={s.section}>
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
          <div style={s.section}>
            <div style={{ ...s.sectionHeader, borderLeftColor: '#8b5cf6' }}>
              <span style={{ fontSize: 28 }}>🏛️</span>
              <div>
                <h2 style={s.sectionTitle}>系统架构概览</h2>
                <p style={s.sectionDesc}>各模块关系一览</p>
              </div>
            </div>
            <div style={s.archDiagram}>
              <div style={s.archRow}>
                <div style={{ ...s.archBox, borderColor: '#a855f7' }}>
                  <div style={s.archBoxTitle}>🏭 智能体 (Blueprint)</div>
                  <div style={s.archBoxText}>面向用户的入口，选择运行时类型并配置</div>
                </div>
              </div>
              <div style={s.archArrow}>▼ 选择运行时</div>
              <div style={s.archRow}>
                <div style={{ ...s.archBox, borderColor: '#22c55e' }}>
                  <div style={s.archBoxTitle}>⚡ ReAct 运行时</div>
                  <div style={s.archBoxText}>LLM + 工具循环，支持绑定 Agent</div>
                </div>
                <div style={{ ...s.archBox, borderColor: '#f59e0b' }}>
                  <div style={s.archBoxTitle}>🔄 工作流运行时</div>
                  <div style={s.archBoxText}>图引擎驱动的确定性流程</div>
                </div>
              </div>
              <div style={s.archArrow}>▼ 调用能力</div>
              <div style={s.archRow}>
                <div style={{ ...s.archBox, borderColor: '#06b6d4' }}>
                  <div style={s.archBoxTitle}>🧑‍💼 Agent 池</div>
                  <div style={s.archBoxText}>可复用的 Prompt + 工具 + 技能组合</div>
                </div>
                <div style={{ ...s.archBox, borderColor: '#10b981' }}>
                  <div style={s.archBoxTitle}>⚡ 技能中心</div>
                  <div style={s.archBoxText}>关键词/正则触发的预设回复</div>
                </div>
                <div style={{ ...s.archBox, borderColor: '#3b82f6' }}>
                  <div style={s.archBoxTitle}>📚 知识库</div>
                  <div style={s.archBoxText}>文档向量化，语义检索</div>
                </div>
              </div>
            </div>
          </div>

          {/* 常见问题 */}
          <div style={s.section}>
            <div style={{ ...s.sectionHeader, borderLeftColor: '#f59e0b' }}>
              <span style={{ fontSize: 28 }}>❓</span>
              <div>
                <h2 style={s.sectionTitle}>常见问题</h2>
                <p style={s.sectionDesc}>快速解答</p>
              </div>
            </div>
            <div style={s.sectionBody}>
              {faqs.map((faq, i) => (
                <div key={i} style={s.faqItem}>
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
      { title: '在 Blueprint 中使用', text: '在智能体编辑页面的「绑定 Agent」下拉框中选择已创建的 Agent。可选择「继承 Agent 配置」或「自定义配置」。' },
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
    icon: '⚡', title: '技能中心', desc: '配置关键词触发的快捷回复',
    color: '#10b981',
    steps: [
      { title: '创建技能', text: '点击左侧「技能中心」→「+ 创建技能」，填写名称和描述。' },
      { title: '设置触发条件', text: '添加关键词列表，当用户消息命中任意关键词时触发该技能。' },
      { title: '配置回复内容', text: '编辑技能的回复模板，支持纯文本回复。' },
      { title: '启用/禁用', text: '可随时切换技能的启用状态。禁用后即使匹配关键词也不会触发。' },
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
];

const faqs = [
  { q: 'ReAct 和工作流运行时有什么区别？', a: 'ReAct 是基于大模型的自主推理+行动循环，适合开放式对话；工作流是确定性的流程图引擎，适合结构化的业务流程（如退款、投诉处理）。' },
  { q: 'Agent 和 Blueprint 是什么关系？', a: 'Agent 是可复用的角色定义（Prompt + 能力），Blueprint 是面向用户的智能体入口。Blueprint 可以绑定 Agent 来继承其配置，也可以独立自定义。' },
  { q: '技能和工作流可以同时使用吗？', a: '可以。在 ReAct 运行时中，可以同时启用技能和工作流。技能通过关键词匹配触发，工作流通过意图匹配触发。' },
  { q: '如何测试我的智能体配置？', a: '在智能体列表页点击卡片上的「💬 对话」按钮，即可进入专属对话测试页面。' },
];

/* ─── 样式 ─── */

const s: Record<string, React.CSSProperties> = {
  container: {
    width: '100%', height: '100%', overflow: 'auto', background: '#0a0a0f',
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
