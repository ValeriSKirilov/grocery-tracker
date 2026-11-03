const compareButton = document.querySelector("#compare-button");
const resultMessage = document.querySelector("#results-message");
const storeResults = document.querySelector("#store-results");

const demoPrices = [
  { name: "Billa", total: 18.40 },
  { name: "Kaufland", total: 19.85 },
  { name: "Fantastico", total: 21.25 }
];

compareButton.addEventListener("click", () => {
    resultMessage.textContent = "Примерни цени за демонстрация:";

    const cheapestPrice = Math.min(...demoPrices.map(store => store.total));

    storeResults.replaceChildren();

    demoPrices.forEach((store) => {
      const card = document.createElement("article");
      card.className = "store-card";

      if (store.total === cheapestPrice) {
        card.classList.add("cheapest");
      }

      const name = document.createElement("h3");
      name.textContent = store.name;

      const price = document.createElement("p");
      price.textContent = `Общо: ${store.total.toFixed(2)} €`;

      card.append(name, price);
      storeResults.append(card);
    });
});

const themeToggle = document.querySelector("#theme-toggle");
const themeIcon = document.querySelector("#theme-icon");
const themeText = document.querySelector("#theme-text");

const savedTheme =
  localStorage.getItem("grocery-tracker-theme") || "light";

document.documentElement.dataset.theme = savedTheme;

function updateThemeButton() {
  const isDark = document.documentElement.dataset.theme === "dark";

  themeIcon.textContent = isDark ? "☀️" : "🌙";
  themeText.textContent = isDark ? "Light Theme" : "Dark Theme";
  themeToggle.setAttribute("aria-pressed", String(isDark));
}

themeToggle.addEventListener("click", () => {
  const isDark = document.documentElement.dataset.theme === "dark";
  const newTheme = isDark ? "light" : "dark";

  document.documentElement.dataset.theme = newTheme;
  localStorage.setItem("grocery-tracker-theme", newTheme);

  updateThemeButton();
});

updateThemeButton();