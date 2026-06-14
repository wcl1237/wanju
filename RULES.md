# WanJu 智能客服系统 — 开发规范

> 本文件定义了项目的代码规范和架构约束，所有后续开发必须遵守。

---

## 1. 架构分层规范

### 后端分层（严格依赖方向：Interface → Application → Domain ← Infrastructure）

```
Interface (Controller/Middleware)
    ↓ 依赖
Application (AppService)
    ↓ 依赖
Domain (Service/Model/Port)
    ↑ 实现
Infrastructure (Repository/LLM/Embedding/Vector)
```

#### 规则

- **Controller** 只能注入 `AppService` 或 `Domain Service`，**禁止直接操作** Entity/Repository/TypeORM
- **Application Service** 负责编排跨域操作，不包含业务规则
- **Domain Service** 包含核心业务逻辑，**禁止直接依赖** TypeORM、Redis 等基础设施（通过 Port 接口注入）
- **Infrastructure** 实现 Domain 层定义的 Port 接口
- **Domain 层之间不直接跨域调用**，若需跨域编排，走 Application Service 或领域事件

### 前端分层（Feature-Sliced）

```
features/<feature>/
├── api.ts          # API 调用层
├── types.ts        # 类型定义
├── components/     # UI 组件
├── hooks/          # 自定义 hooks
├── store/          # Zustand store
├── constants/      # 常量
├── styles/         # 样式
└── utils/          # 工具函数
```

#### 规则

- 每个 feature 独立封装，**禁止跨 feature 直接导入组件**（共享组件放 `shared/`）
- 跨 feature 的类型引用使用 `import type`
- API 调用统一走 `api.ts`，**禁止在组件中直接 fetch**

---

## 2. 命名规范

### 文件命名

| 类型 | 格式 | 示例 |
|------|------|------|
| 后端 Entity | `<name>.entity.ts` | `workflow.entity.ts` |
| 后端 Model | `<name>.model.ts` | `workflow.model.ts` |
| 后端 Service | `<name>.service.ts` | `workflow.service.ts` |
| 后端 Repository 接口 | `<name>.repository.ts` | `workflow.repository.ts` |
| 后端 Repository 实现 | `<name>.repository.impl.ts` | `workflow.repository.impl.ts` |
| 后端 AppService | `<name>.app-service.ts` | `workflow.app-service.ts` |
| 后端 Controller | `<name>.controller.ts` | `workflow.controller.ts` |
| 后端 Executor | `<name>.executor.ts` | `reply.executor.ts` |
| 后端 Port/Interface | `<name>.port.ts` | `llm.port.ts` |
| 前端组件 | `PascalCase.tsx` | `WorkflowEditor.tsx` |
| 前端 Hook | `use<Name>.ts` | `useWorkflowEditorStore.ts` |
| 前端样式 | `<name>.styles.ts` | `editor.styles.ts` |
| 前端常量 | `kebab-case.ts` | `node-types.ts` |

### IoC 注入标识

| 注入标识 | 含义 |
|----------|------|
| `@Inject()` | 按类型自动注入 |
| `@Inject('llmClient')` | LLM 客户端 |
| `@Inject('workflowRepository')` | 工作流仓储 |
| `@Inject('agentRepository')` | Agent 仓储 |
| `@Inject('chatRepository')` | 对话仓储 |
| `@Inject('action:create_ticket')` | 创建工单 Action |
| `@Inject('action:search_knowledge')` | 知识检索 Action |
| `@Inject('action:save_customer_info')` | 保存客户信息 Action |

---

## 3. Domain Service 规范

### Repository 模式

```typescript
// ✅ 正确：通过 Port 接口注入
@Inject('workflowRepository')
workflowRepo: IWorkflowRepository;

// ❌ 错误：Domain Service 直接使用 TypeORM
@InjectEntityModel(WorkflowEntity)
repo: Repository<WorkflowEntity>;
```

### Entity vs Model

- **Entity**（`entity/` 目录）：纯 TypeORM 装饰器映射，不包含业务逻辑
- **Model**（`model/` 目录）：领域模型接口/类，包含业务行为方法
- **转换**：Entity ↔ Model 的转换逻辑放在 `Repository` 实现中

---

