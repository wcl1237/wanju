import { Controller, Get, Post, Del, Inject, Param, Body } from '@midwayjs/core';
import { KnowledgeService } from '../../domain/knowledge/service/knowledge.service';

@Controller('/api/knowledge')
export class KnowledgeController {
  @Inject()
  knowledgeService: KnowledgeService;

  @Get('/docs')
  async listDocs() {
    const docs = await this.knowledgeService.listDocuments();
    return {
      success: true,
      data: docs.map(d => ({
        id: d.id, name: d.name, chunkCount: d.chunkCount, createdAt: d.createdAt,
        preview: d.content.slice(0, 200) + (d.content.length > 200 ? '...' : ''),
      })),
    };
  }

  @Post('/docs')
  async uploadDoc(@Body() body: { name: string; content: string }) {
    const doc = await this.knowledgeService.importDocument(body.name, body.content);
    return { success: true, data: doc };
  }

  @Del('/docs/:id')
  async deleteDoc(@Param('id') id: string) {
    await this.knowledgeService.deleteDocument(id);
    return { success: true };
  }

  @Get('/docs/:id/chunks')
  async getChunks(@Param('id') id: string) {
    const chunks = await this.knowledgeService.getDocChunks(id);
    return { success: true, data: chunks };
  }

  @Post('/search')
  async search(@Body() body: { query: string; topK?: number }) {
    const results = await this.knowledgeService.search(body.query, body.topK);
    return { success: true, data: results };
  }

  @Post('/rag')
  async ragSearch(@Body() body: { query: string; topK?: number }) {
    const result = await this.knowledgeService.ragSearch(body.query, body.topK);
    return {
      success: true,
      data: { context: result.context, sources: result.sources, debug: result.debug },
    };
  }
}
