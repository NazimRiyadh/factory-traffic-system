import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const getHealth = () => api.get('/health');
export const getJunctions = () => api.get('/junctions');
export const getJunctionStatus = (id) => api.get(`/junctions/${id}/status`);
export const getJunctionHistory = (id, limit = 50) =>
  api.get(`/junctions/${id}/history`, { params: { limit } });

export const submitSensorEvent = (event) => api.post('/sensor-events', event);
export const submitCommand = (junctionId, command) =>
  api.post(`/junctions/${junctionId}/commands`, command);
export const submitControllerEvent = (event) =>
  api.post('/controller-events', event);
export const simulateAck = (junctionId) =>
  api.post(`/junctions/${junctionId}/simulate-ack`);

export default api;
