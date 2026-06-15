/**
 * 共享 Action 常量 — 前端 UI 中的工具列表
 *
 * 所有需要展示 Action 勾选列表的组件统一引用此处，
 * 避免 BlueprintEditor / AgentPool 各自定义重复数组。
 */

export const AVAILABLE_ACTIONS: { name: string; label: string; icon: string }[] = [
  { name: 'search_knowledge', label: '知识检索', icon: '📚' },
  { name: 'create_ticket', label: '创建工单', icon: '🎫' },
  { name: 'save_customer_info', label: '保存客户信息', icon: '💾' },
];
