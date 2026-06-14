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
