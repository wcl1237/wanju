import { Controller, Get, Post, Put, Del, Inject, Param, Body } from '@midwayjs/core';
import { AgentService } from '../../domain/agent/service/agent.service';
import { CreateAgentDTO, UpdateAgentDTO } from '../../domain/agent/model/agent.model';

@Controller('/api/agents')
export class AgentController {
  @Inject()
  agentService: AgentService;

  @Get('/')
  async list() {
    const agents = await this.agentService.getAll();
    return { success: true, data: agents };
  }

  @Get('/:id')
  async getById(@Param('id') id: string) {
    const agent = await this.agentService.getById(id);
    if (!agent) return { success: false, message: 'Agent 不存在' };
    return { success: true, data: agent };
  }

  @Post('/')
  async create(@Body() body: CreateAgentDTO) {
    const agent = await this.agentService.create(body);
    return { success: true, data: agent };
  }

  @Put('/:id')
  async update(@Param('id') id: string, @Body() body: UpdateAgentDTO) {
    const agent = await this.agentService.update(id, body);
    if (!agent) return { success: false, message: 'Agent 不存在' };
    return { success: true, data: agent };
  }

  @Del('/:id')
  async delete(@Param('id') id: string) {
    const ok = await this.agentService.delete(id);
    if (!ok) return { success: false, message: 'Agent 不存在' };
    return { success: true };
  }

  @Post('/generate-prompt')
  async generatePrompt(@Body() body: { name: string; description: string }) {
    const prompt = await this.agentService.generatePrompt(body.name, body.description);
    return { success: true, data: { prompt } };
  }
}
