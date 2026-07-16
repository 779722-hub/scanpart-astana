import { Manrope } from "next/font/google";

/**
 * Шрифт объявлен отдельным модулем, потому что <html> теперь рендерится не в
 * корневом layout, а в двух местах: у локали (там известен язык страницы) и у
 * приложения курьера. Класс с переменной шрифта нужен обоим.
 */
export const manrope = Manrope({
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  display: "swap",
  variable: "--font-manrope",
});
