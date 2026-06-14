/**
 * 跨域共享的基础类型
 */

/** 统一 API 响应格式 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
}
