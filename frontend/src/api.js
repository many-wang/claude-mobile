import axios from 'axios';

const unwrap = (request) => request.then((response) => response.data);

const getApiUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return '/api';
  }

  return 'https://claude-mobile-production-2a5d.up.railway.app/api';
};

const API_URL = getApiUrl();

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

export const getProjects = () => unwrap(api.get('/projects'));
export const createProject = (data) => unwrap(api.post('/projects', data));
export const deleteProject = (id) => unwrap(api.delete(`/projects/${id}`));
export const getProjectConversations = (projectId) =>
  unwrap(api.get(`/projects/${projectId}/conversations`));

export const createConversation = (data) => unwrap(api.post('/conversations', data));
export const getConversation = (id) => unwrap(api.get(`/conversations/${id}`));
export const sendMessage = (conversationId, content, model) =>
  unwrap(api.post(`/conversations/${conversationId}/messages`, { content, model }));
export const exportConversation = (id) =>
  api.get(`/conversations/${id}/export`, { responseType: 'blob' });

export const searchMessages = (query, filters = {}) =>
  unwrap(api.get('/search', {
    params: {
      q: query,
      ...filters,
    },
  }));

export default api;
