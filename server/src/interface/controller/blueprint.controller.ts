import { Controller, Get, Post, Put, Del, Inject, Param, Body } from '@midwayjs/core';
import { BlueprintService } from '../../domain/blueprint/service/blueprint.service';
import { CreateBlueprintDTO, UpdateBlueprintDTO } from '../../domain/blueprint/model/blueprint.model';

@Controller('/api/blueprints')
export class BlueprintController {
  @Inject()
  blueprintService: BlueprintService;

  @Get('/')
  async getAll() {
    const blueprints = await this.blueprintService.getAll();
    return { success: true, data: blueprints };
  }

  @Get('/:id')
  async getById(@Param('id') id: string) {
    const blueprint = await this.blueprintService.getById(id);
    if (!blueprint) return { success: false, message: '蓝图不存在' };
    return { success: true, data: blueprint };
  }

  @Post('/')
  async create(@Body() body: CreateBlueprintDTO) {
    const blueprint = await this.blueprintService.create(body);
    return { success: true, data: blueprint };
  }

  @Put('/:id')
  async update(@Param('id') id: string, @Body() body: UpdateBlueprintDTO) {
    const blueprint = await this.blueprintService.update(id, body);
    if (!blueprint) return { success: false, message: '蓝图不存在' };
    return { success: true, data: blueprint };
  }

  @Del('/:id')
  async delete(@Param('id') id: string) {
    try {
      await this.blueprintService.delete(id);
      return { success: true };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }
}
