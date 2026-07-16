/**
 * FAQPage для страницы «Доп. информация».
 *
 * Она и так построена как «вопрос — ответ» (четыре способа найти запчасть, что
 * видно в ответе, доставка, кабинет), поэтому размечаем её как FAQ: в выдаче
 * Google и Яндекса такие блоки могут раскрываться прямо в сниппете и занимать
 * больше места.
 *
 * Правило Google: в разметке должен быть ровно тот текст, который видит
 * человек. Поэтому берём те же строки из messages, что рендерит страница, —
 * ничего не сочиняем.
 */
export function SeoFaqJsonLd({
  items,
}: {
  items: { title: string; body: string }[];
}) {
  if (!items.length) return null;

  const json = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.title,
      acceptedAnswer: { "@type": "Answer", text: i.body },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  );
}
