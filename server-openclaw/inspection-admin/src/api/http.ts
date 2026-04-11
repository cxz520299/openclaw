import axios from "axios";

const http = axios.create({
  baseURL: "/inspection-api/api",
  timeout: 15000,
});

http.interceptors.response.use((response) => response.data);

export default http;
