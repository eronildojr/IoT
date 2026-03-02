import axios from 'axios'

const api = axios.create({ baseURL: '/api', timeout: 15000 })

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('iot_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('iot_token')
      localStorage.removeItem('iot_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

export const authApi = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  register: (data: any) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
}

export const devicesApi = {
  list: (p?: any) => api.get('/devices', { params: p }),
  stats: () => api.get('/devices/stats'),
  get: (id: string) => api.get(`/devices/${id}`),
  create: (d: any) => api.post('/devices', d),
  update: (id: string, d: any) => api.put(`/devices/${id}`, d),
  delete: (id: string) => api.delete(`/devices/${id}`),
  telemetry: (id: string, p?: any) => api.get(`/devices/${id}/telemetry`, { params: p }),
  ingest: (id: string, data: any) => api.post(`/devices/${id}/telemetry`, { data }),
}

export const modelsApi = {
  list: (p?: any) => api.get('/device-models', { params: p }),
  categories: () => api.get('/device-models/categories'),
}

export const alertsApi = {
  list: (p?: any) => api.get('/alerts', { params: p }),
  unreadCount: () => api.get('/alerts/unread-count'),
  markRead: (id: string) => api.put(`/alerts/${id}/read`),
  markAllRead: () => api.put('/alerts/read-all'),
  rules: {
    list: () => api.get('/alerts/rules'),
    create: (d: any) => api.post('/alerts/rules', d),
    update: (id: string, d: any) => api.put(`/alerts/rules/${id}`, d),
    delete: (id: string) => api.delete(`/alerts/rules/${id}`),
  }
}

export const automationsApi = {
  list: () => api.get('/automations'),
  create: (d: any) => api.post('/automations', d),
  update: (id: string, d: any) => api.put(`/automations/${id}`, d),
  delete: (id: string) => api.delete(`/automations/${id}`),
}

export const usersApi = {
  list: () => api.get('/users'),
  create: (d: any) => api.post('/users', d),
  update: (id: string, d: any) => api.put(`/users/${id}`, d),
  delete: (id: string) => api.delete(`/users/${id}`),
}

export const traccarApi = {
  status: () => api.get('/traccar/status'),
  devices: () => api.get('/traccar/devices'),
  positions: () => api.get('/traccar/positions'),
  history: (deviceId: string, from: string, to: string) => api.get(`/traccar/history/${deviceId}`, { params: { from, to } }),
  configure: (d: any) => api.post('/traccar/configure', d),
}

export const superadminApi = {
  tenants: () => api.get('/superadmin/tenants'),
  createTenant: (d: any) => api.post('/superadmin/tenants', d),
  updateTenant: (id: string, d: any) => api.put(`/superadmin/tenants/${id}`, d),
}

export const apiKeysApi = {
  list: () => api.get('/api-keys'),
  create: (d: any) => api.post('/api-keys', d),
  delete: (id: string) => api.delete(`/api-keys/${id}`),
}
