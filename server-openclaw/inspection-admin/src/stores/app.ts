import { ref } from "vue";
import { defineStore } from "pinia";

export const useAppStore = defineStore("app", () => {
  const pageTitle = ref("门店智能巡检平台");

  function setPageTitle(title: string) {
    pageTitle.value = title;
  }

  return {
    pageTitle,
    setPageTitle,
  };
});
