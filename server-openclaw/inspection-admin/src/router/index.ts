import { createRouter, createWebHistory } from "vue-router";

const routes = [
  {
    path: "/",
    name: "dashboard",
    component: () => import("@/views/DashboardView.vue"),
  },
  {
    path: "/stores",
    name: "stores",
    component: () => import("@/views/StoresView.vue"),
  },
  {
    path: "/streams",
    name: "streams",
    component: () => import("@/views/StreamsView.vue"),
  },
  {
    path: "/plans",
    name: "plans",
    component: () => import("@/views/PlansView.vue"),
  },
  {
    path: "/template-library",
    name: "template-library",
    component: () => import("@/views/TemplateLibraryView.vue"),
  },
  {
    path: "/bindings",
    name: "bindings",
    component: () => import("@/views/BindingsView.vue"),
  },
  {
    path: "/jobs",
    name: "jobs",
    component: () => import("@/views/JobsView.vue"),
  },
];

export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});
