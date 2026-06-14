import { Provide, Scope, ScopeEnum } from '@midwayjs/core';
import { InjectEntityModel } from '@midwayjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { CustomerProfileEntity } from '../entity/customer-profile.entity';

export interface CustomerProfile {
  id: string;
  conversationId?: string;
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
  position?: string;
  requirement?: string;
  extra?: string;
  status: 'partial' | 'complete';
  createdAt: string;
  updatedAt: string;
}

export interface SaveCustomerInfoDTO {
  conversationId?: string;
  name?: string;
  phone?: string;
  email?: string;
  company?: string;
  position?: string;
  requirement?: string;
  extra?: string;
}

@Provide()
@Scope(ScopeEnum.Singleton)
export class CustomerService {
  @InjectEntityModel(CustomerProfileEntity)
  profileRepo: Repository<CustomerProfileEntity>;

  async saveOrUpdate(dto: SaveCustomerInfoDTO): Promise<CustomerProfile> {
    const now = new Date().toISOString();

    let existing: CustomerProfileEntity | null = null;
    if (dto.conversationId) {
      existing = await this.profileRepo.findOne({
        where: { conversationId: dto.conversationId },
        order: { createdAt: 'DESC' },
      });
    }

    if (existing) {
      const merged = {
        name: dto.name || existing.name,
        phone: dto.phone || existing.phone,
        email: dto.email || existing.email,
        company: dto.company || existing.company,
        position: dto.position || existing.position,
        requirement: dto.requirement || existing.requirement,
        extra: dto.extra || existing.extra,
      };
      const status = this.checkComplete(merged) ? 'complete' : 'partial';

      await this.profileRepo.update(existing.id, { ...merged, status, updatedAt: now });
      return this.toProfile({ ...existing, ...merged, status, updatedAt: now } as any);
    } else {
      const id = uuidv4();
      const status = this.checkComplete(dto) ? 'complete' : 'partial';
      const entity = this.profileRepo.create({
        id,
        conversationId: dto.conversationId || null,
        name: dto.name || null,
        phone: dto.phone || null,
        email: dto.email || null,
        company: dto.company || null,
        position: dto.position || null,
        requirement: dto.requirement || null,
        extra: dto.extra || null,
        status,
        createdAt: now,
        updatedAt: now,
      });
      await this.profileRepo.save(entity);
      return this.toProfile(entity);
    }
  }

  async getByConversation(conversationId: string): Promise<CustomerProfile | null> {
    const row = await this.profileRepo.findOne({
      where: { conversationId },
      order: { updatedAt: 'DESC' },
    });
    return row ? this.toProfile(row) : null;
  }

  async list(): Promise<CustomerProfile[]> {
    const rows = await this.profileRepo.find({ order: { updatedAt: 'DESC' } });
    return rows.map(r => this.toProfile(r));
  }

  private checkComplete(info: Partial<SaveCustomerInfoDTO>): boolean {
    return !!(info.name && info.phone);
  }

  private toProfile(e: CustomerProfileEntity): CustomerProfile {
    return {
      id: e.id,
      conversationId: e.conversationId || undefined,
      name: e.name || undefined,
      phone: e.phone || undefined,
      email: e.email || undefined,
      company: e.company || undefined,
      position: e.position || undefined,
      requirement: e.requirement || undefined,
      extra: e.extra || undefined,
      status: e.status as any,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }
}
