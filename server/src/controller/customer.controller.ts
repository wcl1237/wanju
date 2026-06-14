import { Controller, Get, Inject, Query } from '@midwayjs/core';
import { CustomerService } from '../service/customer.service';

@Controller('/api/customers')
export class CustomerController {
  @Inject()
  customerService: CustomerService;

  @Get('/')
  async list() {
    const profiles = await this.customerService.list();
    return { success: true, data: profiles };
  }

  @Get('/by-conversation')
  async getByConversation(@Query('conversationId') conversationId: string) {
    if (!conversationId) {
      return { success: false, message: 'conversationId 必填' };
    }
    const profile = await this.customerService.getByConversation(conversationId);
    return { success: true, data: profile };
  }
}
