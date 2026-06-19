/**
 * Message Controller — 对话消息查询 REST API
 *
 * 暴露 MessageStore 中的对话数据，供主服务代理获取。
 * 返回结果包含流式状态标记，支持页面加载时获取正在流式输出的内容。
 */
import { Controller, Get, Post, Inject, Query } from '@midwayjs/core';
import { MessageStore } from '../../persistence/message-store';

@Controller('/api/messages')
export class MessageController {
  @Inject()
  messageStore: MessageStore;

  /** 获取全部消息（含正在流式输出的消息） */
  @Get('/')
  async getAll() {
    const messages = await this.messageStore.getAll();
    return {
      success: true,
      data: messages,
      streaming: this.messageStore.isCurrentlyStreaming(),
    };
  }

  /** 获取最近 N 条消息 */
  @Get('/recent')
  async getRecent(@Query('limit') limit: string) {
    const n = parseInt(limit) || 50;
    const messages = await this.messageStore.getRecent(n);
    return {
      success: true,
      data: messages,
      streaming: this.messageStore.isCurrentlyStreaming(),
    };
  }

  /** 清空消息历史 */
  @Post('/clear')
  async clear() {
    await this.messageStore.clear();
    return { success: true };
  }
}
