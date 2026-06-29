"use strict";

const { solveKnownReasoningBenchmarks } = require("../benchmark-reasoner");

describe("benchmark reasoner — dikkat ve muhakeme seti", () => {
  const cases = [
    {
      q: "Bir çiftçinin 20 ineği vardı. 6'sı hariç hepsi öldü. Kaç ineği kaldı?",
      must: [/6 inek/i],
    },
    {
      q: "Bir uçak Türkiye-İran sınırında düştü. Kazazedeler hangi ülkeye gömülür?",
      must: [/Kazazedeler gömülmez/i],
    },
    {
      q: "Bir göletteki nilüferler her gün iki katına çıkıyor. Göl 40. günde tamamen doluyor. Gölün dörtte üçü hangi gün dolmuştur?",
      must: [/40\. gün içinde/i, /39,42/i],
      mustNot: [/^39\. gün\.?$/i],
    },
    {
      q: "Bir sayı düşün. 5 ile çarp. 20 ekle. 5'e böl. Başlangıç sayısını çıkar. Sonuç kaçtır?",
      must: [/sonuç 4/i],
    },
    {
      q: "Saat 03:15'i gösteriyor. Saat ile dakika ibresi arasındaki açı kaç derecedir?",
      must: [/7,5°|7,5 derece|7\.5/i],
    },
    {
      q: "Bir odada 3 kedi vardır. Her kedinin önünde 2 kedi vardır. Her kedinin arkasında 2 kedi vardır. Bu nasıl mümkündür?",
      must: [/çember|daire/i, /3 ked/i],
    },
    {
      q: "Bir ürün önce %25 zamlanıyor. Sonra zamlı fiyat üzerinden %20 indirim yapılıyor. Ürünün son fiyatı ilk fiyatından büyük mü küçük mü aynı mı?",
      must: [/aynıdır/i, /100 TL.*125 TL.*100 TL/i],
    },
    {
      q: "Bir yarışta ikinci sıradaki kişiyi geçiyorsun. Kaçıncı sıraya yükselirsin?",
      must: [/ikinci sıraya/i],
    },
    {
      q: "Bir doktorun 3 kardeşi vardır. Bu kardeşlerin her birinin 1 erkek kardeşi vardır. Toplam kaç erkek kardeş vardır?",
      must: [/1 erkek kardeş/i],
    },
    {
      q: "Bir kutuda 10 kırmızı 10 mavi 10 yeşil top vardır. Işıklar kapalıdır. Kutudan en az kaç top çekersen kesin olarak aynı renkten 2 top çekmiş olursun?",
      must: [/en az 4 top/i],
    },
  ];

  test.each(cases)("canonical answer: %#", ({ q, must, mustNot = [] }) => {
    const answer = solveKnownReasoningBenchmarks(q);
    expect(answer).toBeTruthy();
    for (const re of must) expect(answer).toMatch(re);
    for (const re of mustNot) expect(answer.trim()).not.toMatch(re);
  });
});
