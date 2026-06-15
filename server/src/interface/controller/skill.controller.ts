import { Controller, Get, Post, Put, Del, Inject, Param, Body } from '@midwayjs/core';
import { SkillService } from '../../domain/skill/service/skill.service';
import { CreateSkillDTO, UpdateSkillDTO } from '../../domain/skill/model/skill.model';

@Controller('/api/skills')
export class SkillController {
  @Inject()
  skillService: SkillService;

  @Get('/')
  async list() {
    const skills = await this.skillService.getAll();
    return { success: true, data: skills };
  }

  @Post('/')
  async create(@Body() body: CreateSkillDTO) {
    const skill = await this.skillService.create(body);
    return { success: true, data: skill };
  }

  /** AI 智能创建 — 根据自然语言描述生成完整 Skill 定义 */
  @Post('/generate')
  async generate(@Body() body: { description: string }) {
    if (!body.description || body.description.trim().length === 0) {
      return { success: false, message: '请输入技能描述' };
    }
    try {
      const skill = await this.skillService.generateSkill(body.description);
      return { success: true, data: skill };
    } catch (e: any) {
      return { success: false, message: e.message || 'AI 生成失败' };
    }
  }

  @Put('/:id')
  async update(@Param('id') id: string, @Body() body: UpdateSkillDTO) {
    const skill = await this.skillService.update(id, body);
    if (!skill) return { success: false, message: '技能不存在' };
    return { success: true, data: skill };
  }

  @Del('/:id')
  async delete(@Param('id') id: string) {
    const ok = await this.skillService.delete(id);
    if (!ok) return { success: false, message: '技能不存在' };
    return { success: true };
  }
}
