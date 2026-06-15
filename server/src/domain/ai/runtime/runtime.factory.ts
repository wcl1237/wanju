/**
 * RuntimeFactory — 根据 RuntimeType 创建对应的运行时引擎
 */

import { Provide, Inject, Scope, ScopeEnum } from '@midwayjs/core';
import { RuntimeType } from '../../blueprint/model/blueprint.model';
import { IAgentRuntime } from './runtime.interface';
import { ReactRuntime } from './react.runtime';
import { WorkflowRuntime } from './workflow.runtime';
import { HarnessRuntime } from './harness.runtime';

@Provide()
@Scope(ScopeEnum.Singleton)
export class RuntimeFactory {
  @Inject()
  reactRuntime: ReactRuntime;

  @Inject()
  workflowRuntime: WorkflowRuntime;

  @Inject()
  harnessRuntime: HarnessRuntime;

  create(runtimeType: RuntimeType): IAgentRuntime {
    switch (runtimeType) {
      case 'react':
        return this.reactRuntime;
      case 'workflow':
        return this.workflowRuntime;
      case 'harness':
        return this.harnessRuntime;
      default:
        throw new Error(`未知的运行时类型: ${runtimeType}`);
    }
  }
}
