import api from './client';

export interface LoginResponse {
  token: string;
  user: { id: number; username: string; role: string; display_name: string };
}

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'manager' | 'viewer';
  display_name: string;
  is_active?: number;
  created_at?: string;
}

export const login = (username: string, password: string) =>
  api.post<LoginResponse>('/auth/login', { username, password }).then((r) => r.data);

export const fetchMe = () =>
  api.get<User>('/auth/me').then((r) => r.data);

export const fetchUsers = () =>
  api.get<User[]>('/users').then((r) => r.data);

export const createUser = (data: { username: string; password: string; role: string; display_name?: string }) =>
  api.post<User>('/users', data).then((r) => r.data);

export const updateUser = (id: number, data: Partial<User & { password: string }>) =>
  api.put<User>(`/users/${id}`, data).then((r) => r.data);
