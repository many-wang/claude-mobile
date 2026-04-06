import axios from 'axios';

const getApiUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return '/api';
  }

  return `http://${hostname}:3000/api`;
};

const API_URL = getApiUrl();

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

// 项目相关
export const getProjects = () => api.get('/projects');
export const createProject = (data) => api.post('/projects', data);
export const deleteProject = (id) => api.delete(`/projects/${id}`);
export const getProjectConversations = (projectId) =>
  api.get(`/projects/${projectId}/conversations`);

// 对话相关
export const createConversation = (data) => api.post('/conversations', data);
export const getConversation = (id) => api.get(`/conversations/${id}`);
export const sendMessage = (conversationId, content) =>
  api.post(`/conversations/${conversationId}/messages`, { content });
export const exportConversation = (id) =>
  api.get(`/conversations/${id}/export`, { responseType: 'blob' });

// 搜索
export const searchMessages = (query) => api.get(`/search?q=${encodeURIComponent(query)}`);

export default api;
