import { currencies } from "countries-list/currencies";
import { countries } from "countries-list";

console.log(
  "Currency dataset loaded:",
  Object.keys(currencies).length,
  "currencies"
);

console.log(
  "Country dataset loaded:",
  Object.keys(countries).length,
  "countries"
);


export async function loadCurrencyOptions() {
  const currencyOptions = [];

  Object.entries(currencies).forEach(([currencyCode, currencyData]) => {
    const countryNames = [];

    Object.entries(countries).forEach(
      ([, countryData]) => {
        if (
          Array.isArray(countryData.currency) &&
          countryData.currency.includes(currencyCode)
        ) {
          countryNames.push(countryData.name);
        }
      }
    );

    currencyOptions.push({
      code: currencyCode,
      name: currencyData.name,
      symbol: currencyData.symbol,
      countryNames,
    });
  });

  return currencyOptions;
}