## 4. 工作流节点开发规范

### 添加新节点类型

1. 创建 `server/src/domain/workflow/executor/<name>.executor.ts`
2. 实现 `INodeExecutor` 接口
3. 在 `executor/index.ts` 的 `createDefaultRegistry()` 中注册
4. 前端在 `constants/node-types.ts` 中添加 `NODE_TYPES_META` 条目
5. 前端在 `PropertyPanel.tsx` 中添加对应的属性面板
6. 前端在 `utils/node-summary.ts` 中添加摘要逻辑

### INodeExecutor 接口

```typescript
interface INodeExecutor {
  readonly type: string;  // 与 FlowNode.type 对应
  execute(
    node: FlowNode,
    ctx: ExecContext,      // 可变上下文（params/results/lastOutput）
    deps: ExecutorDeps,    // 外部依赖（llmClient/agentService/actions）
  ): AsyncGenerator<string, NodeExecutionResult>;
}
```

### 规则

- 每个 Executor **只处理一种节点类型**
- Executor **不持有状态**，所有状态通过 `ExecContext` 传递
- SSE 事件必须使用 `sse-events.ts` 中的构建函数（`stepEvent()` / `llmEvent()` / `contentEvent()`）
- **禁止在 Executor 中直接构建** `data: ${JSON.stringify(...)}` 格式字符串

---

## 5. SSE 事件规范

所有 SSE 事件必须使用 `domain/workflow/model/sse-events.ts` 中定义的类型和构建函数。

```typescript
// ✅ 正确
import { stepEvent, contentEvent, llmEvent } from '../model/sse-events';
yield stepEvent({ stepIndex: 0, nodeId: node.id, ... });

// ❌ 错误
yield `data: ${JSON.stringify({ type: 'workflow_step', ... })}\n\n`;
```

---

## 6. 前端组件规范

### 状态管理

- **跨组件共享状态**：使用 Zustand store（`store/` 目录）
- **组件内部临时状态**：使用 `useState`
- **禁止使用 Context** 传递高频变更的状态（Context 适用于低频配置如 direction/theme）

### 组件拆分

- 单文件不超过 **300 行**
- 超过 300 行必须拆分为子组件或提取 hook/utils
- 样式对象提取到 `styles/` 目录
- 常量提取到 `constants/` 目录

### 类型安全

- **禁止使用 `any`**，必须使用 `types.ts` 中定义的具体类型
- API 响应必须通过 `api.ts` 中的类型函数处理
- 事件处理函数必须标注参数类型

---

## 7. API 规范

### 响应格式

```typescript
// 成功
{ success: true, data: T }

// 失败
{ success: false, message: string }
```

### SSE 流式响应

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"type":"content","content":"..."}\n\n
data: {"type":"tool_start","tool":"search_knowledge","args":{...}}\n\n
data: {"type":"tool_result","tool":"search_knowledge","result":{...}}\n\n
data: [DONE]\n\n
```

### 认证

- 使用 **httpOnly Cookie** 携带 JWT
- 前端通过 `authFetch()` 自动处理 Cookie 和 401 登出
- **禁止**在 localStorage 中存储 token

---

## 8. Git 规范

### Commit Message

```
<type>: <description>

<body>
```

#### Type

| 类型 | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修复 Bug |
| `refactor` | 重构 |
| `style` | 样式调整 |
| `docs` | 文档 |
| `chore` | 构建/配置 |

---

## 9. 禁止事项清单

- ❌ Domain Service 直接使用 `@InjectEntityModel` / TypeORM `Repository`
- ❌ Controller 包含业务逻辑（超过 10 行的逻辑必须下沉到 AppService/Service）
- ❌ 前端组件中直接 `fetch()`（必须走 `api.ts` + `authFetch()`）
- ❌ 手动拼接 SSE 事件字符串（必须走 `sse-events.ts`）
- ❌ 在 GraphEngineService 中添加 switch-case 处理节点（必须创建 Executor 插件）
- ❌ 单文件超过 300 行
- ❌ 使用 `any` 类型（在 `types.ts` 中定义具体类型）
- ❌ 跨 feature 直接导入组件（共享组件放 `shared/`）
- ❌ 在 localStorage 中存储 JWT token
