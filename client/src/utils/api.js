import axios from 'axios';

const TOKEN_KEY = 'agri_token_v5';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(config => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// If the backend ever rejects a token (expired/invalid), clear it so the
// user isn't stuck in a half-authenticated state on the next request.
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
    }
    return Promise.reject(err);
  }
);

export const productsAPI = {
  getAll:    p       => api.get('/products', { params: p }),
  getFarmer: ()      => api.get('/products/farmer'),
  getById:   id      => api.get(`/products/${id}`),
  trackView: id      => api.post(`/products/${id}/view`).catch(() => {}),
  create:    d       => api.post('/products', d),
  update:    (id, d) => api.put(`/products/${id}`, d),
  delete:    id      => api.delete(`/products/${id}`),
  recommend: d       => api.post('/products/recommend', d),
};

export const routeAPI = {
  optimise:      id => api.get(`/optimize-route/${id}`),
  preview:       d  => api.post('/optimize-route/preview', d),
  nearestFarmers:(lat, lng, limit) => api.get('/nearest-farmers', { params: { lat, lng, limit } }),
};

export const ordersAPI = {
  getAll:    ()        => api.get('/orders'),
  getHistory:()        => api.get('/orders/history'),
  create:    d         => api.post('/orders', d),
  setStatus: (id, s)   => api.patch(`/orders/${id}/status`, { status: s }),
};

export const cartAPI = {
  get:      ()                    => api.get('/cart'),
  add:      (productID, quantity) => api.post('/cart', { productID, quantity }),
  update:   (itemId, quantity)    => api.patch(`/cart/${itemId}`, { quantity }),
  remove:   itemId                => api.delete(`/cart/${itemId}`),
  clear:    ()                    => api.delete('/cart'),
  checkout: deliveryAddress       => api.post('/cart/checkout', { deliveryAddress }),
};

export const reviewsAPI = {
  getByProduct: id => api.get(`/reviews/${id}`),
  getByFarmer:  id => api.get(`/reviews/farmer/${id}`),
  submit:       d  => api.post('/reviews', d),
};

export const notificationsAPI = {
  getAll:      () => api.get('/notifications'),
  markRead:    id => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
};

export const chatAPI = {
  getConversations:  ()                        => api.get('/conversations'),
  startConversation: (otherUserID, productID)  => api.post('/conversations', { otherUserID, productID }),
  getMessages:       (convId, before) => api.get(`/conversations/${convId}/messages`, { params: before ? { before } : {} }),
  editMessage:       (msgId, text)             => api.put(`/messages/${msgId}`, { text }),
  deleteMessage:     msgId                     => api.delete(`/messages/${msgId}`),
  uploadFile:        formData                  => api.post('/upload/chat', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
};

// Khalti + COD with 25% Khalti advance
export const paymentAPI = {
  // Full Khalti payment (100% of order total)
  khaltiInitiate:     orderId        => api.post('/payment/khalti/initiate', { orderId }),
  khaltiVerify:       (pidx,orderId) => api.post('/payment/khalti/verify',   { pidx, orderId }),
  // COD: 25% advance via Khalti, 75% cash on delivery
  codAdvanceInitiate: orderId        => api.post('/payment/cod-advance/initiate', { orderId }),
  codAdvanceVerify:   (pidx,orderId) => api.post('/payment/cod-advance/verify',   { pidx, orderId }),
};

export const analyticsAPI = {
  get: () => api.get('/analytics'),
};

export const adminAPI = {
  getFarmers:  params  => api.get('/admin/farmers', { params }),
  deactivate:  id      => api.patch(`/admin/farmers/${id}/deactivate`),
  reactivate:  id      => api.patch(`/admin/farmers/${id}/reactivate`),
};

export const recEventsAPI = {

  log: payload => api.post('/recommendations/event', payload).catch(() => {}),
};

export const mlAPI = {
  demandForecast: productId => api.get(`/ml/demand-forecast/${productId}`),
};

export const authAPI = {
  checkEmail:        email                          => api.get('/auth/check-email', { params: { email } }),
  verifyEmail:       (email,otp)                   => api.post('/auth/verify-email', { email, otp }),
  resendOTP:         email                         => api.post('/auth/resend-otp', { email }),
  forgotPassword:    email                         => api.post('/auth/forgot-password', { email }),
  verifyResetOTP:    (email,otp)                   => api.post('/auth/verify-reset-otp', { email, otp }),
  resetPassword:     (email,resetToken,newPassword)=> api.post('/auth/reset-password', { email, resetToken, newPassword }),
  googleComplete:    (pendingToken, role)           => api.post('/auth/google/complete', { pendingToken, role }),
};

export const marketAPI = {
  insights: () => api.get('/market-insights'),
};

export default api;
