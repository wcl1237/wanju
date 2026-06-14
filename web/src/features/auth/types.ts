export interface User {
  id: string;
  username: string;
}

export interface LoginDTO {
  username: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  data?: {
    token: string;
    user: User;
  };
}
