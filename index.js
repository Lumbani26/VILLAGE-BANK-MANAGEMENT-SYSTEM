//tabs

const tabs = document.querySelectorAll(".tabs li");
const tabContents = document.querySelectorAll("#tabbed-content > div");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((item) => item.classList.remove("is-active"));
    tab.classList.add("is-active");

    const target = tab.dataset.target;

    tabContents.forEach((tabContent) => {
      if (tabContent.id === target) {
        tabContent.classList.remove("is-hidden");
      } else {
        tabContent.classList.add("is-hidden");
      }
    });
  });
});
