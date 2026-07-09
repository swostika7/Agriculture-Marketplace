import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export const productsAPI = {
  getAll:       p       => api.get('/products', { params: p }),
  getFarmer:    ()      => api.get('/products/farmer'),
  getById:      id      => api.get(`/products/${id}`),
  trackView:    id      => api.post(`/products/${id}/view`).catch(() => {}),
  create:       d       => api.post('/products', d),
  update:       (id, d) => api.put(`/products/${id}`, d),
  delete:       id      => api.delete(`/products/${id}`),
  recommend:    d       => api.post('/products/recommend', d),
  // Hybrid search: Trie prefix + CBF recommendations
  hybridSearch: d       => api.post('/search/hybrid', d),
  suggestions:  q       => api.get('/search/suggestions', { params: { q } }),
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
  getMessages:       convId                    => api.get(`/conversations/${convId}/messages`),
  editMessage:       (msgId, text)             => api.put(`/messages/${msgId}`, { text }),
  deleteMessage:     msgId                     => api.delete(`/messages/${msgId}`),
  uploadFile:        formData                  => api.post('/upload/chat', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
};

// eSewa + COD only (Khalti removed)
export const paymentAPI = {
  // Full eSewa payment (100% of order total → credited to eSewa: 9741677342)
  esewaInitiate:      orderId         => api.post('/payment/esewa/initiate', { orderId }),
  esewaVerify:        (data, orderId) => api.post('/payment/esewa/verify', { data, orderId }),
  // COD: 25% advance via eSewa, 75% cash on delivery
  codAdvanceInitiate: orderId         => api.post('/payment/cod-advance/initiate', { orderId }),
  codAdvanceVerify:   (data, orderId) => api.post('/payment/cod-advance/verify', { data, orderId }),
};

export const analyticsAPI = {
  get: () => api.get('/analytics'),
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
