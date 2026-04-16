import axios from "axios";

const http = axios.create({
  baseURL: "/inspection-api/api",
  timeout: 15000,
});

http.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error?.response?.data?.message || error?.message || "Request failed";
    return Promise.reject(new Error(message));
  },
);

export default http;
