import { Controller, Get, Post, Del, Inject, Param, Body } from '@midwayjs/core';
import { KnowledgeService } from '../service/knowledge.service';

/**
 * 知识库 API 控制器
 */
@Controller('/api/knowledge')
export class KnowledgeController {
  @Inject()
  knowledgeService: KnowledgeService;

  /**
   * 获取文档列表
   */
  @Get('/docs')
  async listDocs() {
    const docs = await this.knowledgeService.listDocuments();
    return {
      success: true,
      data: docs.map(d => ({
        id: d.id,
        name: d.name,
        chunkCount: d.chunkCount,
        createdAt: d.createdAt,
        // 不返回完整内容，节省带宽
        preview: d.content.slice(0, 200) + (d.content.length > 200 ? '...' : ''),
      })),
    };
  }

  /**
   * 上传文档
   */
  @Post('/docs')
  async uploadDoc(@Body() body: { name: string; content: string }) {
    const doc = await this.knowledgeService.importDocument(body.name, body.content);
    return { success: true, data: doc };
  }

  /**
   * 删除文档
   */
  @Del('/docs/:id')
  async deleteDoc(@Param('id') id: string) {
    await this.knowledgeService.deleteDocument(id);
    return { success: true };
  }

  /**
   * 获取文档的分片列表
   */
  @Get('/docs/:id/chunks')
  async getChunks(@Param('id') id: string) {
    const chunks = await this.knowledgeService.getDocChunks(id);
    return { success: true, data: chunks };
  }

  /**
   * 搜索知识库（简单搜索）
   */
  @Post('/search')
  async search(@Body() body: { query: string; topK?: number }) {
    const results = await this.knowledgeService.search(body.query, body.topK);
    return { success: true, data: results };
  }

  /**
   * RAG 检索（返回完整管线信息）
   */
  @Post('/rag')
  async ragSearch(@Body() body: { query: string; topK?: number }) {
    const result = await this.knowledgeService.ragSearch(body.query, body.topK);
    return {
      success: true,
      data: {
        context: result.context,
        sources: result.sources,
        debug: result.debug,
      },
    };
  }
}
