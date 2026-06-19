/**
 * Health Controller — 健康检查
 */
import { Controller, Get } from '@midwayjs/core';

@Controller('/api')
export class HealthController {
  @Get('/health')
  async health() {
    return {
      success: true,
      data: {
        status: 'healthy',
        timestamp: Date.now(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      },
    };
  }
}
